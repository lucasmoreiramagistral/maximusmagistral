import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { useAnomaliasRemote } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import {
  filtrarAnomalias,
  filtrosAtivos,
  getFiltros,
  ordenarAnomaliasManutencao,
} from "@/lib/checklist/filtros";
import type { Filtros } from "@/lib/checklist/filtros";
import { formatarDataHora } from "@/lib/checklist/format";
import { CriticidadeBadge, StatusAnomaliaBadge } from "@/components/badges";
import type { Anomalia } from "@/lib/checklist/types";

export const Route = createFileRoute("/manutencao/anomalias")({
  head: () => ({ meta: [{ title: "Anomalias — Manutenção" }] }),
  component: ListaAnomaliasManutencao,
});

function rotuloOrigem(o?: Anomalia["origemAnomalia"]): string {
  switch (o) {
    case "checklist_operador":
      return "Checklist do operador";
    case "manual_operador":
      return "Manual — Operador";
    case "manual_manutencao":
      return "Manual — Manutenção";
    case "manual_gestao":
      return "Manual — Gestão";
    default:
      return "Origem não informada";
  }
}

function ListaAnomaliasManutencao() {
  const { usuario, loading: loadingAuth } = useGuard("manutencao");
  const { data: anomalias, loading } = useAnomaliasRemote({ realtime: true });
  const [filtros, setFiltrosState] = useState<Filtros>(() => getFiltros());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setFiltrosState(getFiltros());
    window.addEventListener("fm-storage-update", update);
    return () => window.removeEventListener("fm-storage-update", update);
  }, []);

  const lista = useMemo(
    () => ordenarAnomaliasManutencao(filtrarAnomalias(anomalias, filtros)),
    [anomalias, filtros],
  );

  if (loadingAuth || !usuario) return <TelaCarregando />;
  const ativos = filtrosAtivos(filtros);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Anomalias"
        subtitulo={`${lista.length} ${lista.length === 1 ? "registro" : "registros"}`}
        voltarPara="/manutencao"
      />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Ordenado por prioridade. Atualizações em tempo real.
          </p>
          <Button asChild variant={ativos ? "default" : "outline"}>
            <Link to="/manutencao/filtros">
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
                  to="/manutencao/visualizar/anomalia/$id"
                  params={{ id: a.id }}
                  className="block h-full rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md md:p-5"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusAnomaliaBadge status={a.status} />
                    <CriticidadeBadge criticidade={a.criticidade} />
                  </div>
                  <p className="font-bold text-foreground">{a.categoria}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.descricao}</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <span>{formatarDataHora(a.criadoEm)}</span>
                    <span className="text-right">{a.equipe}</span>
                    <span>{a.equipamentoAfetado ?? a.maquina}</span>
                    <span className="text-right">{a.turno}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Origem: {rotuloOrigem(a.origemAnomalia)}
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
