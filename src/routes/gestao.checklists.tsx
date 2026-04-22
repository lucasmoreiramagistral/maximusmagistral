import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAnomaliasRemote, useChecklistsRemote } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { useVersosDosDiasRemote } from "@/hooks/use-versos-dos-dias";
import { TelaCarregando } from "@/components/tela-carregando";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { ChecklistDiaResumoCard } from "@/components/checklist-dia-detalhe";
import {
  filtrarChecklists,
  filtrarFolhas,
  filtrosAtivos,
  getFiltros,
  FILTROS_KEY,
} from "@/lib/checklist/filtros";
import { extrairFolhasDiaKeysComVerso } from "@/lib/verso/aplicabilidade";
import { buildFolhaDiaKey } from "@/lib/operacao/data-operacional";
import { formatarData, formatarDataHora } from "@/lib/checklist/format";
import { buildFolhasAgrupadas } from "@/lib/checklist/supabase-storage";
import { Filter, LayoutGrid, ListIcon, Loader2 } from "lucide-react";
import type { Filtros } from "@/lib/checklist/filtros";

export const Route = createFileRoute("/gestao/checklists")({
  head: () => ({ meta: [{ title: "Checklists — Gestão Industrial" }] }),
  component: ListaChecklists,
});

type Visao = "momento" | "dia";

function ListaChecklists() {
  const navigate = useNavigate();
  const { usuario, loading: loadingAuth } = useGuard("gestao");
  const {
    data: checklists,
    loading: loadingC,
    error: errorC,
  } = useChecklistsRemote({
    realtime: true,
  });
  const {
    data: anomalias,
    loading: loadingA,
    error: errorA,
  } = useAnomaliasRemote({
    realtime: true,
  });
  const loading = loadingC || loadingA;
  const erro = errorC ?? errorA;
  const [filtros, setFiltrosState] = useState<Filtros>(() => getFiltros());
  const [visao, setVisao] = useState<Visao>("dia");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setFiltrosState(getFiltros());
    window.addEventListener("fm-storage-update", update);
    return () => window.removeEventListener("fm-storage-update", update);
  }, []);

  void FILTROS_KEY;

  const lista = useMemo(
    () => filtrarChecklists(checklists, filtros, anomalias),
    [checklists, filtros, anomalias],
  );
  const todasFolhas = useMemo(
    () => buildFolhasAgrupadas(checklists, anomalias),
    [checklists, anomalias],
  );
  const folhaDiaKeys = useMemo(
    () => extrairFolhasDiaKeysComVerso(todasFolhas),
    [todasFolhas],
  );
  const { resumos: resumosVerso } = useVersosDosDiasRemote(folhaDiaKeys);
  const folhas = useMemo(
    () => filtrarFolhas(todasFolhas, filtros, anomalias, resumosVerso),
    [todasFolhas, anomalias, filtros, resumosVerso],
  );

  if (loadingAuth || !usuario) return <TelaCarregando />;

  const ativos = filtrosAtivos(filtros);

  const totalLabel =
    visao === "dia"
      ? `${folhas.length} ${folhas.length === 1 ? "folha do dia" : "folhas do dia"}`
      : `${lista.length} ${lista.length === 1 ? "registro" : "registros"}`;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader titulo="Checklists" subtitulo={totalLabel} voltarPara="/gestao" />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Dados em tempo real do banco. Atualizações da operação aparecem automaticamente.
          </p>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setVisao("dia")}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                  visao === "dia"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Checklist completo do dia
              </button>
              <button
                type="button"
                onClick={() => setVisao("momento")}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                  visao === "momento"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ListIcon className="h-3.5 w-3.5" /> Por momento
              </button>
            </div>
            <Button asChild variant={ativos ? "default" : "outline"}>
              <Link to="/gestao/filtros" search={{ origem: "checklists" }}>
                <Filter className="mr-1.5 h-4 w-4" />
                {ativos ? "Filtros aplicados" : "Filtros"}
              </Link>
            </Button>
          </div>
        </div>

        {erro && (
          <p className="mb-4 rounded-md bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive">
            {erro}
          </p>
        )}
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : visao === "dia" ? (
          folhas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
              Nenhum checklist disponível
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {folhas.map((f) => {
                const versoKey = buildFolhaDiaKey(
                  f.contexto.data,
                  f.contexto.linha,
                  f.contexto.maquina,
                );
                return (
                  <ChecklistDiaResumoCard
                    key={f.folhaKey}
                    folha={f}
                    href={`/gestao/visualizar/dia/${encodeURIComponent(f.folhaKey)}`}
                    versoResumo={resumosVerso.get(versoKey)}
                  />
                );
              })}
            </div>
          )
        ) : lista.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
            Nenhum checklist disponível
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Turno</th>
                  <th className="px-4 py-3">Equipe</th>
                  <th className="px-4 py-3">Momento</th>
                  <th className="px-4 py-3 text-center">NC</th>
                  <th className="px-4 py-3 text-center">Anomalias</th>
                  <th className="px-4 py-3 text-right">Concluído</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lista.map((c) => {
                  const nc = c.respostas.filter((r) => r?.resposta === "Não conforme").length;
                  const anom = c.respostas.filter((r) => !!r?.anomaliaId).length;
                  return (
                    <tr key={c.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <Link
                          to="/gestao/visualizar/checklist/$id"
                          params={{ id: c.id }}
                          className="block"
                        >
                          {formatarData(c.contexto.data)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.contexto.turno}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.contexto.equipe}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.momento}</td>
                      <td className="px-4 py-3 text-center">
                        {nc > 0 ? (
                          <span className="inline-flex items-center rounded-md bg-destructive-soft px-2 py-0.5 text-xs font-bold text-destructive">
                            {nc}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {anom > 0 ? (
                          <span className="inline-flex items-center rounded-md bg-warning/15 px-2 py-0.5 text-xs font-bold text-warning-foreground">
                            {anom}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                        {formatarDataHora(c.concluidoEm ?? c.criadoEm)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
