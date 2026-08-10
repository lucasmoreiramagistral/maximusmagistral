import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Beaker, CheckCircle2, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SignaturePad } from "@/components/signature-pad";
import { TelaCarregando } from "@/components/tela-carregando";
import { useProducaoVerso } from "@/hooks/use-producao-verso";
import { PASSAGEM_BLOCOS } from "@/lib/producao/verso-constants";
import type {
  ProducaoPassagem,
  ProducaoTanque,
} from "@/lib/producao/verso-types";
import type { Turno, Usuario } from "@/lib/checklist/types";

function agoraIso() {
  return new Date().toISOString();
}

interface VersoSecoesProps {
  usuario: Usuario;
  turno: Turno;
  data: string;
  folhaDiaKey: string;
}

/**
 * Verso do relatório operacional horário: controle de tanques de xarope
 * (18 linhas) + passagem de turno com assinatura do operador e do líder.
 */
export function VersoSecoes({ usuario, turno, data, folhaDiaKey }: VersoSecoesProps) {
  const {
    tanques,
    passagem,
    bloco,
    loading,
    conflito,
    salvarTanque,
    salvarPassagem,
  } = useProducaoVerso(folhaDiaKey, data, turno, usuario?.userId ?? null);

  const [rascunhos, setRascunhos] = useState<Record<string, ProducaoTanque>>({});
  const [rascunhoPassagem, setRascunhoPassagem] = useState<ProducaoPassagem | null>(
    null,
  );
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (tanques.length) {
      setRascunhos(Object.fromEntries(tanques.map((t) => [t.id, t])));
    }
  }, [tanques]);

  useEffect(() => {
    if (passagem) setRascunhoPassagem(passagem);
  }, [passagem]);

  if (loading || !rascunhoPassagem) return <TelaCarregando />;

  const lista = tanques.map((t) => rascunhos[t.id] ?? t);
  const preenchidos = lista.filter(
    (t) => t.sabor || t.numeroTanque || t.lote || t.qtdInicialLitros !== null,
  ).length;

  function patchTanque(id: string, p: Partial<ProducaoTanque>) {
    setRascunhos((prev) => {
      const base = prev[id] ?? tanques.find((t) => t.id === id);
      if (!base) return prev;
      return { ...prev, [id]: { ...base, ...p } };
    });
  }

  function patchPassagem(p: Partial<ProducaoPassagem>) {
    setRascunhoPassagem((prev) => (prev ? { ...prev, ...p } : prev));
  }

  function numeroOuNulo(v: string): number | null {
    if (v.trim() === "") return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  async function handleSalvarTanques() {
    const alterados = lista.filter((t) => {
      const original = tanques.find((o) => o.id === t.id);
      return original && JSON.stringify(original) !== JSON.stringify(t);
    });
    if (alterados.length === 0) {
      toast.info("Nenhuma alteração nos tanques para salvar.");
      return;
    }
    for (const t of alterados) {
      if ((t.horaInicio && !t.horaTermino) || (!t.horaInicio && t.horaTermino)) {
        toast.error(`Preencha hora de início e término do tanque ${t.ordem}.`);
        return;
      }
    }

    setSalvando(true);
    try {
      for (const t of alterados) {
        await salvarTanque({
          ...t,
          operadorLogin: usuario.usuario,
          operadorNome: usuario.nome,
          operadorUserId: usuario.userId ?? null,
          ultimaEdicaoPorLogin: usuario.usuario,
          ultimaEdicaoPorNome: usuario.nome,
        });
      }
      toast.success(
        `${alterados.length} ${alterados.length === 1 ? "tanque salvo" : "tanques salvos"}.`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Não foi possível salvar: ${msg}`);
    } finally {
      setSalvando(false);
    }
  }

  async function handleSalvarPassagem() {
    if (!rascunhoPassagem) return;
    if (rascunhoPassagem.assinaturaLider?.dataUrl && !rascunhoPassagem.liderNome) {
      toast.error("Informe o nome do líder antes de registrar a assinatura dele.");
      return;
    }
    setSalvando(true);
    try {
      await salvarPassagem({
        ...rascunhoPassagem,
        operadorLogin: usuario.usuario,
        operadorNome: usuario.nome,
        operadorUserId: usuario.userId ?? null,
        ultimaEdicaoPorLogin: usuario.usuario,
        ultimaEdicaoPorNome: usuario.nome,
      });
      toast.success("Passagem de turno salva.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Não foi possível salvar: ${msg}`);
    } finally {
      setSalvando(false);
    }
  }

  const rotuloBloco =
    PASSAGEM_BLOCOS.find((b) => b.codigo === bloco)?.rotulo ?? bloco;

  return (
    <div>
      {conflito && (
        <div className="mb-4 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
          Conflito de versão: outra pessoa alterou este verso. Recarregue a tela
          antes de salvar.
        </div>
      )}

      <Tabs defaultValue="tanques">
        <TabsList className="mb-4 grid w-full grid-cols-2">
          <TabsTrigger value="tanques">
            Tanques ({preenchidos}/{lista.length})
          </TabsTrigger>
          <TabsTrigger value="passagem">Passagem de turno</TabsTrigger>
        </TabsList>

        {/* ─── Tanques de xarope ──────────────────────────────── */}
        <TabsContent value="tanques" className="space-y-4">
          <Cabecalho
            icone={<Beaker className="h-5 w-5" />}
            titulo="Controle de tanques de xarope"
            texto="Registre sabor, tamanho, número do tanque, lote, quantidade e horários de cada tanque utilizado no turno."
          />

          <div className="space-y-3">
            {lista.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <p className="mb-3 text-sm font-bold text-foreground">
                  Tanque {t.ordem}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label>Sabor</Label>
                    <Input
                      value={t.sabor ?? ""}
                      onChange={(e) =>
                        patchTanque(t.id, { sabor: e.target.value || null })
                      }
                      placeholder="Ex.: Tauá"
                      className="mt-1 h-12 text-base"
                    />
                  </div>
                  <div>
                    <Label>Tamanho</Label>
                    <Input
                      value={t.tamanho ?? ""}
                      onChange={(e) =>
                        patchTanque(t.id, { tamanho: e.target.value || null })
                      }
                      placeholder="Ex.: 1L"
                      className="mt-1 h-12 text-base"
                    />
                  </div>
                  <div>
                    <Label>Nº do tanque</Label>
                    <Input
                      value={t.numeroTanque ?? ""}
                      onChange={(e) =>
                        patchTanque(t.id, { numeroTanque: e.target.value || null })
                      }
                      placeholder="Ex.: TQ-02"
                      className="mt-1 h-12 text-base"
                    />
                  </div>
                  <div>
                    <Label>Lote</Label>
                    <Input
                      value={t.lote ?? ""}
                      onChange={(e) =>
                        patchTanque(t.id, { lote: e.target.value || null })
                      }
                      className="mt-1 h-12 text-base"
                    />
                  </div>
                  <div>
                    <Label>Qtd. inicial (L)</Label>
                    <Input
                      inputMode="decimal"
                      value={t.qtdInicialLitros ?? ""}
                      onChange={(e) =>
                        patchTanque(t.id, {
                          qtdInicialLitros: numeroOuNulo(e.target.value),
                        })
                      }
                      className="mt-1 h-12 text-base"
                    />
                  </div>
                  <div>
                    <Label>Qtd. final (L)</Label>
                    <Input
                      inputMode="decimal"
                      value={t.qtdFinalLitros ?? ""}
                      onChange={(e) =>
                        patchTanque(t.id, {
                          qtdFinalLitros: numeroOuNulo(e.target.value),
                        })
                      }
                      className="mt-1 h-12 text-base"
                    />
                  </div>
                  <div>
                    <Label>Início</Label>
                    <Input
                      type="time"
                      value={t.horaInicio ?? ""}
                      onChange={(e) =>
                        patchTanque(t.id, { horaInicio: e.target.value || null })
                      }
                      className="mt-1 h-12 text-base"
                    />
                  </div>
                  <div>
                    <Label>Término</Label>
                    <Input
                      type="time"
                      value={t.horaTermino ?? ""}
                      onChange={(e) =>
                        patchTanque(t.id, { horaTermino: e.target.value || null })
                      }
                      className="mt-1 h-12 text-base"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <Label>Observação</Label>
                  <Input
                    value={t.observacao ?? ""}
                    onChange={(e) =>
                      patchTanque(t.id, { observacao: e.target.value || null })
                    }
                    placeholder="Opcional"
                    className="mt-1 h-12 text-base"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="sticky bottom-0 mt-6 border-t border-border bg-background/95 py-4 backdrop-blur">
            <Button
              onClick={handleSalvarTanques}
              disabled={salvando}
              className="h-14 w-full text-base font-bold"
            >
              <CheckCircle2 className="mr-2 h-5 w-5" />
              {salvando ? "Salvando..." : "Salvar tanques"}
            </Button>
          </div>
        </TabsContent>

        {/* ─── Passagem de turno ──────────────────────────────── */}
        <TabsContent value="passagem" className="space-y-4">
          <Cabecalho
            icone={<Repeat className="h-5 w-5" />}
            titulo={`Passagem de turno — ${rotuloBloco}`}
            texto="Registre as ocorrências do turno e colha as assinaturas do operador e do líder."
          />

          <div className="rounded-2xl border border-border bg-card p-4">
            <Label htmlFor="ocorrencias">Ocorrências do turno</Label>
            <Textarea
              id="ocorrencias"
              value={rascunhoPassagem.ocorrencias ?? ""}
              onChange={(e) =>
                patchPassagem({ ocorrencias: e.target.value || null })
              }
              placeholder="Descreva paradas, problemas, pendências e o que o próximo turno precisa saber."
              className="mt-1 min-h-32 text-base"
            />
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <SignaturePad
              label="Assinatura do operador"
              ajuda="Assine com o dedo ou o mouse."
              value={rascunhoPassagem.assinaturaOperador?.dataUrl ?? null}
              onChange={(dataUrl) =>
                patchPassagem({
                  assinaturaOperador: dataUrl
                    ? { dataUrl, nome: usuario.nome, assinadoEm: agoraIso() }
                    : null,
                })
              }
            />
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3">
              <Label htmlFor="lider-nome">Nome do líder</Label>
              <Input
                id="lider-nome"
                value={rascunhoPassagem.liderNome ?? ""}
                onChange={(e) =>
                  patchPassagem({ liderNome: e.target.value || null })
                }
                placeholder="Nome completo do líder do turno"
                className="mt-1 h-12 text-base"
              />
            </div>
            <SignaturePad
              label="Assinatura do líder"
              ajuda="O líder assina confirmando a passagem de turno."
              value={rascunhoPassagem.assinaturaLider?.dataUrl ?? null}
              onChange={(dataUrl) =>
                patchPassagem({
                  assinaturaLider: dataUrl
                    ? {
                        dataUrl,
                        nome: rascunhoPassagem.liderNome ?? "",
                        assinadoEm: agoraIso(),
                      }
                    : null,
                })
              }
            />
          </div>

          <div className="sticky bottom-0 mt-6 border-t border-border bg-background/95 py-4 backdrop-blur">
            <Button
              onClick={handleSalvarPassagem}
              disabled={salvando}
              className="h-14 w-full text-base font-bold"
            >
              <CheckCircle2 className="mr-2 h-5 w-5" />
              {salvando ? "Salvando..." : "Salvar passagem de turno"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
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
