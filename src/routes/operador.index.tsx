import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ClipboardCheck,
  History,
  Play,
  CheckCircle2,
  BookOpen,
  PenLine,
  Pencil,
  ClipboardList,
  Droplets,
  Wrench,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { TelaCarregando } from "@/components/tela-carregando";
import { useRascunho, useChecklists } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { usePtpJanelas } from "@/hooks/use-ptp-janelas";
import { useLimpezaTurnos } from "@/hooks/use-limpeza-turnos";
import { useTurnoAtivoDoDia } from "@/lib/operacao/turno-ativo";
import { TurnoAtivoPicker } from "@/components/turno-ativo-picker";
import { storage, buildFolhaKey } from "@/lib/checklist/storage";
import { formatarDataHora } from "@/lib/checklist/format";
import { MOMENTOS_CHECKLIST } from "@/lib/checklist/types";
import type { Checklist, ContextoChecklist } from "@/lib/checklist/types";
import { checklistEmEdicao, limparModoEdicao } from "@/lib/checklist/edicao";
import {
  buildFolhaDiaKey,
  formatarDataBR,
} from "@/lib/operacao/data-operacional";
import {
  janelasPtpDoTurno,
  VERSO_CONTEXTO_FIXO,
} from "@/lib/verso/constants";

export const Route = createFileRoute("/operador/")({
  head: () => ({
    meta: [
      { title: "Operador — Checklist Operacional" },
      {
        name: "description",
        content: "Tela inicial do operador da Linha 3 — Enchedora 3.",
      },
    ],
  }),
  component: OperadorHome,
});

type TurnoAtivo = "12x36 Dia" | "12x36 Noite" | "Comercial" | "1º Turno" | "2º Turno" | "3º Turno";

