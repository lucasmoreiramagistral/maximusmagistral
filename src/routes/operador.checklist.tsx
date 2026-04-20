import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, MinusCircle, AlertTriangle, FileText, ClipboardList, Pencil } from "lucide-react";
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
import type { Resposta, RespostaItem } from "@/lib/checklist/types";
import { formatarHora } from "@/lib/checklist/format";
import { calcularIndiceRetomada, checklistEmEdicao } from "@/lib/checklist/edicao";
import { cn } from "@/lib/utils";

const FLAG_RETORNO_ANOMALIA = "fm-checklist:retorno-anomalia";

export const Route = createFileRoute("/operador/checklist")({
  head: () => ({ meta: [{ title: "Checklist em andamento" }] }),
  component: ChecklistPage,
});

function ChecklistPage() {
  const navigate = useNavigate();
  const { usuario, loading } = useGuard("operador");
  const rascunho = useRascunho();

  const [indice, setIndice] = useState(0);
  const [indiceInicializado, setIndiceInicializado] = useState(false);
  const [erro, setErro] = useState("");
  // Decisão NC por item: null | "observacao" | "anomalia"
  const [decisoesNC, setDecisoesNC] = useState<Record<number, "observacao" | "anomalia" | null>>({});
  const [abrindoAnomalia, setAbrindoAnomalia] = useState(false);
  const [modoEdicao, setModoEdicao] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || loading || !usuario) return;
    if (!rascunho) navigate({ to: "/operador" });
  }, [usuario, loading, rascunho, navigate]);

  // Calcula índice inicial (1ª vez que rascunho carrega) ou trata retorno de anomalia
  useEffect(() => {
    if (typeof window === "undefined" || !rascunho) return;
    setModoEdicao(checklistEmEdicao() === rascunho.id);

    const retornoRaw = window.sessionStorage.getItem(FLAG_RETORNO_ANOMALIA);
    if (retornoRaw) {
      try {
        const retorno = JSON.parse(retornoRaw) as {
          checklistId: string;
          itemNumero: number;
        };
        window.sessionStorage.removeItem(FLAG_RETORNO_ANOMALIA);
        if (retorno.checklistId === rascunho.id) {
          const idxOrig = rascunho.respostas.findIndex(
            (r) => r.itemNumero === retorno.itemNumero,
          );
          const total = rascunho.respostas.length;
          if (idxOrig >= 0 && idxOrig < total - 1) {
            setIndice(idxOrig + 1);
            setIndiceInicializado(true);
            return;
          }
          // anomalia foi no último item → ir direto ao resumo
          navigate({ to: "/operador/resumo" });
          return;
        }
      } catch {
        // ignora
      }
    }

    if (!indiceInicializado) {
      setIndice(calcularIndiceRetomada(rascunho.respostas));
      setIndiceInicializado(true);
    }
  }, [rascunho, indiceInicializado, navigate]);

  // Reset transição ao trocar de item
  useEffect(() => {
    setAbrindoAnomalia(false);
    setErro("");
  }, [indice]);

  const respostaAtual: RespostaItem | null = rascunho?.respostas[indice] ?? null;
  const itemDef = useMemo(
    () =>
      respostaAtual ? ITENS_CHECKLIST.find((i) => i.numero === respostaAtual.itemNumero) : null,
    [respostaAtual],
  );

  if (loading || !usuario) return <TelaCarregando />;
  if (!rascunho || !respostaAtual || !itemDef) return null;

  const total = rascunho.respostas.length;
  const ultimo = indice === total - 1;
  const respondidos = rascunho.respostas.filter((r) => r.resposta !== null).length;

  const atualizarResposta = (patch: Partial<RespostaItem>) => {
    const novas = rascunho.respostas.map((r, i) => (i === indice ? { ...r, ...patch } : r));
    storage.setRascunho({ ...rascunho, respostas: novas });
  };

  const decisaoNC = decisoesNC[indice] ?? null;

  const setDecisao = (d: "observacao" | "anomalia" | null) => {
    setDecisoesNC((prev) => ({ ...prev, [indice]: d }));
    setErro("");
  };

  const escolher = (r: Resposta) => {
    if (abrindoAnomalia) return;
    setErro("");
    const patch: Partial<RespostaItem> = {
      resposta: r,
      horarioVerificacao: new Date().toISOString(),
    };
    if (r !== "Não conforme") {
      // limpar decisão e observação NC
      setDecisao(null);
      if (respostaAtual.observacao && !respostaAtual.observacao.trim()) {
        patch.observacao = "";
      }
    }
    atualizarResposta(patch);
  };

  const validarItem = (): string | null => {
    if (!respostaAtual.resposta) return "Selecione uma resposta para continuar";
    if (respostaAtual.resposta === "Não conforme") {
      if (respostaAtual.observacao.trim().length < 3) {
        return "Preencha a observação do item não conforme (mínimo 3 caracteres)";
      }
      if (!respostaAtual.anomaliaId && decisaoNC !== "observacao") {
        return "Escolha como deseja tratar este item não conforme.";
      }
    }
    if (
      itemDef.tipo === "numerico" &&
      respostaAtual.resposta === "Conforme" &&
      !respostaAtual.valorNumerico.trim()
    ) {
      return "Informe o valor medido";
    }
    return null;
  };

  const proximo = () => {
    const e = validarItem();
    if (e) {
      setErro(e);
      return;
    }
    avancar();
  };

  const avancar = () => {
    if (ultimo) {
      navigate({ to: "/operador/resumo" });
    } else {
      setIndice((i) => i + 1);
      setErro("");
    }
  };

  const voltar = () => {
    if (indice === 0) {
      navigate({ to: "/operador/momento" });
    } else {
      setIndice((i) => i - 1);
      setErro("");
    }
  };

  const irParaAnomalia = () => {
    if (abrindoAnomalia) return;
    if (respostaAtual.observacao.trim().length < 3) {
      setErro("Preencha a observação do item não conforme (mínimo 3 caracteres)");
      return;
    }
    setAbrindoAnomalia(true);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        "fm-checklist:anomalia-origem",
        JSON.stringify({
          checklistId: rascunho.id,
          itemNumero: respostaAtual.itemNumero,
          descricao: respostaAtual.descricao,
          equipe: rascunho.contexto.equipe,
          turno: rascunho.contexto.turno,
          retornarPara: "checklist",
        }),
      );
    }
    navigate({ to: "/operador/anomalia/nova" });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo={rascunho.momento}
        subtitulo={`${rascunho.contexto.turno} · ${rascunho.contexto.equipe}`}
      />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-8">
        {modoEdicao && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border-2 border-warning/40 bg-warning/15 px-4 py-3 text-sm font-semibold text-warning-foreground">
            <Pencil className="h-4 w-4" />
            Modo de edição do checklist já preenchido
          </div>
        )}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground md:text-base">
              Item {indice + 1} de {total}
            </p>
            <p className="text-sm text-muted-foreground">{respondidos} respondidos</p>
          </div>
          <Progress value={((indice + 1) / total) * 100} className="h-3" />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-7">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Coluna esquerda — descrição e campos */}
            <div className="space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  Item {itemDef.numero}
                </p>
                <h2 className="mt-1 text-lg font-bold leading-snug text-foreground md:text-xl">
                  {itemDef.descricao}
                </h2>
                {itemDef.referencia && (
                  <p className="mt-3 rounded-md border border-primary/30 bg-primary-soft px-3 py-2 text-sm font-medium text-primary">
                    {itemDef.referencia}
                  </p>
                )}
              </div>

              {itemDef.tipo === "numerico" && (
                <div>
                  <label className="text-base font-semibold text-foreground">
                    Valor medido {itemDef.unidade ? `(${itemDef.unidade})` : ""}
                  </label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={respostaAtual.valorNumerico}
                    onChange={(e) => atualizarResposta({ valorNumerico: e.target.value })}
                    placeholder={`Informe em ${itemDef.unidade ?? ""}`}
                    className="mt-1.5 h-12 text-base"
                  />
                </div>
              )}

              {itemDef.tipo === "texto" && (
                <div>
                  <label className="text-base font-semibold text-foreground">
                    Detalhes / preventivas realizadas
                  </label>
                  <Textarea
                    value={respostaAtual.valorTexto}
                    onChange={(e) => atualizarResposta({ valorTexto: e.target.value })}
                    placeholder="Descreva as ações realizadas"
                    className="mt-1.5 min-h-[100px] text-base"
                  />
                </div>
              )}

              {respostaAtual.resposta === "Não conforme" && (
                <div className="rounded-xl border-2 border-destructive/40 bg-destructive-soft/40 p-4">
                  <label className="text-base font-bold text-destructive">
                    O que foi encontrado? <span>*</span>
                  </label>
                  <Textarea
                    value={respostaAtual.observacao}
                    onChange={(e) => atualizarResposta({ observacao: e.target.value })}
                    placeholder="Descreva o que encontrou"
                    className="mt-1.5 min-h-[120px] text-base"
                    autoFocus
                  />
                  {respostaAtual.observacao.trim().length > 0 &&
                    respostaAtual.observacao.trim().length < 3 && (
                      <p className="mt-2 text-xs font-semibold text-destructive">
                        Mínimo 3 caracteres
                      </p>
                    )}

                  {respostaAtual.observacao.trim().length >= 3 && !respostaAtual.anomaliaId && (
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <button
                        type="button"
                        disabled={abrindoAnomalia}
                        onClick={() => setDecisao("observacao")}
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition-all disabled:opacity-50",
                          decisaoNC === "observacao"
                            ? "border-primary bg-primary-soft shadow-sm ring-2 ring-primary/30"
                            : "border-border bg-card hover:border-primary/40",
                        )}
                      >
                        <span className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
                          <FileText className="h-5 w-5" /> Continuar só com observação
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Não abre anomalia formal
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={abrindoAnomalia}
                        onClick={() => setDecisao("anomalia")}
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition-all disabled:opacity-50",
                          decisaoNC === "anomalia"
                            ? "border-warning bg-warning/25 shadow-sm ring-2 ring-warning/40"
                            : "border-border bg-card hover:border-warning/50",
                        )}
                      >
                        <span className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
                          <ClipboardList className="h-5 w-5" /> Registrar anomalia formal
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Usar quando exigir ação ou acompanhamento
                        </span>
                      </button>
                    </div>
                  )}

                  {decisaoNC === "anomalia" && !respostaAtual.anomaliaId && (
                    <p className="mt-3 text-xs font-semibold text-warning-foreground">
                      Você precisa registrar a anomalia para continuar este item.
                    </p>
                  )}
                </div>
              )}

              {respostaAtual.resposta !== "Não conforme" && respostaAtual.observacao && (
                <div>
                  <label className="text-base font-semibold text-foreground">Observação</label>
                  <Textarea
                    value={respostaAtual.observacao}
                    onChange={(e) => atualizarResposta({ observacao: e.target.value })}
                    placeholder="Descreva o que foi observado"
                    className="mt-1.5 min-h-[100px] text-base"
                  />
                </div>
              )}

              {respostaAtual.horarioVerificacao && (
                <p className="text-sm text-muted-foreground">
                  Horário da verificação:{" "}
                  <span className="font-semibold text-foreground">
                    {formatarHora(respostaAtual.horarioVerificacao)}
                  </span>
                </p>
              )}

              {respostaAtual.anomaliaId && (
                <div className="space-y-2">
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
            </div>

            {/* Coluna direita — botões de resposta */}
            <div className="flex flex-col gap-3">
              <p className="text-base font-semibold text-foreground">Selecione a resposta</p>
              <BotaoResposta
                label="Conforme"
                icon={<CheckCircle2 className="h-7 w-7" />}
                ativo={respostaAtual.resposta === "Conforme"}
                cor="success"
                disabled={abrindoAnomalia}
                onClick={() => escolher("Conforme")}
              />
              <BotaoResposta
                label="Não conforme"
                icon={<XCircle className="h-7 w-7" />}
                ativo={respostaAtual.resposta === "Não conforme"}
                cor="destructive"
                disabled={abrindoAnomalia}
                onClick={() => escolher("Não conforme")}
              />
              {itemDef.permiteNA && (
                <BotaoResposta
                  label="Não aplicável"
                  icon={<MinusCircle className="h-7 w-7" />}
                  ativo={respostaAtual.resposta === "Não aplicável"}
                  cor="na"
                  disabled={abrindoAnomalia}
                  onClick={() => escolher("Não aplicável")}
                />
              )}
            </div>
          </div>

          {erro && (
            <p className="mt-5 rounded-md bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive">
              {erro}
            </p>
          )}

          {abrindoAnomalia && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-md bg-warning/15 px-3 py-2 text-sm font-semibold text-warning-foreground">
              <ClipboardList className="h-4 w-4 animate-pulse" /> Abrindo registro de anomalia...
            </p>
          )}

          <div className="mt-7 flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="lg"
              className="h-14 px-6 text-base"
              onClick={voltar}
              disabled={abrindoAnomalia}
            >
              ← Voltar
            </Button>
            {respostaAtual.resposta === "Não conforme" &&
            decisaoNC === "anomalia" &&
            !respostaAtual.anomaliaId ? (
              <Button
                size="lg"
                className="h-14 px-8 text-base font-semibold bg-warning text-warning-foreground hover:bg-warning/90"
                onClick={irParaAnomalia}
                disabled={abrindoAnomalia || respostaAtual.observacao.trim().length < 3}
              >
                Ir para registro de anomalia →
              </Button>
            ) : (
              <Button
                size="lg"
                className="h-14 px-8 text-base font-semibold"
                onClick={proximo}
                disabled={abrindoAnomalia}
              >
                {ultimo ? "Finalizar →" : "Próximo →"}
              </Button>
            )}
          </div>
        </div>
      </main>

    </div>
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
        "flex items-center gap-3 rounded-xl border-2 px-5 py-5 text-left text-lg font-semibold transition-all md:py-6 disabled:opacity-50 disabled:cursor-not-allowed",
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
