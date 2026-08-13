import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ClipboardList,
  Filter,
  FileBarChart2,
  Loader2,
  BookOpen,
  UserPlus,
  AlertOctagon,
  ArrowRight,
  LayoutDashboard,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Farol } from "@/components/farol";
import { GestaoRecursos } from "@/components/gestao-recursos";
import { PendenciasAbertas } from "@/components/pendencias-abertas";
import { MelhoriasERotina } from "@/components/melhorias-rotina";
import { agruparPendencias } from "@/lib/farol/grupos";
import { avaliarMelhorias, avaliarRotinaLideranca } from "@/lib/farol/eficacia";
import { montarFarol, ROTINA_ENCHEDORA_3 } from "@/lib/farol/farol";
import { levantarPendencias } from "@/lib/farol/pendencias";
import { buscarPlanos } from "@/lib/farol/planos-storage";
import type { PlanoAcao } from "@/lib/farol/planos-types";
import { calcularDataOperacional } from "@/lib/operacao/data-operacional";
import { useChecklistsRemote } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { contarNcNrUltimosDias } from "@/lib/checklist/nao-conformidades";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import type { LimpezaTurnoRow, PtpJanelaRow } from "@/lib/verso/mappers";
import { limpezaTurnoFromRow, ptpJanelaFromRow } from "@/lib/verso/mappers";
import type { LimpezaTurno, PtpJanela } from "@/lib/verso/types";

export const Route = createFileRoute("/gestao/")({
  head: () => ({
    meta: [
      { title: "Gestão Industrial — Checklist Operacional" },
      {
        name: "description",
        content: "Painel da Gestão Industrial para consultar checklists e não conformidades.",
      },
    ],
  }),
  component: GestaoHome,
});

const DIAS_NCNR = 30;

