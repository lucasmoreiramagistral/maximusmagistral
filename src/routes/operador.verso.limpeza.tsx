import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Lock } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TelaCarregando } from "@/components/tela-carregando";
import { SignaturePad } from "@/components/signature-pad";
import { useGuard } from "@/hooks/use-guard";
import { useLimpezaTurnos } from "@/hooks/use-limpeza-turnos";
import {
  buildFolhaDiaKey,
  calcularDataOperacional,
  formatarDataBR,
} from "@/lib/operacao/data-operacional";
import {
  LABEL_LIMPEZA_ITEM_STATUS,
  LABEL_LIMPEZA_STATUS,
  TURNOS_ATIVOS_LIMPEZA,
  VERSO_CONTEXTO_FIXO,
} from "@/lib/verso/constants";
import type {
  LimpezaItem,
  LimpezaItemStatus,
  LimpezaTurno,
  LimpezaTurnoStatus,
} from "@/lib/verso/types";
import type { Turno } from "@/lib/checklist/types";
import { formatarDataHora } from "@/lib/checklist/format";
import { toast } from "sonner";

export const Route = createFileRoute("/operador/verso/limpeza")({
  head: () => ({ meta: [{ title: "Limpeza Sala de Envase — Verso da folha" }] }),
  component: LimpezaPage,
});

