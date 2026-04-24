import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { ClipboardList, Droplets } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { TelaCarregando } from "@/components/tela-carregando";
import { useGuard } from "@/hooks/use-guard";
import { usePtpJanelas } from "@/hooks/use-ptp-janelas";
import { useLimpezaTurnos } from "@/hooks/use-limpeza-turnos";
import {
  buildFolhaDiaKey,
  calcularDataOperacional,
  formatarDataBR,
} from "@/lib/operacao/data-operacional";
import {
  janelasPtpDoTurno,
  VERSO_CONTEXTO_FIXO,
} from "@/lib/verso/constants";

type TurnoAtivo = "12x36 Dia" | "12x36 Noite" | "Comercial" | "1º Turno" | "2º Turno" | "3º Turno";

export const Route = createFileRoute("/operador/verso")({
  head: () => ({
    meta: [
      { title: "Verso da folha — Operador" },
      {
        name: "description",
        content: "PTP de garrafas e checklist de limpeza da sala de envase L3.",
      },
    ],
  }),
  component: VersoLayout,
});

function VersoLayout() {
  const location = useLocation();

  if (location.pathname !== "/operador/verso") {
    return <Outlet />;
  }

  return <VersoHome />;
}

function VersoHome() {
  const { usuario, loading } = useGuard("operador");

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

  if (loading || !usuario) return <TelaCarregando />;

  const turnoLogado = (turno ?? null) as TurnoAtivo | null;

  // PTP: conta só as janelas do turno do operador via fonte única.
  const codigosPtpDoTurno = janelasPtpDoTurno(turno, equipe as never);
  const totalPtpTurno = codigosPtpDoTurno.length;
  const ptpConcluidasTurno = ptp.janelas.filter(
    (j) =>
      codigosPtpDoTurno.includes(j.janelaCodigo) &&
      j.statusJanela !== "pendente" &&
      j.statusJanela !== "rascunho",
  ).length;

  // Limpeza: conta itens respondidos do turno do operador (21 itens).
  const limpezaTurnoOperador = turnoLogado
    ? limpeza.turnos.find((t) => t.turno === turnoLogado)
    : undefined;
  const totalItensLimpeza = limpezaTurnoOperador?.itens.length ?? 21;
  const itensLimpezaRespondidos =
    limpezaTurnoOperador?.itens.filter((i) => i.status !== null).length ?? 0;
  const limpezaStatusLabel = limpezaTurnoOperador
    ? limpezaTurnoOperador.status === "validado"
      ? "Validado pelo líder"
      : limpezaTurnoOperador.status === "aguardando_validacao"
        ? "Aguardando líder"
        : limpezaTurnoOperador.status === "rascunho"
          ? "Em rascunho"
          : "Pendente"
    : "Pendente";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Verso da folha"
        subtitulo="PTP e limpeza da sala de envase"
        voltarPara="/operador"
      />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-10">
        <section className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Contexto operacional do dia
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Info titulo="Data" valor={formatarDataBR(data)} />
            <Info titulo="Turno" valor={turno ?? "—"} />
            <Info titulo="Equipe" valor={equipe ?? "—"} />
            <Info titulo="Linha" valor={VERSO_CONTEXTO_FIXO.linha} />
            <Info titulo="Área" valor={VERSO_CONTEXTO_FIXO.area} />
            <Info titulo="Máquina" valor={VERSO_CONTEXTO_FIXO.maquina} />
            <div className="col-span-2">
              <Info titulo="Equipamento" valor={VERSO_CONTEXTO_FIXO.equipamento} />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link
            to="/operador/verso/ptp"
            className="group flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-6 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md md:p-7"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <ClipboardList className="h-8 w-8" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">PTP Garrafas</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Monitoramento por janelas de horário (6 janelas no dia).
              </p>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {ptpConcluidasTurno}/{totalPtpTurno || 6} janelas registradas
              </p>
              {ptp.conflito && (
                <p className="mt-1 text-xs font-semibold text-destructive">
                  ⚠ Conflito de versão detectado — recarregue.
                </p>
              )}
            </div>
          </Link>

          <Link
            to="/operador/verso/limpeza"
            className="group flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-6 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md md:p-7"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Droplets className="h-8 w-8" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">Limpeza Sala de Envase</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Checklist operacional de limpeza da sala de envase L3.
              </p>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {itensLimpezaRespondidos}/{totalItensLimpeza} registradas
              </p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                Status: <span className="text-foreground">{limpezaStatusLabel}</span>
              </p>
              {limpeza.conflito && (
                <p className="mt-1 text-xs font-semibold text-destructive">
                  ⚠ Conflito de versão detectado — recarregue.
                </p>
              )}
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}

function Info({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground md:text-base">{valor}</p>
    </div>
  );
}