function GestaoHome() {
  const { usuario, loading } = useGuard("gestao");
  const {
    data: checklists,
    loading: carregandoChecklists,
    error: erroChecklists,
  } = useChecklistsRemote({ realtime: true });
  const [turnosLimpeza, setTurnosLimpeza] = useState<LimpezaTurno[]>([]);
  const [planos, setPlanos] = useState<PlanoAcao[]>([]);
  const [recarga, setRecarga] = useState(0);

  // Lista vazia e lista ainda nao carregada sao a mesma coisa em memoria e
  // coisas opostas na fabrica: uma diz "nao ha pendencia", a outra "eu ainda
  // nao sei". Sem estes dois flags a tela pintava "ciclo em dia" no instante
  // anterior aos dados chegarem — verde por ignorancia, que e a unica cor que
  // este painel nao pode mostrar.
  //
  // So travam a PRIMEIRA carga: como nunca voltam a true, o botao de recarregar
  // atualiza sem piscar a tela inteira.
  const [carregandoLimpeza, setCarregandoLimpeza] = useState(true);
  const [carregandoPlanos, setCarregandoPlanos] = useState(true);

  const [ptp, setPtp] = useState<PtpJanela[]>([]);
  const [carregandoPtp, setCarregandoPtp] = useState(true);
  const [erroLimpeza, setErroLimpeza] = useState("");
  const [erroPlanos, setErroPlanos] = useState("");
  const [erroPtp, setErroPtp] = useState("");

  const hoje = calcularDataOperacional(usuario?.equipePadrao, usuario?.turnoPadrao);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      setErroLimpeza("");
      // SEM filtro de data: o passivo não mora nos últimos 30 dias. A limpeza
      // sem validação mais antiga é de 24/04 — cortar em 30 dias esconderia
      // justamente as que mais envergonham. O card de NC/NR abaixo continua
      // usando a janela de DIAS_NCNR, que é outra pergunta.
      const { data, error } = await supabase
        .from("limpeza_turnos" as never)
        .select("*")
        .order("data_operacao", { ascending: false });
      if (cancelado) return;
      if (error) {
        console.error("[gestao.index] limpeza fetch:", error);
        setTurnosLimpeza([]);
        setErroLimpeza("Nao foi possivel carregar a limpeza operacional.");
        setCarregandoLimpeza(false);
        return;
      }
      setTurnosLimpeza(((data ?? []) as unknown as LimpezaTurnoRow[]).map(limpezaTurnoFromRow));
      setCarregandoLimpeza(false);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      setErroPlanos("");
      try {
        const p = await buscarPlanos();
        if (!cancelado) setPlanos(p);
      } catch (error) {
        console.error("[gestao.index] planos:", error);
        if (!cancelado) setErroPlanos("Nao foi possivel carregar os planos de acao.");
      } finally {
        if (!cancelado) setCarregandoPlanos(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      setErroPtp("");
      // Desde o início oficial do piloto: ocorrência PTP não desaparece
      // quando o dia vira; ela permanece até receber plano eficaz.
      const { data, error } = await supabase
        .from("ptp_janelas" as never)
        .select("*")
        .gte("data_operacao", ROTINA_ENCHEDORA_3.vigenteDesde)
        .lte("data_operacao", hoje);
      if (cancelado) return;
      if (error) {
        console.error("[gestao.index] ptp:", error);
        setErroPtp("Nao foi possivel carregar o PTP.");
        setCarregandoPtp(false);
        return;
      }
      setPtp(((data ?? []) as unknown as PtpJanelaRow[]).map(ptpJanelaFromRow));
      setCarregandoPtp(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [hoje]);

  // O passivo da linha — o mesmo que o líder vê, para a conversa ser a mesma.
  const pendencias = useMemo(
    () => levantarPendencias({ checklists, limpezas: turnosLimpeza, ptp, planos, hoje }),
    [checklists, turnosLimpeza, ptp, planos, hoje],
  );

  const linhasFarol = useMemo(
    () =>
      montarFarol({
        checklists,
        limpezas: turnosLimpeza,
        ptp,
        data: hoje,
        hoje,
        pendencias,
        modo: "estado",
      }),
    [checklists, turnosLimpeza, ptp, hoje, pendencias],
  );

  // "Avaliar Melhorias" e "Análise cump. Rotina Sup/Coord." — as duas
  // tarefas do papel que ainda não tinham tela.
  const grupos = useMemo(() => agruparPendencias(pendencias, planos), [pendencias, planos]);

  // Melhoria se mede sobre o histórico INTEIRO, incluindo o que já foi
  // encerrado. Usando só o que está aberto, um problema eliminado some junto
  // com a prova de que foi eliminado — o "antes" da comparação vira zero e o
  // painel não consegue mostrar nenhum ganho.
  const gruposHistoricos = useMemo(
    () =>
      agruparPendencias(
        levantarPendencias({
          checklists,
          limpezas: turnosLimpeza,
          ptp,
          planos,
          hoje,
          incluirEncerradas: true,
        }),
        planos,
      ),
    [checklists, turnosLimpeza, ptp, planos, hoje],
  );
  const melhorias = useMemo(
    () => avaliarMelhorias(gruposHistoricos, hoje),
    [gruposHistoricos, hoje],
  );
  const rotina = useMemo(
    () => avaliarRotinaLideranca(grupos, planos, hoje),
    [grupos, planos, hoje],
  );

  const ncnr = useMemo(
    () => contarNcNrUltimosDias(checklists, turnosLimpeza, DIAS_NCNR),
    [checklists, turnosLimpeza],
  );

  const erroDados = erroChecklists || erroLimpeza || erroPlanos || erroPtp;

  if (!loading && usuario && erroDados) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader titulo="Gestao Industrial" subtitulo="Linha 3 - Enchedora 3" />
        <main className="mx-auto w-full max-w-[1300px] px-4 py-8 md:px-8">
          <section className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-bold">Farol indisponivel</p>
            <p className="mt-1">{erroDados} Nenhum numero sera mostrado como zero.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 rounded-lg bg-destructive px-3 py-2 font-semibold text-destructive-foreground"
            >
              Tentar novamente
            </button>
          </section>
        </main>
      </div>
    );
  }

  if (
    loading ||
    !usuario ||
    carregandoChecklists ||
    carregandoLimpeza ||
    carregandoPlanos ||
    carregandoPtp
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader titulo="Gestão Industrial" subtitulo="Linha 3 — Enchedora 3" />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-8">
          <p className="text-sm text-muted-foreground md:text-base">Bem-vindo,</p>
          <h2 className="text-2xl font-bold text-foreground md:text-3xl">{usuario.nome}</h2>
        </div>

        <Farol linhas={linhasFarol} data={hoje} modo="estado" />

        <GestaoRecursos
          pendencias={pendencias}
          planos={planos}
          usuario={usuario}
          onAtualizar={() => setRecarga((n) => n + 1)}
        />

        {/* Modo executivo: a GI vê o que exige decisão dela, não a fila de
            55 validações que é cobrança de rotina do líder. */}
        <PendenciasAbertas pendencias={pendencias} planos={planos} modo="executivo" />

        <MelhoriasERotina
          melhorias={melhorias}
          rotina={rotina}
          usuario={usuario}
          onAtualizar={() => setRecarga((n) => n + 1)}
        />

        <h3 className="mb-3 mt-10 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Ferramentas de análise
        </h3>

        {/* Bloco prioritário: Não conformidades e Não realizados */}
        <Link
          to="/gestao/nao-conformidades"
          className="mb-8 flex flex-col gap-4 rounded-2xl border-2 border-destructive/40 bg-destructive-soft/40 p-5 shadow-sm transition-all hover:border-destructive hover:shadow-md md:flex-row md:items-center md:p-6"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-destructive text-destructive-foreground">
            <AlertOctagon className="h-8 w-8" />
          </div>
          <div className="flex-1">
            <p className="text-xl font-bold text-foreground md:text-2xl">
              Não conformidades e Não realizados
            </p>
            <p className="mt-1 text-sm text-muted-foreground md:text-base">
              Problemas registrados no checklist e na limpeza ·{" "}
              <span className="font-semibold text-foreground">últimos {DIAS_NCNR} dias</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs md:text-sm">
              <Pill label="NC checklist" valor={ncnr.totalNc} tom="destructive" />
              <Pill label="NR limpeza" valor={ncnr.totalNr} tom="warning" />
              <Pill label="Total" valor={ncnr.totalNc + ncnr.totalNr} tom="muted" />
            </div>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-full bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground md:self-center">
            Ver análise <ArrowRight className="h-4 w-4" />
          </div>
        </Link>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          <Card titulo="Checklists" valor={checklists.length} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <BotaoLink
            to="/gestao/dashboard"
            icon={<LayoutDashboard className="h-8 w-8" />}
            titulo="Dashboard"
            descricao="Visão executiva em tempo real · KPIs, aging, alertas"
          />
          <BotaoLink
            to="/gestao/checklists"
            icon={<ClipboardList className="h-8 w-8" />}
            titulo="Checklists"
            descricao="Lista completa de checklists"
          />
          <BotaoLink
            to="/gestao/nao-conformidades"
            icon={<AlertOctagon className="h-8 w-8" />}
            titulo="Não conformidades"
            descricao="NC do checklist e NR da limpeza"
          />
          <BotaoLink
            to="/gestao/filtros"
            search={{ origem: "gestao" }}
            icon={<Filter className="h-8 w-8" />}
            titulo="Filtros"
            descricao="Filtrar por data, turno, equipe"
          />
          <BotaoLink
            to="/gestao/relatorio"
            icon={<FileBarChart2 className="h-8 w-8" />}
            titulo="Gerar Relatório"
            descricao="Consolidar checklist, tratativas e recorrências da Linha 3"
          />
          <BotaoLink
            to="/gestao/it-analytics"
            icon={<BookOpen className="h-8 w-8" />}
            titulo="Inteligência das ITs"
            descricao="Uso das instruções · pontos para reforço de treinamento"
          />
          <BotaoLink
            to="/gestao/usuarios"
            icon={<UserPlus className="h-8 w-8" />}
            titulo="Cadastrar Usuário"
            descricao="Gerenciar usuários · hierarquia · módulos de acesso"
          />
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Dados em tempo real do banco. Atualizações da operação aparecem automaticamente em todos
          os dispositivos.
        </p>
      </main>
    </div>
  );
}

function Pill({
  label,
  valor,
  tom,
}: {
  label: string;
  valor: number;
  tom: "destructive" | "warning" | "muted";
}) {
  const cls =
    tom === "destructive"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : tom === "warning"
        ? "bg-warning/20 text-warning-foreground border-warning/40"
        : "bg-muted text-foreground border-border";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-semibold ${cls}`}
    >
      <span>{label}</span>
      <span className="rounded-full bg-background px-2 text-foreground">{valor}</span>
    </span>
  );
}

function Card({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground md:text-sm">
        {titulo}
      </p>
      <p className="mt-1 text-3xl font-bold text-primary md:text-4xl">{valor}</p>
    </div>
  );
}

function BotaoLink({
  to,
  search,
  icon,
  titulo,
  descricao,
}: {
  to: string;
  search?: Record<string, string>;
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
}) {
  return (
    <Link
      to={to}
      search={search}
      className="group flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-6 text-foreground shadow-sm transition-all hover:border-primary/50 hover:shadow-md md:p-7"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-soft text-primary">
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold">{titulo}</p>
        <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>
      </div>
    </Link>
  );
}