function OperadorHome() {
  const { usuario, loading } = useGuard("operador");
  const rascunho = useRascunho();
  const checklistsRemote = useChecklists();

  const turnoAtivo = useTurnoAtivoDoDia(usuario);
  const equipe = turnoAtivo.equipe;
  const turno = turnoAtivo.turno;
  const data = turnoAtivo.data;
  const folhaDiaKey = buildFolhaDiaKey(
    data,
    VERSO_CONTEXTO_FIXO.linha,
    VERSO_CONTEXTO_FIXO.maquina,
  );

  const ptp = usePtpJanelas(folhaDiaKey, data);
  const limpeza = useLimpezaTurnos(folhaDiaKey, data);

  const turnoLogado = (turno ?? null) as TurnoAtivo | null;

  // Detecta se o rascunho atual é uma edição de um checklist já concluído.
  // Quando é edição, não exibimos o aviso padrão "Você tem um checklist em
  // andamento" — exibimos um aviso específico com Cancelar/Continuar.
  const ehEdicao = useMemo(() => {
    if (!rascunho) return false;
    if (typeof window === "undefined") return false;
    return checklistEmEdicao() === rascunho.id;
  }, [rascunho]);

  // ─── Cálculo do "tudo concluído" e pendências para o líder ───
  const {
    tudoConcluido,
    ptpOk,
    limpezaOk,
    checklistOk,
    pendenciasLider,
    checklistAguardandoLider,
    limpezaAguardandoLider,
  } = useMemo(() => {
    if (!turnoLogado || !equipe) {
      return {
        tudoConcluido: false,
        ptpOk: false,
        limpezaOk: false,
        checklistOk: false,
        pendenciasLider: 0,
        checklistAguardandoLider: false,
        limpezaAguardandoLider: false,
      };
    }

    // PTP: 100% das janelas da escala (qualquer turno)
    const codigosTurno = janelasPtpDoTurno(turnoLogado, equipe as never);
    const registradas = ptp.janelas.filter(
      (j) =>
        codigosTurno.includes(j.janelaCodigo) &&
        j.statusJanela !== "pendente" &&
        j.statusJanela !== "rascunho",
    ).length;
    const _ptpOk = registradas === codigosTurno.length;

    // Limpeza: turno do operador validado pelo líder
    const limpezaTurno = limpeza.turnos.find((t) => t.turno === turnoLogado);
    const _limpezaOk = limpezaTurno?.status === "validado";
    // Limpeza aguardando validação do líder?
    const _limpezaAguardandoLider =
      limpezaTurno?.status === "aguardando_validacao";

    // Checklist: 3 momentos concluídos no folhaKey do dia +
    // assinatura do OPERADOR no Pós-setup (líder valida depois).
    const contextoDoDia: ContextoChecklist = {
      data,
      turno: turnoLogado,
      equipe,
      linha: "Linha 3",
      maquina: "Enchedora 3",
    };
    const folhaKeyDia = buildFolhaKey(contextoDoDia);
    const localChecklists = storage.getChecklists();
    const todosChecklists: Checklist[] = [
      ...localChecklists,
      ...checklistsRemote.filter(
        (c) => !localChecklists.some((l) => l.id === c.id),
      ),
    ];
    const doDia = todosChecklists.filter(
      (c) => (c.folhaKey ?? buildFolhaKey(c.contexto)) === folhaKeyDia,
    );

    const concluidoDe = (momento: string) =>
      doDia.find((c) => c.momento === momento && c.status === "concluido");

    const todosMomentosConcluidos = MOMENTOS_CHECKLIST.every((m) =>
      Boolean(concluidoDe(m)),
    );
    const posSetup = concluidoDe("Pós-setup");
    const _checklistOk =
      todosMomentosConcluidos && Boolean(posSetup?.assinaturaOperador);

    // Pós-setup do operador assinado mas sem assinatura do líder?
    const _checklistAguardandoLider =
      Boolean(posSetup?.assinaturaOperador) && !posSetup?.assinaturaLider;

    const _pendenciasLider =
      (_limpezaAguardandoLider ? 1 : 0) + (_checklistAguardandoLider ? 1 : 0);

    return {
      tudoConcluido: _ptpOk && _limpezaOk && _checklistOk,
      ptpOk: _ptpOk,
      limpezaOk: _limpezaOk,
      checklistOk: _checklistOk,
      pendenciasLider: _pendenciasLider,
      checklistAguardandoLider: _checklistAguardandoLider,
      limpezaAguardandoLider: _limpezaAguardandoLider,
    };
  }, [
    turnoLogado,
    equipe,
    data,
    ptp.janelas,
    limpeza.turnos,
    checklistsRemote,
  ]);

  if (loading || !usuario) return <TelaCarregando />;

  // Cancela edição em andamento: limpa rascunho + flag de modo edição
  const cancelarEdicao = () => {
    storage.clearRascunho();
    limparModoEdicao();
  };

  // Monta lista de pendências do líder (para descrição do card)
  const itensPendentesLider: string[] = [];
  if (checklistAguardandoLider) itensPendentesLider.push("Checklist completo aguardando assinatura");
  if (limpezaAguardandoLider) itensPendentesLider.push("Limpeza aguardando assinatura");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader titulo="Checklist Operacional" subtitulo="Linha 3 — Enchedora 3" />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-8">
          <p className="text-sm text-muted-foreground md:text-base">Bem-vindo,</p>
          <h2 className="text-2xl font-bold text-foreground md:text-3xl">Operador</h2>
        </div>

        {tudoConcluido && turnoLogado && (
          <div className="mb-6 rounded-2xl border-2 border-success/40 bg-success/10 p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-success/20 text-success">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <div className="flex-1">
                <p className="text-xl font-bold text-foreground md:text-2xl">
                  Turno concluído com sucesso!
                </p>
                <p className="mt-1 text-sm text-muted-foreground md:text-base">
                  Você concluiu o checklist operacional, o PTP Garrafas e a
                  limpeza da sala de envase deste turno. Bom descanso!
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  <li className="flex items-start gap-2 text-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    Checklist operacional assinado pelo operador
                  </li>
                  <li className="flex items-start gap-2 text-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    PTP Garrafas — 6/6 janelas registradas
                  </li>
                  <li className="flex items-start gap-2 text-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    Limpeza Sala de Envase — turno validado pelo líder
                  </li>
                </ul>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-foreground">
                  Turno {turnoLogado} · {formatarDataBR(data)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Aviso quando há rascunho em ANDAMENTO (novo checklist, ainda não concluído) */}
        {!tudoConcluido && rascunho && !ehEdicao && (
          <div className="mb-6 rounded-xl border-2 border-warning/40 bg-warning/10 p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-base font-bold text-foreground">
                  Você tem um checklist em andamento
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {rascunho.momento} · iniciado em {formatarDataHora(rascunho.criadoEm)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    storage.clearRascunho();
                  }}
                >
                  Novo checklist
                </Button>
                <Button asChild>
                  <Link to="/operador/checklist">Continuar</Link>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Aviso específico quando o rascunho é uma EDIÇÃO de checklist já concluído */}
        {!tudoConcluido && rascunho && ehEdicao && (
          <div className="mb-6 rounded-xl border-2 border-primary/40 bg-primary-soft/40 p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Pencil className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-base font-bold text-foreground">
                    Continuar alterando os dados do checklist?
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {rascunho.momento} · edição iniciada em {formatarDataHora(rascunho.criadoEm)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={cancelarEdicao}>
                  Cancelar
                </Button>
                <Button asChild>
                  <Link to="/operador/checklist">Continuar</Link>
                </Button>
              </div>
            </div>
          </div>
        )}

        {pendenciasLider > 0 && (
          <Link
            to="/operador/validacao-lider"
            className="mb-6 flex flex-col gap-4 rounded-2xl border-2 border-primary/50 bg-primary-soft/40 p-5 shadow-md transition-all hover:border-primary hover:shadow-lg active:scale-[0.99] md:flex-row md:items-center md:p-6"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <PenLine className="h-8 w-8" />
            </div>
            <div className="flex-1">
              <p className="text-xl font-bold text-foreground md:text-2xl">
                Validação de Relatório pelo Líder
              </p>
              <ul className="mt-2 space-y-1">
                {itensPendentesLider.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-foreground md:text-base"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-muted-foreground md:text-base">
                Toque aqui para o líder assinar tudo de uma vez.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
              {pendenciasLider} pendente{pendenciasLider > 1 ? "s" : ""}
            </div>
          </Link>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <BotaoAcao
            to="/operador/contexto"
            icon={<Play className="h-8 w-8" />}
            titulo="Novo checklist"
            descricao="Iniciar um novo checklist operacional"
            badge={checklistOk ? "Concluído" : undefined}
          />
          <BotaoAcao
            to="/operador/verso/ptp"
            icon={<ClipboardList className="h-8 w-8" />}
            titulo="PTP Enchedora L3"
            descricao="Monitoramento por janelas de horário"
            badge={ptpOk ? "Concluído" : undefined}
          />
          <BotaoAcao
            to="/operador/verso/limpeza"
            icon={<Droplets className="h-8 w-8" />}
            titulo="Checklist limpeza sala envase L3"
            descricao="Checklist operacional de limpeza"
            badge={limpezaOk ? "Concluído" : undefined}
          />
          <BotaoAcao
            to="/operador/tutorial-sigma"
            icon={<Wrench className="h-8 w-8" />}
            titulo="Registrar Anomalia (SIGMA)"
            descricao="Tutorial: como abrir e fechar OS no SIGMA"
          />
          <BotaoAcao
            to="/operador/it"
            icon={<BookOpen className="h-8 w-8" />}
            titulo="Instruções de Trabalho"
            descricao="Consultar instruções oficiais da linha"
          />
          <BotaoAcao
            to="/operador/historico"
            icon={<History className="h-8 w-8" />}
            titulo="Histórico local"
            descricao="Ver checklists e anomalias salvos"
          />
        </div>

        <div className="mt-8 rounded-xl border border-border bg-muted/40 p-4 md:p-5">
          <div className="flex items-start gap-3">
            <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">Equipamento</p>
              <p className="text-sm text-muted-foreground">
                Linha 3 · Envase · Enchedora Zegla 50V
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function BotaoAcao({
  to,
  onClick,
  icon,
  titulo,
  descricao,
  badge,
}: {
  to?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
  badge?: string;
}) {
  const className =
    "group relative flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-6 text-left text-foreground shadow-sm transition-all hover:border-primary/50 hover:shadow-md active:bg-primary active:text-primary-foreground active:border-primary md:p-7";

  const inner = (
    <>
      {badge && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-semibold text-success">
          <CheckCircle2 className="h-3 w-3" />
          {badge}
        </span>
      )}
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-soft text-primary group-active:bg-primary-foreground/15 group-active:text-primary-foreground">
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold">{titulo}</p>
        <p className="mt-1 text-sm text-muted-foreground group-active:text-primary-foreground/80">
          {descricao}
        </p>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }
  return (
    <Link to={to!} className={className}>
      {inner}
    </Link>
  );
}