function LimpezaPage() {
  const { usuario, loading } = useGuard("operador");
  const equipe = usuario?.equipePadrao ?? null;
  const turnoLogado = usuario?.turnoPadrao ?? null;
  const data = calcularDataOperacional(equipe, turnoLogado);
  const folhaDiaKey = buildFolhaDiaKey(
    data,
    VERSO_CONTEXTO_FIXO.linha,
    VERSO_CONTEXTO_FIXO.maquina,
  );
  const { turnos, loading: l2, salvarTurno, conflito } = useLimpezaTurnos(
    folhaDiaKey,
    data,
  );

  const [turnoSelecionado, setTurnoSelecionado] = useState<Turno | null>(null);

  // Proteção: se de algum jeito for setado um turno diferente do logado,
  // limpa a seleção. (Defesa em profundidade — os botões já bloqueiam.)
  useEffect(() => {
    if (turnoSelecionado && turnoLogado && turnoSelecionado !== turnoLogado) {
      setTurnoSelecionado(null);
    }
  }, [turnoSelecionado, turnoLogado]);

  if (loading || !usuario || l2) return <TelaCarregando />;

  if (turnoSelecionado) {
    const t = turnos.find((x) => x.turno === turnoSelecionado);
    if (!t) {
      return (
        <div className="min-h-screen bg-background">
          <AppHeader
            titulo="Limpeza Sala de Envase"
            subtitulo={`Folha do dia ${formatarDataBR(data)}`}
            voltarPara="/operador/verso"
          />
          <main className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-10">
            <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
              Turno não encontrado para esta folha operacional.
            </div>
          </main>
        </div>
      );
    }
    return (
      <TurnoEditor
        turno={t}
        usuario={usuario}
        onVoltar={() => setTurnoSelecionado(null)}
        onSalvar={salvarTurno}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Limpeza Sala de Envase"
        subtitulo={`Folha do dia ${formatarDataBR(data)}`}
        voltarPara="/operador/verso"
      />
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-10">
        {conflito && (
          <div className="mb-4 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
            Conflito de versão: outro operador alterou um turno. Recarregue a tela.
          </div>
        )}
        <p className="mb-3 text-sm text-muted-foreground">
          Selecione seu turno para preencher os 21 itens. A validação final do
          líder é feita na tela inicial do verso da folha.
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {TURNOS_ATIVOS_LIMPEZA.map((tn) => {
            const t = turnos.find((x) => x.turno === tn);
            const ehDoOperador = tn === turnoLogado;

            // Card bloqueado (turno do colega) — não-clicável.
            if (!ehDoOperador) {
              return (
                <div
                  key={tn}
                  aria-disabled="true"
                  className="cursor-not-allowed rounded-2xl border-2 border-dashed border-border bg-muted/40 p-5 text-left opacity-70"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold text-foreground">{tn}</p>
                      <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                        <Lock className="h-3 w-3" /> Acesso restrito ao operador
                        do turno {tn}
                      </p>
                    </div>
                    {t && <StatusBadge status={t.status} />}
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {t?.operadorNome ? (
                      <p>
                        Operador:{" "}
                        <span className="font-medium text-foreground">
                          {t.operadorNome}
                        </span>
                      </p>
                    ) : (
                      <p className="italic">Ainda não preenchido</p>
                    )}
                    {t?.liderNome && (
                      <p>
                        Líder:{" "}
                        <span className="font-medium text-foreground">
                          {t.liderNome}
                        </span>
                      </p>
                    )}
                    {t?.updatedAt && (
                      <p className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {formatarDataHora(t.updatedAt)}
                      </p>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <button
                key={tn}
                type="button"
                onClick={() => setTurnoSelecionado(tn)}
                className="rounded-2xl border-2 border-primary bg-primary-soft p-5 text-left shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold text-foreground">{tn}</p>
                    <p className="text-xs font-semibold text-primary">Seu turno</p>
                  </div>
                  {t && <StatusBadge status={t.status} />}
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {t?.operadorNome ? (
                    <p>
                      Operador:{" "}
                      <span className="font-medium text-foreground">
                        {t.operadorNome}
                      </span>
                    </p>
                  ) : (
                    <p className="italic">Ainda não preenchido</p>
                  )}
                  {t?.liderNome && (
                    <p>
                      Líder:{" "}
                      <span className="font-medium text-foreground">
                        {t.liderNome}
                      </span>
                    </p>
                  )}
                  {t?.updatedAt && (
                    <p className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {formatarDataHora(t.updatedAt)}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: LimpezaTurnoStatus }) {
  const map: Record<LimpezaTurnoStatus, string> = {
    pendente: "bg-muted text-muted-foreground",
    rascunho: "bg-warning/15 text-warning",
    aguardando_validacao: "bg-warning/20 text-warning",
    validado: "bg-success/15 text-success",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${map[status]}`}
    >
      {status === "validado" && <CheckCircle2 className="h-3 w-3" />}
      {LABEL_LIMPEZA_STATUS[status]}
    </span>
  );
}

// ─── Editor de um turno ─────────────────────────────────────────────
interface TurnoEditorProps {
  turno: LimpezaTurno;
  usuario: NonNullable<ReturnType<typeof useGuard>["usuario"]>;
  onVoltar: () => void;
  onSalvar: ReturnType<typeof useLimpezaTurnos>["salvarTurno"];
}

function TurnoEditor({ turno, usuario, onVoltar, onSalvar }: TurnoEditorProps) {
  const [itens, setItens] = useState<LimpezaItem[]>(turno.itens);
  const [observacao, setObservacao] = useState<string>(turno.observacao ?? "");
  const [assinaturaOp, setAssinaturaOp] = useState<string | null>(null);
  const [motivoEdicao, setMotivoEdicao] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Snapshot fixo do status no mount — evita o "motivo de edição" piscar
  // logo após concluir o turno.
  const [jaConcluiuSnapshot, setJaConcluiuSnapshot] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    setItens(turno.itens);
    setObservacao(turno.observacao ?? "");
    if (jaConcluiuSnapshot === null) {
      setJaConcluiuSnapshot(
        turno.status === "aguardando_validacao" || turno.status === "validado",
      );
    }
  }, [turno.id, turno.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const turnoValidado = turno.status === "validado";
  const exigeMotivoEdicao = jaConcluiuSnapshot === true;

  const grupos = useMemo(() => {
    const map = new Map<string, LimpezaItem[]>();
    for (const it of itens) {
      const chave = `${it.grupo} · ${it.secao}`;
      const arr = map.get(chave) ?? [];
      arr.push(it);
      map.set(chave, arr);
    }
    return Array.from(map.entries());
  }, [itens]);

  const setStatus = (codigo: number, status: LimpezaItemStatus) => {
    setItens((prev) => prev.map((i) => (i.codigo === codigo ? { ...i, status } : i)));
  };

  const handleConcluirOperador = async () => {
    const naoRespondidos = itens.filter((i) => i.status === null).length;
    if (naoRespondidos > 0) {
      toast.error(`Responda todos os 21 itens (${naoRespondidos} pendente(s)).`);
      return;
    }
    if (!assinaturaOp) {
      toast.error("Assine para concluir o turno.");
      return;
    }
    if (exigeMotivoEdicao && !motivoEdicao.trim()) {
      toast.error("Informe o motivo da edição.");
      return;
    }
    setSalvando(true);
    try {
      const agora = new Date().toISOString();
      const payload: LimpezaTurno = {
        ...turno,
        itens,
        observacao: observacao.trim() || null,
        // Se já estava validado e o operador editou, limpar validação do líder.
        status: "aguardando_validacao",
        operadorLogin: usuario.usuario,
        operadorNome: "Operador",
        operadorUserId: usuario.userId ?? turno.operadorUserId ?? null,
        assinaturaOperador: {
          dataUrl: assinaturaOp,
          nome: "Operador",
          assinadoEm: agora,
        },
        operadorAssinouEm: agora,
        // Limpar validação do líder se houver edição posterior
        liderNome: turnoValidado ? null : turno.liderNome,
        assinaturaLider: turnoValidado ? null : turno.assinaturaLider,
        liderAssinouEm: turnoValidado ? null : turno.liderAssinouEm,
        ultimaEdicaoPorLogin: usuario.usuario,
        ultimaEdicaoPorNome: usuario.nome,
      };
      await onSalvar(payload, {
        anterior: exigeMotivoEdicao ? turno : undefined,
        editadoPorLogin: usuario.usuario,
        editadoPorNome: usuario.nome,
        motivoEdicao: motivoEdicao.trim() || undefined,
      });
      if (turnoValidado) {
        toast.warning("Turno editado: a validação do líder foi removida.");
      } else {
        toast.success("Turno concluído. Aguardando validação do líder.");
      }
      onVoltar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo={`Limpeza — ${turno.turno}`}
        subtitulo="21 itens · validação do líder na tela inicial do verso"
      />
      <main className="mx-auto w-full max-w-[1000px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-4 flex items-center justify-between">
          <Button variant="outline" onClick={onVoltar}>
            ← Voltar aos turnos
          </Button>
          <StatusBadge status={turno.status} />
        </div>

        {turnoValidado && (
          <div className="mb-4 rounded-xl border-2 border-warning/40 bg-warning/10 p-4 text-sm">
            Editar este turno após validação removerá a validação do líder. Será
            necessária nova validação na tela inicial do verso.
          </div>
        )}

        {/* Itens agrupados */}
        <div className="space-y-5">
          {grupos.map(([titulo, lista]) => (
            <section key={titulo}>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                {titulo}
              </h3>
              <div className="space-y-2">
                {lista.map((it) => (
                  <div
                    key={it.codigo}
                    className="rounded-xl border border-border bg-card p-3"
                  >
                    <p className="text-sm text-foreground">
                      <span className="mr-2 font-bold">{it.codigo}.</span>
                      {it.descricao}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(["realizado", "nao_realizado", "nao_aplicavel"] as const).map(
                        (s) => (
                          <Button
                            key={s}
                            type="button"
                            size="sm"
                            variant={it.status === s ? "default" : "outline"}
                            onClick={() => setStatus(it.codigo, s)}
                            className="h-9"
                          >
                            {LABEL_LIMPEZA_ITEM_STATUS[s]}
                          </Button>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Bloco operador */}
        <div className="mt-8 rounded-2xl border-2 border-border bg-card p-5">
          <h3 className="text-lg font-bold text-foreground">Conclusão do operador</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {exigeMotivoEdicao
              ? `Já concluído por ${turno.operadorNome ?? "—"}. Para alterar, informe o motivo e assine novamente.`
              : "Assine para concluir o turno. A validação do líder é feita na tela inicial do verso."}
          </p>

          {exigeMotivoEdicao && (
            <div className="mt-3">
              <Label htmlFor="motivo">Motivo da edição *</Label>
              <Input
                id="motivo"
                value={motivoEdicao}
                onChange={(e) => setMotivoEdicao(e.target.value)}
                placeholder="Ex.: corrigir item 12"
                className="mt-1.5"
              />
            </div>
          )}

          <div className="mt-4">
            <Label htmlFor="obs-limpeza" className="text-base">
              Observações do turno (opcional)
            </Label>
            <p className="text-xs text-muted-foreground">
              Será espelhada no campo "Observações" da frente da folha.
            </p>
            <Textarea
              id="obs-limpeza"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: faltou papel-toalha às 10h, reposto."
              className="mt-1.5"
              rows={3}
            />
          </div>

          <div className="mt-4">
            <SignaturePad
              value={assinaturaOp}
              onChange={setAssinaturaOp}
              label="Assinatura — Operador"
              ajuda="Qualquer operador da equipe pode assinar."
            />
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={handleConcluirOperador} disabled={salvando}>
              Concluir turno
            </Button>
          </div>
        </div>

        {turnoValidado && turno.assinaturaLider && (
          <div className="mt-6 rounded-2xl border-2 border-success/40 bg-success/5 p-5 text-sm">
            <p className="font-semibold text-foreground">
              ✓ Validado por {turno.liderNome} em{" "}
              {formatarDataHora(turno.assinaturaLider.assinadoEm)}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
