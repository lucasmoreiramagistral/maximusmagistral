import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppHeader } from "@/components/app-header";
import { AnomaliaDetalheGestao } from "@/components/anomalia-detalhe-gestao";
import { useAnomaliasRemote } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";

export const Route = createFileRoute("/gestao/visualizar/anomalia/$id")({
  head: () => ({ meta: [{ title: "Anomalia — Gestão Industrial" }] }),
  component: VisualizarAnomaliaGestao,
});

function VisualizarAnomaliaGestao() {
  const { id } = Route.useParams();
  const { usuario, loading } = useGuard("gestao");
  const { data: anomalias, refetch } = useAnomaliasRemote({ realtime: true });

  const anomalia = useMemo(() => anomalias.find((a) => a.id === id), [anomalias, id]);

  if (loading || !usuario) return <TelaCarregando />;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Anomalia completa"
        subtitulo={anomalia?.categoria}
        voltarPara="/gestao/anomalias"
      />
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-10">
        {anomalia ? (
          <AnomaliaDetalheGestao
            anomalia={anomalia}
            usuario={usuario}
            onUpdated={() => void refetch()}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
            Anomalia não encontrada
          </p>
        )}
      </main>
    </div>
  );
}
