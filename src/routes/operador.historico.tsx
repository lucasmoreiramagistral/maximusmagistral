import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, AlertTriangle } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { useChecklists, useAnomalias } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";
import { formatarData, formatarDataHora } from "@/lib/checklist/format";
import { StatusAnomaliaBadge, CriticidadeBadge } from "@/components/badges";

export const Route = createFileRoute("/operador/historico")({
  head: () => ({ meta: [{ title: "Histórico local — Operador" }] }),
  component: HistoricoPage,
});

function HistoricoPage() {
  const { usuario, loading } = useGuard("operador");
  const checklists = useChecklists();
  const anomalias = useAnomalias();

  if (loading || !usuario) return <TelaCarregando />;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Histórico local"
        subtitulo="Checklists e anomalias salvos neste dispositivo"
        voltarPara="/operador"
      />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10">
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground md:text-xl">
            <ClipboardList className="h-5 w-5 text-primary" />
            Checklists concluídos
          </h2>
          {checklists.length === 0 ? (
            <EstadoVazio mensagem="Nenhum checklist salvo ainda" />
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {checklists.map((c) => {
                const nc = c.respostas.filter((r) => r?.resposta === "Não conforme").length;
                return (
                  <li key={c.id}>
                    <Link
                      to="/operador/visualizar/checklist/$id"
                      params={{ id: c.id }}
                      className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md md:p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-bold text-foreground">{c.momento}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatarData(c.contexto.data)} · {c.contexto.turno} ·{" "}
                            {c.contexto.equipe}
                          </p>
                        </div>
                        {nc > 0 && (
                          <span className="rounded-md bg-destructive-soft px-2 py-1 text-xs font-bold text-destructive">
                            {nc} NC
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Concluído em {formatarDataHora(c.concluidoEm ?? c.criadoEm)}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground md:text-xl">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Anomalias registradas
          </h2>
          {anomalias.length === 0 ? (
            <EstadoVazio mensagem="Nenhuma anomalia registrada" />
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {anomalias.map((a) => (
                <li key={a.id}>
                  <Link
                    to="/operador/visualizar/anomalia/$id"
                    params={{ id: a.id }}
                    className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md md:p-5"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <StatusAnomaliaBadge status={a.status} />
                      <CriticidadeBadge criticidade={a.criticidade} />
                    </div>
                    <p className="font-semibold text-foreground">{a.categoria}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.descricao}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatarDataHora(a.criadoEm)} · {a.equipe}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function EstadoVazio({ mensagem }: { mensagem: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <p className="text-sm text-muted-foreground">{mensagem}</p>
    </div>
  );
}
