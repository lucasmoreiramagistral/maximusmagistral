import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppHeader } from "@/components/app-header";
import { AnomaliaDetalhe } from "@/components/checklist-detalhe";
import { useAnomalias } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";

export const Route = createFileRoute("/operador/visualizar/anomalia/$id")({
  head: () => ({ meta: [{ title: "Visualizar anomalia" }] }),
  component: VisualizarAnomalia,
});

function VisualizarAnomalia() {
  const { id } = Route.useParams();
  const { usuario, loading } = useGuard("operador");
  const anomalias = useAnomalias();

  const anomalia = useMemo(() => anomalias.find((a) => a.id === id), [anomalias, id]);

  if (loading || !usuario) return <TelaCarregando />;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Anomalia (somente leitura)"
        subtitulo={anomalia?.categoria}
        voltarPara="/operador/historico"
      />
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-10">
        {anomalia ? (
          <AnomaliaDetalhe anomalia={anomalia} />
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
            Anomalia não encontrada
          </p>
        )}
      </main>
    </div>
  );
}
