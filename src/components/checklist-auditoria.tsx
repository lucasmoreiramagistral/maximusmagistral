import { History, AlertCircle, ArrowRight } from "lucide-react";
import type { Checklist } from "@/lib/checklist/types";
import { formatarDataHora } from "@/lib/checklist/format";
import type { EdicaoChecklist } from "@/hooks/use-edicoes-checklist";

interface RespostaSnap {
  itemNumero: number;
  descricao: string;
  resposta: string | null;
  observacao?: string;
  valorNumerico?: string;
  valorTexto?: string;
  horarioVerificacao?: string;
}

interface ChecklistSnap {
  respostas?: RespostaSnap[];
  operador_responsavel?: string;
  contexto?: { operadorResponsavel?: string };
}

interface DiffItem {
  itemNumero: number;
  descricao: string;
  horarioAntes?: string;
  horarioDepois?: string;
  resposta?: { antes: string | null; depois: string | null };
  observacao?: { antes: string; depois: string };
  valorNumerico?: { antes: string; depois: string };
  valorTexto?: { antes: string; depois: string };
}

function diffRespostas(antes: ChecklistSnap, depois: ChecklistSnap): DiffItem[] {
  const mapAntes = new Map<number, RespostaSnap>();
  for (const r of antes.respostas ?? []) {
    if (r) mapAntes.set(r.itemNumero, r);
  }
  const diffs: DiffItem[] = [];
  for (const rd of depois.respostas ?? []) {
    if (!rd) continue;
    const ra = mapAntes.get(rd.itemNumero);
    if (!ra) continue;
    const d: DiffItem = {
      itemNumero: rd.itemNumero,
      descricao: rd.descricao,
      horarioAntes: ra.horarioVerificacao,
      horarioDepois: rd.horarioVerificacao,
    };
    let mudou = false;
    if ((ra.resposta ?? null) !== (rd.resposta ?? null)) {
      d.resposta = { antes: ra.resposta ?? null, depois: rd.resposta ?? null };
      mudou = true;
    }
    if ((ra.observacao ?? "") !== (rd.observacao ?? "")) {
      d.observacao = { antes: ra.observacao ?? "", depois: rd.observacao ?? "" };
      mudou = true;
    }
    if ((ra.valorNumerico ?? "") !== (rd.valorNumerico ?? "")) {
      d.valorNumerico = { antes: ra.valorNumerico ?? "", depois: rd.valorNumerico ?? "" };
      mudou = true;
    }
    if ((ra.valorTexto ?? "") !== (rd.valorTexto ?? "")) {
      d.valorTexto = { antes: ra.valorTexto ?? "", depois: rd.valorTexto ?? "" };
      mudou = true;
    }
    if (mudou) diffs.push(d);
  }
  return diffs;
}

function corResposta(r: string | null | undefined, tipo: "antes" | "depois"): string {
  if (r === "Não conforme") return "border-destructive/40 bg-destructive-soft text-destructive";
  if (r === "Conforme") return "border-success/40 bg-success-soft text-success";
  if (r === "Não aplicável") return "border-na/40 bg-na-soft text-na";
  return tipo === "antes"
    ? "border-destructive/30 bg-destructive-soft/50 text-destructive"
    : "border-success/30 bg-success-soft/50 text-success";
}

