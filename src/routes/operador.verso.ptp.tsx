import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, AlertCircle, CheckCircle2, MinusCircle } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { TelaCarregando } from "@/components/tela-carregando";
import { useGuard } from "@/hooks/use-guard";
import { usePtpJanelas } from "@/hooks/use-ptp-janelas";
import {
  buildFolhaDiaKey,
  calcularDataOperacional,
  formatarDataBR,
} from "@/lib/operacao/data-operacional";
import { LABEL_PTP_STATUS, VERSO_CONTEXTO_FIXO } from "@/lib/verso/constants";
import type { PtpJanela, PtpJanelaStatus } from "@/lib/verso/types";
import { formatarDataHora } from "@/lib/checklist/format";

export const Route = createFileRoute("/operador/verso/ptp")({
  head: () => ({ meta: [{ title: "PTP Garrafas — Verso da folha" }] }),
  component: PtpListaPage,
});

function PtpListaPage() {
  const { usuario, loading } = useGuard("operador");
  const equipe = usuario?.equipePadrao ?? null;
  const turno = usuario?.turnoPadrao ?? null;
  const data = calcularDataOperacional(equipe, turno);
  const folhaDiaKey = buildFolhaDiaKey(
    data,
    VERSO_CONTEXTO_FIXO.linha,
    VERSO_CONTEXTO_FIXO.maquina,
  );
  const { janelas, loading: l2, conflito } = usePtpJanelas(folhaDiaKey, data);

  if (loading || !usuario || l2) return <TelaCarregando />;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="PTP Garrafas"
        subtitulo={`Folha do dia ${formatarDataBR(data)}`}
        voltarPara="/operador/verso"
      />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-10">
        {conflito && (
          <div className="mb-4 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
            Conflito de versão: outro operador alterou uma janela. Recarregue a tela
            antes de salvar.
          </div>
        )}

        <p className="mb-3 text-sm text-muted-foreground">
          Toque em uma janela para preencher ou editar. As 12 janelas cobrem o dia
          inteiro de operação.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {janelas.map((j) => (
            <Link
              key={j.janelaCodigo}
              to="/operador/verso/ptp/$janelaCodigo"
              params={{ janelaCodigo: j.janelaCodigo }}
              className="rounded-2xl border-2 border-border bg-card p-4 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {j.janelaCodigo}
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {j.janelaInicio} às {j.janelaFim}
                  </p>
                </div>
                <StatusBadge status={j.statusJanela} />
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {j.operadorNome ? (
                  <p>
                    Por: <span className="font-medium text-foreground">{j.operadorNome}</span>
                  </p>
                ) : (
                  <p className="italic">Ainda não preenchida</p>
                )}
                {j.assinadoEm && (
                  <p className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatarDataHora(j.assinadoEm)}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: PtpJanelaStatus }) {
  const map: Record<
    PtpJanelaStatus,
    { cls: string; icon: React.ReactNode }
  > = {
    pendente: { cls: "bg-muted text-muted-foreground", icon: null },
    rascunho: {
      cls: "bg-warning/15 text-warning",
      icon: <Clock className="h-3 w-3" />,
    },
    sem_ocorrencia: {
      cls: "bg-success/15 text-success",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    houve_ocorrencia: {
      cls: "bg-destructive/15 text-destructive",
      icon: <AlertCircle className="h-3 w-3" />,
    },
    nao_rodou: {
      cls: "bg-muted text-foreground/70",
      icon: <MinusCircle className="h-3 w-3" />,
    },
  };
  const def = map[status] ?? map.pendente;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${def.cls}`}
    >
      {def.icon}
      {LABEL_PTP_STATUS[status] ?? status}
    </span>
  );
}

// Re-export para evitar suspeita de import não usado em build estrito
export type { PtpJanela };
