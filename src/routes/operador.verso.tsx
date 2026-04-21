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
import { TURNOS_ATIVOS_LIMPEZA, VERSO_CONTEXTO_FIXO } from "@/lib/verso/constants";

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

  const ptpConcluidas = ptp.janelas.filter(
    (j) => j.statusJanela !== "pendente" && j.statusJanela !== "rascunho",
  ).length;
  const limpezaValidados = limpeza.turnos.filter((t) => t.status === "validado").length;
  const limpezaAguardando = limpeza.turnos.filter(
    (t) => t.status === "aguardando_validacao",
  ).length;

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
                Monitoramento por janelas de horário (12 janelas no dia).
              </p>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {ptpConcluidas}/12 janelas registradas
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
                Checklist por turno + validação do líder.
              </p>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {limpezaValidados}/{TURNOS_ATIVOS_LIMPEZA.length} turnos validados
                {limpezaAguardando > 0 && (
                  <span className="ml-2 text-warning">· {limpezaAguardando} aguardando líder</span>
                )}
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