export function ChecklistAuditoriaResumo({
  checklist,
  edicoes,
}: {
  checklist: Checklist;
  edicoes: EdicaoChecklist[];
}) {
  const total = edicoes.length;
  const ultima = edicoes[edicoes.length - 1];
  const criadoEm = checklist.concluidoEm ?? checklist.criadoEm;

  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm md:p-6 ${
        total > 0
          ? "border-warning/40 bg-warning/10"
          : "border-border bg-card"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <History className="h-5 w-5 text-foreground" />
        <h2 className="text-lg font-bold text-foreground">Auditoria</h2>
        {total > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-warning/50 bg-warning/20 px-2.5 py-1 text-xs font-bold text-warning-foreground">
            <AlertCircle className="h-3.5 w-3.5" />
            Checklist alterado
          </span>
        ) : (
          <span className="inline-flex items-center rounded-md border border-success/30 bg-success-soft px-2.5 py-1 text-xs font-bold text-success">
            Sem alterações
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Item label="Criado em" valor={formatarDataHora(criadoEm)} />
        <Item label="Teve alterações?" valor={total > 0 ? "Sim" : "Não"} />
        <Item
          label="Última alteração em"
          valor={ultima ? formatarDataHora(ultima.editado_em) : "—"}
        />
        <Item
          label="Último alterado por"
          valor={
            ultima
              ? `${ultima.operador_responsavel} (${ultima.operador_login})`
              : "—"
          }
        />
      </div>
    </div>
  );
}

export function ChecklistHistoricoEdicoes({ edicoes }: { edicoes: EdicaoChecklist[] }) {
  if (edicoes.length === 0) return null;

  return (
    <div
      id="historico"
      className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6"
    >
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
        <History className="h-5 w-5" /> Histórico de edições
      </h2>
      <ul className="space-y-5">
        {[...edicoes].reverse().map((e) => {
          const antes = (e.checklist_antes ?? {}) as ChecklistSnap;
          const depois = (e.checklist_depois ?? {}) as ChecklistSnap;
          const diffs = diffRespostas(antes, depois);
          const respAntes =
            antes.operador_responsavel ?? antes.contexto?.operadorResponsavel;
          const respDepois =
            depois.operador_responsavel ?? depois.contexto?.operadorResponsavel;
          const mudouResponsavel =
            respAntes != null && respDepois != null && respAntes !== respDepois;

          return (
            <li
              key={e.id}
              className="rounded-xl border border-border bg-muted/30 p-4 md:p-5"
            >
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
                <p className="font-bold text-foreground">
                  Edição {e.versao} — {formatarDataHora(e.editado_em)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Alterado por:{" "}
                  <span className="font-semibold text-foreground">
                    {e.operador_responsavel}
                  </span>{" "}
                  ({e.operador_login})
                </p>
              </div>

              {mudouResponsavel && (
                <div className="mb-4 rounded-lg border border-border bg-card p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Operador responsável
                  </p>
                  <DiffLinha antes={respAntes!} depois={respDepois!} />
                </div>
              )}

              {diffs.length === 0 && !mudouResponsavel && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma diferença detectada nas respostas.
                </p>
              )}

              {diffs.length > 0 && (
                <ul className="space-y-3">
                  {diffs.map((d) => (
                    <li
                      key={d.itemNumero}
                      className="rounded-lg border border-border bg-card p-3"
                    >
                      <p className="mb-1 font-semibold text-foreground">
                        <span className="text-primary">Item {d.itemNumero}</span> —{" "}
                        {d.descricao}
                      </p>
                      {(d.horarioAntes || d.horarioDepois) && (
                        <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {d.horarioAntes && (
                            <span>
                              <span className="font-bold uppercase text-destructive">
                                Resposta original:
                              </span>{" "}
                              {formatarDataHora(d.horarioAntes)}
                            </span>
                          )}
                          {d.horarioDepois && (
                            <span>
                              <span className="font-bold uppercase text-success">Edição:</span>{" "}
                              {formatarDataHora(d.horarioDepois)}
                            </span>
                          )}
                        </p>
                      )}
                      <div className="space-y-2">
                        {d.resposta && (
                          <CampoDiff
                            titulo="Resposta"
                            antes={
                              <span
                                className={`inline-block rounded-md border px-2 py-0.5 text-xs font-bold ${corResposta(
                                  d.resposta.antes,
                                  "antes",
                                )}`}
                              >
                                {d.resposta.antes ?? "—"}
                              </span>
                            }
                            depois={
                              <span
                                className={`inline-block rounded-md border px-2 py-0.5 text-xs font-bold ${corResposta(
                                  d.resposta.depois,
                                  "depois",
                                )}`}
                              >
                                {d.resposta.depois ?? "—"}
                              </span>
                            }
                          />
                        )}
                        {d.valorNumerico && (
                          <CampoDiff
                            titulo="Valor"
                            antes={
                              <span className="text-foreground">
                                {d.valorNumerico.antes || "—"}
                              </span>
                            }
                            depois={
                              <span className="text-foreground">
                                {d.valorNumerico.depois || "—"}
                              </span>
                            }
                          />
                        )}
                        {d.valorTexto && (
                          <CampoDiff
                            titulo="Detalhes"
                            antes={
                              <span className="text-foreground">
                                {d.valorTexto.antes || "—"}
                              </span>
                            }
                            depois={
                              <span className="text-foreground">
                                {d.valorTexto.depois || "—"}
                              </span>
                            }
                          />
                        )}
                        {d.observacao && (
                          <CampoDiff
                            titulo="Observação"
                            antes={
                              <span className="text-foreground">
                                {d.observacao.antes || "—"}
                              </span>
                            }
                            depois={
                              <span className="text-foreground">
                                {d.observacao.depois || "—"}
                              </span>
                            }
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Item({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-base font-semibold text-foreground">{valor}</p>
    </div>
  );
}

function CampoDiff({
  titulo,
  antes,
  depois,
}: {
  titulo: string;
  antes: React.ReactNode;
  depois: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <div className="flex flex-col items-start gap-1.5 md:flex-row md:items-center md:gap-2">
        <div className="rounded-md border border-destructive/30 bg-destructive-soft/40 px-2 py-1 text-sm">
          <span className="mr-1 text-xs font-bold uppercase text-destructive">Antes:</span>
          {antes}
        </div>
        <ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" />
        <div className="rounded-md border border-success/30 bg-success-soft/40 px-2 py-1 text-sm">
          <span className="mr-1 text-xs font-bold uppercase text-success">Depois:</span>
          {depois}
        </div>
      </div>
    </div>
  );
}

function DiffLinha({ antes, depois }: { antes: string; depois: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5 md:flex-row md:items-center md:gap-2">
      <div className="rounded-md border border-destructive/30 bg-destructive-soft/40 px-2 py-1 text-sm">
        <span className="mr-1 text-xs font-bold uppercase text-destructive">Antes:</span>
        <span className="text-foreground">{antes}</span>
      </div>
      <ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" />
      <div className="rounded-md border border-success/30 bg-success-soft/40 px-2 py-1 text-sm">
        <span className="mr-1 text-xs font-bold uppercase text-success">Depois:</span>
        <span className="text-foreground">{depois}</span>
      </div>
    </div>
  );
}
