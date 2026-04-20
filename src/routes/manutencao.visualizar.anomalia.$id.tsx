import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppHeader } from "@/components/app-header";
import { AnomaliaDetalheManutencao } from "@/components/anomalia-detalhe-manutencao";
import { useAnomaliasRemote } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";

export const Route = createFileRoute("/manutencao/visualizar/anomalia/$id")({
  head: () => ({ meta: [{ title: "Anomalia — Manutenção" }] }),
  component: VisualizarAnomaliaManutencao,
});

function VisualizarAnomaliaManutencao() {
  const { id } = Route.useParams();
  const { usuario, loading } = useGuard("manutencao");
  const { data: anomalias, refetch } = useAnomaliasRemote({ realtime: true });

  const anomalia = useMemo(() => anomalias.find((a) => a.id === id), [anomalias, id]);

  if (loading || !usuario) return <TelaCarregando />;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Anomalia"
        subtitulo={anomalia?.categoria}
        voltarPara="/manutencao/anomalias"
      />
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-10">
        {anomalia ? (
          <AnomaliaDetalheManutencao
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
