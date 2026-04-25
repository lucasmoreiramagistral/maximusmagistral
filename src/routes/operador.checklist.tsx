import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertTriangle,
  Pencil,
  Loader2,
  Check,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useRascunho } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";
import { storage } from "@/lib/checklist/storage";
import { ITENS_CHECKLIST } from "@/lib/checklist/itens";
import type { Resposta, RespostaItem, ItemChecklistDef, Checklist } from "@/lib/checklist/types";
import { formatarHora } from "@/lib/checklist/format";
import { checklistEmEdicao } from "@/lib/checklist/edicao";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/operador/checklist")({
  head: () => ({ meta: [{ title: "Checklist em andamento" }] }),
  component: ChecklistPage,
});

function ChecklistPage() {
  const navigate = useNavigate();
  const { usuario, loading } = useGuard("operador");
  const rascunho = useRascunho();

  const [erroGlobal, setErroGlobal] = useState("");
  const [itensComErro, setItensComErro] = useState<Set<number>>(new Set());
  const [modoEdicao, setModoEdicao] = useState(false);

  // Indicador de salvamento: "idle" | "saving" | "saved"
  const [statusSalvamento, setStatusSalvamento] = useState<"idle" | "saving" | "saved">("idle");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // refs por itemNumero para scroll
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || loading || !usuario) return;
    if (!rascunho) navigate({ to: "/operador" });
  }, [usuario, loading, rascunho, navigate]);

  // Marca modo edição
  useEffect(() => {
    if (typeof window === "undefined" || !rascunho) return;
    setModoEdicao(checklistEmEdicao() === rascunho.id);
  }, [rascunho]);

  const itensDef: ItemChecklistDef[] = useMemo(() => {
    if (!rascunho) return [];
    return rascunho.respostas
      .map((r) => ITENS_CHECKLIST.find((i) => i.numero === r.itemNumero))
      .filter((i): i is ItemChecklistDef => Boolean(i));
  }, [rascunho]);

  if (loading || !usuario) return <TelaCarregando />;
  if (!rascunho) return null;

  const total = rascunho.respostas.length;
  const respondidos = rascunho.respostas.filter((r) => r.resposta !== null).length;
  const pendentes = total - respondidos;
  const progresso = total === 0 ? 0 : (respondidos / total) * 100;

  // Atualiza UI imediatamente + persiste rascunho em background (não bloqueia o clique).
  // CRÍTICO: lê o rascunho MAIS RECENTE do storage antes de aplicar o patch,
  // para evitar race condition entre cliques rápidos consecutivos (cada clique
  // dispara setRascunho, mas o `rascunho` do hook só se atualiza no próximo tick).
  const atualizarRespostaPorNumero = (itemNumero: number, patch: Partial<RespostaItem>) => {
    if (!rascunho) return;
    const atual = storage.getRascunho() ?? rascunho;
    // só aceita o storage se for o mesmo checklist (mesmo id)
    const base = atual.id === rascunho.id ? atual : rascunho;
    const novas = base.respostas.map((r) =>
      r.itemNumero === itemNumero ? { ...r, ...patch } : r,
    );
    const next: Checklist = { ...base, respostas: novas };
    setStatusSalvamento("saving");
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
    try {
      storage.setRascunho(next);
      setStatusSalvamento("saved");
      savedTimerRef.current = setTimeout(() => {
        setStatusSalvamento("idle");
        savedTimerRef.current = null;
      }, 1500);
    } catch {
      // silencioso — re-render via useRascunho cobre o estado local
      setStatusSalvamento("idle");
    }
    // limpa o estado de erro daquele item ao interagir
    setItensComErro((prev) => {
      if (!prev.has(itemNumero)) return prev;
      const novo = new Set(prev);
      novo.delete(itemNumero);
      return novo;
    });
    setErroGlobal("");
  };

  const escolher = (itemNumero: number, r: Resposta) => {
    const patch: Partial<RespostaItem> = {
      resposta: r,
      horarioVerificacao: new Date().toISOString(),
    };
    atualizarRespostaPorNumero(itemNumero, patch);
  };

  // Validação final: retorna lista de itensNumero com erro + mensagem
  const validarTudo = (): { ok: boolean; itens: number[]; mensagem: string } => {
    const erros: number[] = [];
    let mensagem = "";

    for (const r of rascunho.respostas) {
      const def = ITENS_CHECKLIST.find((i) => i.numero === r.itemNumero);
      if (!def) continue;

      if (!r.resposta) {
        erros.push(r.itemNumero);
        continue;
      }
      if (r.resposta === "Não conforme") {
        if (r.observacao.trim().length < 3) {
          erros.push(r.itemNumero);
          continue;
        }
      }
      if (def.tipo === "numerico" && r.resposta === "Conforme" && !r.valorNumerico.trim()) {
        erros.push(r.itemNumero);
        continue;
      }
    }

    if (erros.length > 0) {
      const algumPendente = rascunho.respostas.some(
        (r) => erros.includes(r.itemNumero) && !r.resposta,
      );
      const algumNCSemObs = rascunho.respostas.some(
        (r) =>
          erros.includes(r.itemNumero) &&
          r.resposta === "Não conforme" &&
          r.observacao.trim().length < 3,
      );
      const algumNumSemValor = rascunho.respostas.some((r) => {
        if (!erros.includes(r.itemNumero)) return false;
        const def = ITENS_CHECKLIST.find((i) => i.numero === r.itemNumero);
        return def?.tipo === "numerico" && r.resposta === "Conforme" && !r.valorNumerico.trim();
      });

      if (algumPendente) mensagem = `Ainda existem ${erros.length} item(s) com pendência. Veja os destacados em vermelho.`;
      else if (algumNCSemObs) mensagem = "Preencha a observação dos itens não conformes (mínimo 3 caracteres).";
      else if (algumNumSemValor) mensagem = "Informe o valor medido nos itens numéricos conformes.";
      else mensagem = "Existem itens com pendência. Veja os destacados.";
    }

    return { ok: erros.length === 0, itens: erros, mensagem };
  };

  // Garante que tudo foi gravado no storage antes de navegar.
  // Como `setRascunho` é síncrono (localStorage), basta aguardar o flush
  // do estado "saving" → "saved" antes de seguir.
  const aguardarPersistencia = (): Promise<void> => {
    return new Promise((resolve) => {
      if (statusSalvamento !== "saving") return resolve();
      // pequeno yield para garantir flush do último setRascunho
      setTimeout(resolve, 50);
    });
  };

  const concluirMomento = async () => {
    const r = validarTudo();
    if (!r.ok) {
      setItensComErro(new Set(r.itens));
      setErroGlobal(r.mensagem);
      // scroll até o primeiro item com erro
      const primeiro = r.itens[0];
      if (primeiro !== undefined) {
        setTimeout(() => {
          const el = cardRefs.current[primeiro];
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
      }
      return;
    }
    setItensComErro(new Set());
    setErroGlobal("");
    await aguardarPersistencia();
    navigate({ to: "/operador/resumo" });
  };

  const voltarMomentos = async () => {
    await aguardarPersistencia();
    navigate({ to: "/operador/momento" });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo={rascunho.momento}
        subtitulo={`${rascunho.contexto.turno} · ${rascunho.contexto.equipe}`}
      />

      {/* Header sticky compacto */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto w-full max-w-[1100px] px-4 py-3 md:px-8">
          {modoEdicao && (
            <div className="mb-2 flex items-center gap-2 rounded-md border-2 border-warning/40 bg-warning/15 px-3 py-1.5 text-xs font-semibold text-warning-foreground">
              <Pencil className="h-3.5 w-3.5" />
              Modo de edição do checklist já preenchido
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground md:text-base">
              {respondidos}/{total} respondidos
              {pendentes > 0 && (
                <span className="ml-2 text-muted-foreground">· {pendentes} pendente(s)</span>
              )}
            </p>
            <div className="flex items-center gap-3">
              <IndicadorSalvamento status={statusSalvamento} />
              <p className="text-xs text-muted-foreground md:text-sm">
                {Math.round(progresso)}%
              </p>
            </div>
          </div>
          <Progress value={progresso} className="mt-2 h-2" />
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1100px] px-4 pt-4 pb-32 md:px-8 md:pt-6">
        <div className="space-y-4">
          {rascunho.respostas.map((resp) => {
            const def = itensDef.find((d) => d.numero === resp.itemNumero);
            if (!def) return null;
            return (
              <CardItem
                key={resp.itemNumero}
                refCallback={(el) => {
                  cardRefs.current[resp.itemNumero] = el;
                }}
                resposta={resp}
                def={def}
                decisao={decisoesNC[resp.itemNumero] ?? null}
                temErro={itensComErro.has(resp.itemNumero)}
                abrindoAnomalia={abrindoAnomaliaItem === resp.itemNumero}
                bloqueado={abrindoAnomaliaItem !== null && abrindoAnomaliaItem !== resp.itemNumero}
                modoEdicao={modoEdicao}
                onResponder={(r) => escolher(resp.itemNumero, r)}
                onAtualizar={(patch) => atualizarRespostaPorNumero(resp.itemNumero, patch)}
                onSetDecisao={(d) => setDecisao(resp.itemNumero, d)}
                onIrAnomalia={() => irParaAnomalia(resp)}
              />
            );
          })}
        </div>

        {erroGlobal && (
          <div className="mt-5 rounded-md border-2 border-destructive bg-destructive-soft px-4 py-3 text-sm font-semibold text-destructive">
            {erroGlobal}
          </div>
        )}
      </main>

      {/* Rodapé fixo */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-3 px-4 py-3 md:px-8">
          <Button
            variant="outline"
            size="lg"
            className="h-12 px-5 text-sm md:h-14 md:px-6 md:text-base"
            onClick={voltarMomentos}
            disabled={abrindoAnomaliaItem !== null}
          >
            ← Voltar
          </Button>
          <Button
            size="lg"
            className="h-12 px-6 text-sm font-semibold md:h-14 md:px-8 md:text-base"
            onClick={concluirMomento}
            disabled={abrindoAnomaliaItem !== null}
          >
            Concluir momento →
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Indicador de salvamento (Salvando… / Salvo)
// ─────────────────────────────────────────────────────────────────

function IndicadorSalvamento({ status }: { status: "idle" | "saving" | "saved" }) {
  if (status === "idle") return null;
  if (status === "saving") {
    return (
      <span
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Salvando…
      </span>
    );
  }
  return (
    <span
      role="status"
      aria-live="polite"
      className="flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success animate-in fade-in"
    >
      <Check className="h-3.5 w-3.5" />
      Salvo
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────
// Card de item (corrido)
// ─────────────────────────────────────────────────────────────────

function CardItem({
  resposta,
  def,
  decisao,
  temErro,
  abrindoAnomalia,
  bloqueado,
  modoEdicao,
  refCallback,
  onResponder,
  onAtualizar,
  onSetDecisao,
  onIrAnomalia,
}: {
  resposta: RespostaItem;
  def: ItemChecklistDef;
  decisao: DecisaoNC;
  temErro: boolean;
  abrindoAnomalia: boolean;
  bloqueado: boolean;
  modoEdicao: boolean;
  refCallback: (el: HTMLDivElement | null) => void;
  onResponder: (r: Resposta) => void;
  onAtualizar: (patch: Partial<RespostaItem>) => void;
  onSetDecisao: (d: DecisaoNC) => void;
  onIrAnomalia: () => void;
}) {
  const respondido = resposta.resposta !== null;

  const corBorda =
    temErro
      ? "border-destructive ring-2 ring-destructive/30 animate-pulse"
      : resposta.resposta === "Conforme"
        ? "border-success/50"
        : resposta.resposta === "Não conforme"
          ? "border-destructive/50"
          : resposta.resposta === "Não aplicável"
            ? "border-na/40"
            : "border-border";

  return (
    <div
      ref={refCallback}
      className={cn(
        "rounded-2xl border-2 bg-card p-4 shadow-sm transition-colors md:p-6",
        corBorda,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">
            Item {def.numero}
          </p>
          <h2 className="mt-1 text-base font-bold leading-snug text-foreground md:text-lg">
            {def.descricao}
          </h2>
        </div>
        <BadgeStatus resposta={resposta.resposta} temErro={temErro} horario={resposta.horarioVerificacao} />
      </div>

      {def.referencia && (
        <p className="mb-3 rounded-md border border-primary/30 bg-primary-soft px-3 py-2 text-xs font-medium text-primary md:text-sm">
          {def.referencia}
        </p>
      )}

      {/* Botões de resposta — grid responsivo */}
      <div
        className={cn(
          "grid gap-2",
          def.permiteNA ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2",
        )}
      >
        <BotaoResposta
          label="Conforme"
          icon={<CheckCircle2 className="h-6 w-6" />}
          ativo={resposta.resposta === "Conforme"}
          cor="success"
          disabled={bloqueado || abrindoAnomalia}
          onClick={() => onResponder("Conforme")}
        />
        <BotaoResposta
          label="Não conforme"
          icon={<XCircle className="h-6 w-6" />}
          ativo={resposta.resposta === "Não conforme"}
          cor="destructive"
          disabled={bloqueado || abrindoAnomalia}
          onClick={() => onResponder("Não conforme")}
        />
        {def.permiteNA && (
          <BotaoResposta
            label="Não aplicável"
            icon={<MinusCircle className="h-6 w-6" />}
            ativo={resposta.resposta === "Não aplicável"}
            cor="na"
            disabled={bloqueado || abrindoAnomalia}
            onClick={() => onResponder("Não aplicável")}
          />
        )}
      </div>

      {/* Conforme + numérico */}
      {def.tipo === "numerico" && resposta.resposta === "Conforme" && (
        <div className="mt-4">
          <label className="text-sm font-semibold text-foreground md:text-base">
            Valor medido {def.unidade ? `(${def.unidade})` : ""}
          </label>
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            value={resposta.valorNumerico}
            onChange={(e) => onAtualizar({ valorNumerico: e.target.value })}
            placeholder={`Informe em ${def.unidade ?? ""}`}
            className="mt-1.5 h-11 text-base"
          />
        </div>
      )}

      {/* Conforme + texto */}
      {def.tipo === "texto" && resposta.resposta === "Conforme" && (
        <div className="mt-4">
          <label className="text-sm font-semibold text-foreground md:text-base">
            Detalhes / preventivas realizadas
          </label>
          <Textarea
            value={resposta.valorTexto}
            onChange={(e) => onAtualizar({ valorTexto: e.target.value })}
            placeholder="Descreva as ações realizadas"
            className="mt-1.5 min-h-[90px] text-base"
          />
        </div>
      )}

      {/* Não conforme — observação inline + decisão */}
      {resposta.resposta === "Não conforme" && (
        <div className="mt-4 rounded-xl border-2 border-destructive/40 bg-destructive-soft/40 p-3 md:p-4">
          <label className="text-sm font-bold text-destructive md:text-base">
            O que foi encontrado? <span>*</span>
          </label>
          <Textarea
            value={resposta.observacao}
            onChange={(e) => onAtualizar({ observacao: e.target.value })}
            placeholder="Descreva a não conformidade"
            className="mt-1.5 min-h-[100px] text-base"
          />
          {resposta.observacao.trim().length > 0 && resposta.observacao.trim().length < 3 && (
            <p className="mt-2 text-xs font-semibold text-destructive">Mínimo 3 caracteres</p>
          )}

          {resposta.observacao.trim().length >= 3 && !resposta.anomaliaId && (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <button
                type="button"
                disabled={bloqueado || abrindoAnomalia}
                onClick={() => onSetDecisao("observacao")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all disabled:opacity-50",
                  decisao === "observacao"
                    ? "border-primary bg-primary-soft shadow-sm ring-2 ring-primary/30"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground md:text-base">
                  <FileText className="h-5 w-5" /> Continuar só com observação
                </span>
                <span className="text-xs text-muted-foreground">Não abre anomalia formal</span>
              </button>
              <button
                type="button"
                disabled={bloqueado || abrindoAnomalia}
                onClick={() => onSetDecisao("anomalia")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all disabled:opacity-50",
                  decisao === "anomalia"
                    ? "border-warning bg-warning/25 shadow-sm ring-2 ring-warning/40"
                    : "border-border bg-card hover:border-warning/50",
                )}
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground md:text-base">
                  <ClipboardList className="h-5 w-5" /> Registrar anomalia formal
                </span>
                <span className="text-xs text-muted-foreground">
                  Quando exigir ação ou acompanhamento
                </span>
              </button>
            </div>
          )}

          {decisao === "anomalia" && !resposta.anomaliaId && (
            <div className="mt-3">
              <Button
                size="lg"
                className="h-12 w-full bg-warning text-warning-foreground hover:bg-warning/90 md:w-auto"
                onClick={onIrAnomalia}
                disabled={bloqueado || abrindoAnomalia || resposta.observacao.trim().length < 3}
              >
                {abrindoAnomalia ? "Abrindo..." : "Ir para registro de anomalia →"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Anomalia já registrada */}
      {resposta.anomaliaId && (
        <div className="mt-3 space-y-2">
          <p className="inline-flex items-center gap-1.5 rounded-md bg-warning/15 px-3 py-1.5 text-sm font-semibold text-warning-foreground">
            <AlertTriangle className="h-4 w-4" /> Anomalia registrada
          </p>
          {modoEdicao && (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning-foreground">
              Este item possui anomalia formal vinculada. Revise com atenção antes de alterar.
            </p>
          )}
        </div>
      )}

      {/* Observação opcional para Conforme/NA */}
      {respondido && resposta.resposta !== "Não conforme" && (
        <div className="mt-4">
          <label className="text-xs font-semibold text-muted-foreground md:text-sm">
            Observação (opcional)
          </label>
          <Textarea
            value={resposta.observacao}
            onChange={(e) => onAtualizar({ observacao: e.target.value })}
            placeholder="Algo a registrar?"
            className="mt-1.5 min-h-[70px] text-sm"
          />
        </div>
      )}
    </div>
  );
}

function BadgeStatus({
  resposta,
  temErro,
  horario,
}: {
  resposta: Resposta | null;
  temErro: boolean;
  horario?: string;
}) {
  if (temErro && !resposta) {
    return (
      <span className="shrink-0 rounded-full bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground">
        Falta responder
      </span>
    );
  }
  if (temErro) {
    return (
      <span className="shrink-0 rounded-full bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground">
        Pendência
      </span>
    );
  }
  if (!resposta) {
    return (
      <span className="shrink-0 rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
        Pendente
      </span>
    );
  }
  const cls =
    resposta === "Conforme"
      ? "bg-success-soft text-success border border-success/40"
      : resposta === "Não conforme"
        ? "bg-destructive-soft text-destructive border border-destructive/40"
        : "bg-na-soft text-na border border-na/40";
  return (
    <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", cls)}>
      {resposta}
      {horario && ` · ${formatarHora(horario)}`}
    </span>
  );
}

function BotaoResposta({
  label,
  icon,
  ativo,
  cor,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  ativo: boolean;
  cor: "success" | "destructive" | "na";
  onClick: () => void;
  disabled?: boolean;
}) {
  const ativoCls =
    cor === "success"
      ? "border-success bg-success-soft text-success"
      : cor === "destructive"
        ? "border-destructive bg-destructive-soft text-destructive"
        : "border-na bg-na-soft text-na";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[60px] items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-base font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 md:min-h-[68px] md:text-lg",
        ativo
          ? ativoCls + " shadow-sm"
          : "border-border bg-card text-foreground hover:border-primary/40",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
