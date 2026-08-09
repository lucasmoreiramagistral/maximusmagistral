import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck, Droplets, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SignaturePad } from "@/components/signature-pad";
import { TelaCarregando } from "@/components/tela-carregando";
import { useProducaoApoio } from "@/hooks/use-producao-apoio";
import {
  APOIO_ATIVIDADES,
  APOIO_GRUPOS,
  ASSEPSIA_DESCRICAO,
  CIP_DESCRICAO,
  CIP_ETAPAS,
} from "@/lib/producao/apoio-constants";
import type { ProducaoApoio } from "@/lib/producao/apoio-types";
import type { Turno, Usuario } from "@/lib/checklist/types";

function agoraIso() {
  return new Date().toISOString();
}

interface ApoioSecoesProps {
  usuario: Usuario;
  turno: Turno;
  data: string;
  folhaDiaKey: string;
}

/**
 * Blocos de apoio da frente do relatório operacional horário:
 * Checklist de Apoio + Assepsia + CIP. Renderizado dentro do Hora x Hora.
 */
export function ApoioSecoes({ usuario, turno, data, folhaDiaKey }: ApoioSecoesProps) {
  const { apoio, loading: carregando, conflito, salvar } = useProducaoApoio(
    folhaDiaKey,
    data,
    turno,
    usuario?.userId ?? null,
  );

  const [rascunho, setRascunho] = useState<ProducaoApoio | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (apoio) setRascunho(apoio);
  }, [apoio]);

  if (carregando || !rascunho) return <TelaCarregando />;


  const atual = rascunho;
  const feitos = atual.checklist.filter((c) => c.feito).length;

  function patch(p: Partial<ProducaoApoio>) {
    setRascunho((prev) => (prev ? { ...prev, ...p } : prev));
  }

  async function handleSalvar() {
    if (!rascunho || !usuario) return;
    const cip = rascunho.cip;
    for (const def of CIP_ETAPAS) {
      if (!def.comHorario) continue;
      const e = cip.find((x) => x.codigo === def.codigo);
      if (e && ((e.inicio && !e.fim) || (!e.inicio && e.fim))) {
        toast.error(`Preencha início e fim da etapa "${def.titulo}" do CIP.`);
        return;
      }
    }
    for (const t of rascunho.assepsia) {
      if ((t.inicio && !t.fim) || (!t.inicio && t.fim)) {
        toast.error(`Preencha início e fim da ${t.ordem}ª troca de sabor.`);
        return;
      }
    }

    setSalvando(true);
    try {
      await salvar({
        ...rascunho,
        operadorLogin: usuario.usuario,
        operadorNome: usuario.nome,
        operadorUserId: usuario.userId ?? null,
        ultimaEdicaoPorLogin: usuario.usuario,
        ultimaEdicaoPorNome: usuario.nome,
      });
      toast.success("Apoio, assepsia e CIP salvos.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Não foi possível salvar: ${msg}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Apoio, Assepsia e CIP"
        subtitulo={`Folha do dia ${formatarDataBR(data)} · ${turno}${turnoAtivo.ehExtra ? " · EXTRA" : ""}`}
        voltarPara="/operador"
      />
      <main className="mx-auto w-full max-w-[1000px] px-4 py-6 md:px-8 md:py-10">
        {conflito && (
          <div className="mb-4 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
            Conflito de versão: outra pessoa alterou esta folha. Recarregue a tela
            antes de salvar.
          </div>
        )}

        <Tabs defaultValue="apoio">
          <TabsList className="mb-4 grid w-full grid-cols-3">
            <TabsTrigger value="apoio">Apoio ({feitos}/{atual.checklist.length})</TabsTrigger>
            <TabsTrigger value="assepsia">Assepsia</TabsTrigger>
            <TabsTrigger value="cip">CIP</TabsTrigger>
          </TabsList>

          {/* ─── Checklist de apoio ─────────────────────────────── */}
          <TabsContent value="apoio" className="space-y-4">
            <Cabecalho
              icone={<ClipboardCheck className="h-5 w-5" />}
              titulo="Checklist de apoio"
              texto="Atividades fundamentais durante o expediente do operador. Marque quando concluído no seu turno."
            />
            {APOIO_GRUPOS.map((grupo) => (
              <div key={grupo} className="rounded-2xl border border-border bg-card p-4">
                <p className="mb-3 text-sm font-bold uppercase text-muted-foreground">
                  {grupo}
                </p>
                <div className="space-y-2">
                  {APOIO_ATIVIDADES.filter((a) => a.grupo === grupo).map((a) => {
                    const marc = atual.checklist.find((c) => c.codigo === a.codigo);
                    return (
                      <label
                        key={a.codigo}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary/50"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={Boolean(marc?.feito)}
                          onCheckedChange={(v) =>
                            patch({
                              checklist: atual.checklist.map((c) =>
                                c.codigo === a.codigo
                                  ? {
                                      ...c,
                                      feito: v === true,
                                      marcadoEm: v === true ? agoraIso() : null,
                                    }
                                  : c,
                              ),
                            })
                          }
                        />
                        <span className="text-sm text-foreground">{a.descricao}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </TabsContent>

          {/* ─── Assepsia ───────────────────────────────────────── */}
          <TabsContent value="assepsia" className="space-y-4">
            <Cabecalho
              icone={<Droplets className="h-5 w-5" />}
              titulo="Controle de processo — assepsia (troca de sabor p/ sabor)"
              texto={ASSEPSIA_DESCRICAO}
            />
            {atual.assepsia.map((t) => (
              <div key={t.ordem} className="rounded-2xl border border-border bg-card p-4">
                <p className="mb-3 text-sm font-bold text-foreground">
                  {t.ordem}ª troca de sabor
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Sabor</Label>
                    <Input
                      value={t.sabor ?? ""}
                      onChange={(e) =>
                        patch({
                          assepsia: atual.assepsia.map((x) =>
                            x.ordem === t.ordem
                              ? { ...x, sabor: e.target.value || null }
                              : x,
                          ),
                        })
                      }
                      placeholder="Ex.: Tauá"
                      className="mt-1 h-12 text-base"
                    />
                  </div>
                  <div>
                    <Label>Início</Label>
                    <Input
                      type="time"
                      value={t.inicio ?? ""}
                      onChange={(e) =>
                        patch({
                          assepsia: atual.assepsia.map((x) =>
                            x.ordem === t.ordem
                              ? { ...x, inicio: e.target.value || null }
                              : x,
                          ),
                        })
                      }
                      className="mt-1 h-12 text-base"
                    />
                  </div>
                  <div>
                    <Label>Fim</Label>
                    <Input
                      type="time"
                      value={t.fim ?? ""}
                      onChange={(e) =>
                        patch({
                          assepsia: atual.assepsia.map((x) =>
                            x.ordem === t.ordem
                              ? { ...x, fim: e.target.value || null }
                              : x,
                          ),
                        })
                      }
                      className="mt-1 h-12 text-base"
                    />
                  </div>
                </div>
              </div>
            ))}
          </TabsContent>

          {/* ─── CIP ────────────────────────────────────────────── */}
          <TabsContent value="cip" className="space-y-4">
            <Cabecalho
              icone={<FlaskConical className="h-5 w-5" />}
              titulo="Controle de processo de CIP"
              texto={CIP_DESCRICAO}
            />
            {CIP_ETAPAS.map((def) => {
              const etapa = atual.cip.find((e) => e.codigo === def.codigo);
              return (
                <div key={def.codigo} className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-sm font-bold text-foreground">{def.titulo}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{def.descricao}</p>
                  {def.comHorario ? (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <Label>Início</Label>
                        <Input
                          type="time"
                          value={etapa?.inicio ?? ""}
                          onChange={(e) =>
                            patch({
                              cip: atual.cip.map((x) =>
                                x.codigo === def.codigo
                                  ? {
                                      ...x,
                                      inicio: e.target.value || null,
                                      feito: Boolean(e.target.value || x.fim),
                                    }
                                  : x,
                              ),
                            })
                          }
                          className="mt-1 h-12 text-base"
                        />
                      </div>
                      <div>
                        <Label>Fim</Label>
                        <Input
                          type="time"
                          value={etapa?.fim ?? ""}
                          onChange={(e) =>
                            patch({
                              cip: atual.cip.map((x) =>
                                x.codigo === def.codigo
                                  ? {
                                      ...x,
                                      fim: e.target.value || null,
                                      feito: Boolean(e.target.value || x.inicio),
                                    }
                                  : x,
                              ),
                            })
                          }
                          className="mt-1 h-12 text-base"
                        />
                      </div>
                    </div>
                  ) : (
                    <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3">
                      <Checkbox
                        checked={Boolean(etapa?.feito)}
                        onCheckedChange={(v) =>
                          patch({
                            cip: atual.cip.map((x) =>
                              x.codigo === def.codigo ? { ...x, feito: v === true } : x,
                            ),
                          })
                        }
                      />
                      <span className="text-sm text-foreground">Etapa concluída</span>
                    </label>
                  )}
                </div>
              );
            })}

            <div className="rounded-2xl border border-border bg-card p-4">
              <Label htmlFor="cip-obs">Observações do CIP</Label>
              <Textarea
                id="cip-obs"
                value={atual.cipObservacao ?? ""}
                onChange={(e) => patch({ cipObservacao: e.target.value || null })}
                placeholder="Anotações sobre o processo de CIP (opcional)"
                className="mt-1 min-h-24 text-base"
              />
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <SignaturePad
                label="Assinatura do operador executante do CIP"
                ajuda="Assine com o dedo ou o mouse."
                value={atual.assinaturaOperadorCip?.dataUrl ?? null}
                onChange={(dataUrl) =>
                  patch({
                    assinaturaOperadorCip: dataUrl
                      ? {
                          dataUrl,
                          nome: usuario.nome,
                          assinadoEm: agoraIso(),
                        }
                      : null,
                  })
                }
              />
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cq-nome">Nome do CQ (liberação)</Label>
                  <Input
                    id="cq-nome"
                    value={atual.assinaturaCq?.nome ?? ""}
                    onChange={(e) =>
                      patch({
                        assinaturaCq: atual.assinaturaCq
                          ? { ...atual.assinaturaCq, nome: e.target.value }
                          : {
                              dataUrl: "",
                              nome: e.target.value,
                              assinadoEm: agoraIso(),
                            },
                      })
                    }
                    placeholder="Nome de quem liberou"
                    className="mt-1 h-12 text-base"
                  />
                </div>
                <div>
                  <Label htmlFor="cq-hora">Horário da liberação</Label>
                  <Input
                    id="cq-hora"
                    type="time"
                    value={atual.cqHorario ?? ""}
                    onChange={(e) => patch({ cqHorario: e.target.value || null })}
                    className="mt-1 h-12 text-base"
                  />
                </div>
              </div>
              <SignaturePad
                label="Assinatura de liberação do CQ"
                value={atual.assinaturaCq?.dataUrl || null}
                onChange={(dataUrl) =>
                  patch({
                    assinaturaCq: dataUrl
                      ? {
                          dataUrl,
                          nome: atual.assinaturaCq?.nome ?? "",
                          assinadoEm: agoraIso(),
                        }
                      : atual.assinaturaCq?.nome
                        ? { ...atual.assinaturaCq, dataUrl: "" }
                        : null,
                  })
                }
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="sticky bottom-0 mt-6 border-t border-border bg-background/95 py-4 backdrop-blur">
          <Button
            onClick={handleSalvar}
            disabled={salvando}
            className="h-14 w-full text-base font-bold"
          >
            <CheckCircle2 className="mr-2 h-5 w-5" />
            {salvando ? "Salvando..." : "Salvar apoio, assepsia e CIP"}
          </Button>
        </div>
      </main>
    </div>
  );
}

function Cabecalho({
  icone,
  titulo,
  texto,
}: {
  icone: React.ReactNode;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-primary-soft/40 p-4">
      <span className="mt-0.5 text-primary">{icone}</span>
      <div>
        <p className="text-sm font-bold text-foreground">{titulo}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}
