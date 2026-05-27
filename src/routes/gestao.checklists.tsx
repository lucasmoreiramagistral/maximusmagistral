import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAnomaliasRemote, useChecklistsRemote } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { useVersosDosDiasRemote } from "@/hooks/use-versos-dos-dias";
import { TelaCarregando } from "@/components/tela-carregando";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { ChecklistDiaResumoCard } from "@/components/checklist-dia-detalhe";
import { VersoResumoCard } from "@/components/verso-resumo-card";
import {
  filtrarChecklists,
  filtrarFolhas,
  filtrosAtivos,
  getFiltros,
  setFiltros,
  FILTROS_KEY,
} from "@/lib/checklist/filtros";
import type { EstadoVersoFiltro } from "@/lib/checklist/filtros";
import { temVerso } from "@/lib/verso/aplicabilidade";
import { formatarData, formatarDataHora } from "@/lib/checklist/format";
import { buildFolhasAgrupadas } from "@/lib/checklist/supabase-storage";
import { ClipboardCheck, Filter, LayoutGrid, ListIcon, Loader2 } from "lucide-react";
import type { Filtros } from "@/lib/checklist/filtros";

export const Route = createFileRoute("/gestao/checklists")({
  head: () => ({ meta: [{ title: "Checklists — Gestão Industrial" }] }),
  component: ListaChecklists,
});

type Visao = "momento" | "dia" | "verso";

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
  const { resumos: resumosVerso } = useVersosDosDiasRemote(todasFolhas);
  const folhas = useMemo(
    () => filtrarFolhas(todasFolhas, filtros, anomalias, resumosVerso),
    [todasFolhas, anomalias, filtros, resumosVerso],
  );
  const folhasVerso = useMemo(() => folhas.filter(temVerso), [folhas]);

  if (loadingAuth || !usuario) return <TelaCarregando />;

  const ativos = filtrosAtivos(filtros);

  const totalLabel =
    visao === "verso"
      ? `${folhasVerso.length} ${folhasVerso.length === 1 ? "folha de Linha 3" : "folhas de Linha 3"}`
      : visao === "dia"
        ? `${folhas.length} ${folhas.length === 1 ? "folha do turno" : "folhas do turno"}`
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
                <LayoutGrid className="h-3.5 w-3.5" /> Checklist completo do turno
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
              <button
                type="button"
                onClick={() => setVisao("verso")}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                  visao === "verso"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ClipboardCheck className="h-3.5 w-3.5" /> Verso
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

        {visao === "verso" && <ChipsFiltroVerso estadoAtual={filtros.estadoVerso} />}

        {erro && (
          <p className="mb-4 rounded-md bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive">
            {erro}
          </p>
        )}
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : visao === "verso" ? (
          folhasVerso.length === 0 ? (
            <FolhasVazio filtros={filtros} visao="verso" />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {folhasVerso.map((f) => (
                <VersoResumoCard
                  key={f.folhaKey}
                  folha={f}
                  href={`/gestao/visualizar/dia/${encodeURIComponent(f.folhaKey)}`}
                  resumo={resumosVerso.get(f.folhaKey)}
                />
              ))}
            </div>
          )
        ) : visao === "dia" ? (
          folhas.length === 0 ? (
            <FolhasVazio filtros={filtros} visao="dia" />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {folhas.map((f) => (
                <ChecklistDiaResumoCard
                  key={f.folhaKey}
                  folha={f}
                  href={`/gestao/visualizar/dia/${encodeURIComponent(f.folhaKey)}`}
                  versoResumo={resumosVerso.get(f.folhaKey)}
                />
              ))}
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
                  <th className="px-4 py-3 text-center">NA</th>
                  <th className="px-4 py-3 text-right">Concluído</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lista.map((c) => {
                  const nc = c.respostas.filter((r) => r?.resposta === "Não conforme").length;
                  const na = c.respostas.filter((r) => r?.resposta === "Não aplicável").length;
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
                        {na > 0 ? (
                          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                            {na}
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

const CHIPS: Array<{ label: string; valor: EstadoVersoFiltro | undefined }> = [
  { label: "Todos", valor: undefined },
  { label: "Pendente", valor: "pendente" },
  { label: "Ocorrências", valor: "ocorrencias" },
  { label: "Validado", valor: "validado" },
];

function ChipsFiltroVerso({ estadoAtual }: { estadoAtual: EstadoVersoFiltro | undefined }) {
  function aplicar(novo: EstadoVersoFiltro | undefined) {
    const atual = getFiltros();
    setFiltros({ ...atual, estadoVerso: novo });
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Verso (Linha 3):
      </span>
      {CHIPS.map((chip) => {
        const ativo = estadoAtual === chip.valor;
        return (
          <button
            key={chip.label}
            type="button"
            aria-pressed={ativo}
            onClick={() => aplicar(chip.valor)}
            className={`h-8 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
              ativo
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

function FolhasVazio({
  filtros,
  visao,
}: {
  filtros: Filtros;
  visao: "dia" | "verso";
}) {
  const versoAtivo = !!filtros.estadoVerso;
  const outrosAtivos = filtrosAtivos({ ...filtros, estadoVerso: undefined });

  function limparVerso() {
    const atual = getFiltros();
    setFiltros({ ...atual, estadoVerso: undefined });
  }
  function limparTudo() {
    setFiltros({});
  }

  if (visao === "verso") {
    if (versoAtivo && outrosAtivos) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="mb-4 text-muted-foreground">
            Nenhuma folha de Linha 3 corresponde aos filtros aplicados.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={limparVerso}>
              Limpar filtro de verso
            </Button>
            <Button variant="outline" size="sm" onClick={limparTudo}>
              Limpar todos os filtros
            </Button>
          </div>
        </div>
      );
    }
    if (versoAtivo) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="mb-4 text-muted-foreground">
            Nenhuma folha de Linha 3 com este estado.
          </p>
          <Button variant="outline" size="sm" onClick={limparVerso}>
            Limpar filtro de verso
          </Button>
        </div>
      );
    }
    if (outrosAtivos) {
      return (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="mb-4 text-muted-foreground">
            Filtros atuais não retornam folhas de Linha 3.
          </p>
          <Button variant="outline" size="sm" onClick={limparTudo}>
            Limpar todos os filtros
          </Button>
        </div>
      );
    }
    return (
      <p className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
        Nenhuma folha de Linha 3 disponível.
      </p>
    );
  }

  if (versoAtivo && outrosAtivos) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <p className="mb-4 text-muted-foreground">
          Nenhuma folha corresponde aos filtros aplicados.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={limparVerso}>
            Limpar filtro de verso
          </Button>
          <Button variant="outline" size="sm" onClick={limparTudo}>
            Limpar todos os filtros
          </Button>
        </div>
      </div>
    );
  }
  if (versoAtivo) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <p className="mb-4 text-muted-foreground">
          Nenhuma folha corresponde ao filtro de verso aplicado.
        </p>
        <Button variant="outline" size="sm" onClick={limparVerso}>
          Limpar filtro de verso
        </Button>
      </div>
    );
  }
  return (
    <p className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
      Nenhum checklist disponível
    </p>
  );
}
