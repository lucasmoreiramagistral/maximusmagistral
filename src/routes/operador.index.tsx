import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ClipboardCheck,
  AlertTriangle,
  History,
  Play,
  Layers,
  CheckCircle2,
  BookOpen,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { TelaCarregando } from "@/components/tela-carregando";
import { useRascunho, useChecklists } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { usePtpJanelas } from "@/hooks/use-ptp-janelas";
import { useLimpezaTurnos } from "@/hooks/use-limpeza-turnos";
import { storage, buildFolhaKey } from "@/lib/checklist/storage";
import { formatarDataHora } from "@/lib/checklist/format";
import { MOMENTOS_CHECKLIST } from "@/lib/checklist/types";
import type { Checklist, ContextoChecklist } from "@/lib/checklist/types";
import {
  buildFolhaDiaKey,
  calcularDataOperacional,
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
  const navigate = useNavigate();

  const equipe = usuario?.equipePadrao ?? null;
  const turno = usuario?.turnoPadrao ?? null;
  const data = calcularDataOperacional(equipe, turno);
  const folhaDiaKey = buildFolhaDiaKey(
    data,
    VERSO_CONTEXTO_FIXO.linha,
    VERSO_CONTEXTO_FIXO.maquina,
  );

  const ptp = usePtpJanelas(folhaDiaKey, data);
  const limpeza = useLimpezaTurnos(folhaDiaKey, data);

  const turnoLogado = (turno ?? null) as TurnoAtivo | null;

  // ─── Cálculo do "tudo concluído" ───
  const { tudoConcluido, ptpOk, limpezaOk, checklistOk } = useMemo(() => {
    if (!turnoLogado || !equipe) {
      return { tudoConcluido: false, ptpOk: false, limpezaOk: false, checklistOk: false };
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

    // Limpeza: turno do operador validado
    const limpezaTurno = limpeza.turnos.find((t) => t.turno === turnoLogado);
    const _limpezaOk = limpezaTurno?.status === "validado";

    // Checklist: 3 momentos concluídos no folhaKey do dia +
    // assinaturas no Pós-setup
    const contextoDoDia: ContextoChecklist = {
      data,
      turno: turnoLogado,
      equipe,
      linha: "Linha 3",
      maquina: "Enchedora 3",
    };
    const folhaKeyDia = buildFolhaKey(contextoDoDia);
    const localChecklists = storage.getChecklists();
    // Combina cache local + remoto (evita falsos negativos quando ainda
    // não houve refresh de uma das fontes).
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
      todosMomentosConcluidos &&
      Boolean(posSetup?.assinaturaOperador) &&
      Boolean(posSetup?.assinaturaLider);

    return {
      tudoConcluido: _ptpOk && _limpezaOk && _checklistOk,
      ptpOk: _ptpOk,
      limpezaOk: _limpezaOk,
      checklistOk: _checklistOk,
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

  const irParaAnomaliaManual = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("fm-checklist:anomalia-origem");
    }
    navigate({ to: "/operador/anomalia/nova" });
  };

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
                    Checklist operacional assinado (operador + líder)
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

        {!tudoConcluido && rascunho && (
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <BotaoAcao
            to="/operador/contexto"
            icon={<Play className="h-8 w-8" />}
            titulo="Novo checklist"
            descricao="Iniciar um novo checklist operacional"
            badge={checklistOk ? "Concluído" : undefined}
          />
          <BotaoAcao
            onClick={irParaAnomaliaManual}
            icon={<AlertTriangle className="h-8 w-8" />}
            titulo="Registrar anomalia"
            descricao="Registrar manualmente uma anomalia"
          />
          <BotaoAcao
            to="/operador/verso"
            icon={<Layers className="h-8 w-8" />}
            titulo="Verso da folha"
            descricao="PTP e limpeza da sala de envase"
            badge={ptpOk && limpezaOk ? "Concluído" : undefined}
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
