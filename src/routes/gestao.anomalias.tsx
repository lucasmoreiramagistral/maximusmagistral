import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAnomaliasRemote } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { filtrarAnomalias, filtrosAtivos, getFiltros } from "@/lib/checklist/filtros";
import { formatarData } from "@/lib/checklist/format";
import { Filter } from "lucide-react";
import { CriticidadeBadge, StatusAnomaliaBadge } from "@/components/badges";
import type { Filtros } from "@/lib/checklist/filtros";

export const Route = createFileRoute("/gestao/anomalias")({
  head: () => ({ meta: [{ title: "Anomalias — Gestão Industrial" }] }),
  component: ListaAnomalias,
});

function ListaAnomalias() {
  const navigate = useNavigate();
  const { usuario, loading: loadingAuth } = useGuard("gestao");
  const { data: anomalias, loading } = useAnomaliasRemote({ realtime: true });
  const [filtros, setFiltrosState] = useState<Filtros>(() => getFiltros());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setFiltrosState(getFiltros());
    window.addEventListener("fm-storage-update", update);
    return () => window.removeEventListener("fm-storage-update", update);
  }, []);

  const lista = useMemo(() => filtrarAnomalias(anomalias, filtros), [anomalias, filtros]);

  if (loadingAuth || !usuario) return <TelaCarregando />;

  const ativos = filtrosAtivos(filtros);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Anomalias"
        subtitulo={`${lista.length} ${lista.length === 1 ? "registro" : "registros"}`}
        voltarPara="/gestao"
      />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Dados em tempo real do banco. Atualizações da operação aparecem automaticamente.
          </p>
          <Button asChild variant={ativos ? "default" : "outline"}>
            <Link to="/gestao/filtros" search={{ origem: "anomalias" }}>
              <Filter className="mr-1.5 h-4 w-4" />
              {ativos ? "Filtros aplicados" : "Filtros"}
            </Link>
          </Button>
        </div>

        {loading ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
            Carregando…
          </p>
        ) : lista.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
            Nenhuma anomalia disponível
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {lista.map((a) => (
              <li key={a.id}>
                <Link
                  to="/gestao/visualizar/anomalia/$id"
                  params={{ id: a.id }}
                  className="block h-full rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md md:p-5"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusAnomaliaBadge status={a.status} />
                    <CriticidadeBadge criticidade={a.criticidade} />
                  </div>
                  <p className="font-bold text-foreground">{a.categoria}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.descricao}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatarData(a.criadoEm)}</span>
                    <span>{a.equipe}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Origem: {a.itemOrigem ? `Item ${a.itemOrigem.numero}` : "Manual"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
