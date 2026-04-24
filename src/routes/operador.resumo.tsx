import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, MinusCircle, AlertTriangle, Loader2, PenLine } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { RespostaBadge } from "@/components/badges";
import { SignaturePad } from "@/components/signature-pad";
import { useRascunho } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { useConnectionStatus, useOfflineQueue } from "@/hooks/use-connection-status";
import { TelaCarregando } from "@/components/tela-carregando";
import { storage } from "@/lib/checklist/storage";
import { upsertChecklist, linkAnomaliasToChecklist } from "@/lib/checklist/supabase-storage";
import { limparModoEdicao } from "@/lib/checklist/edicao";
import { formatarData, formatarHora } from "@/lib/checklist/format";
import type { AssinaturaDigital } from "@/lib/checklist/types";
import { ObservacoesVersoConsolidado } from "@/components/observacoes-verso-consolidado";
import { buildFolhaDiaKey } from "@/lib/operacao/data-operacional";

const MOMENTO_FECHAMENTO = "Pós-setup" as const;

export const Route = createFileRoute("/operador/resumo")({
  head: () => ({ meta: [{ title: "Resumo do checklist" }] }),
  component: ResumoPage,
});

function ResumoPage() {
  const navigate = useNavigate();
  const { usuario, loading } = useGuard("operador");
  const rascunho = useRascunho();
  const { checkNow } = useConnectionStatus();
  const { enfileirar } = useOfflineQueue();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [assinaturaOperador, setAssinaturaOperador] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || loading || !usuario) return;
    if (!rascunho && !salvando) navigate({ to: "/operador/momento" });
  }, [usuario, loading, rascunho, salvando, navigate]);

  if (loading || !usuario) return <TelaCarregando />;
  if (!rascunho) return null;

  const exigeAssinaturas = rascunho.momento === MOMENTO_FECHAMENTO;

  const respostas = rascunho.respostas ?? [];
  const conformes = respostas.filter((r) => r?.resposta === "Conforme").length;
  const naoConformes = respostas.filter((r) => r?.resposta === "Não conforme").length;
  const naoAplicaveis = respostas.filter((r) => r?.resposta === "Não aplicável").length;
  const anomalias = respostas.filter((r) => !!r?.anomaliaId).length;

  const finalizarLocalmente = (concluido: NonNullable<typeof rascunho>) => {
    storage.saveChecklist(concluido);
    storage.clearRascunho();
    limparModoEdicao();
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("fm-checklist:ultimo-concluido", JSON.stringify(concluido));
    }
  };

  const concluir = async () => {
    if (!usuario) return;
    setErro(null);

    // Assinatura do operador é exigida no fechamento do dia (Pós-setup).
    // A assinatura do líder NÃO é mais obrigatória aqui — o líder valida
    // depois, na tela "Validação de Relatório pelo Líder" (home do operador).
    let dadosAssinaturas: {
      assinaturaOperador?: AssinaturaDigital;
    } = {};
    if (exigeAssinaturas) {
      if (!assinaturaOperador) {
        setErro("O operador precisa assinar antes de concluir o checklist do dia.");
        return;
      }
      const agora = new Date().toISOString();
      dadosAssinaturas = {
        assinaturaOperador: {
          dataUrl: assinaturaOperador,
          nome: usuario.nome,
          assinadoEm: agora,
        },
      };
    }

    setSalvando(true);
    const concluido = {
      ...rascunho,
      status: "concluido" as const,
      concluidoEm: new Date().toISOString(),
      operador: usuario.nome,
      operadorLogin: usuario.usuario,
      operadorResponsavel: rascunho.contexto.operadorResponsavel ?? usuario.nome,
      ...dadosAssinaturas,
    };

    // preflight: mesmo que indicador esteja verde, confirmar antes de enviar
    const online = await checkNow();
    if (!online) {
      enfileirar("checklist", concluido);
      finalizarLocalmente(concluido);
      setSalvando(false);
      navigate({ to: "/operador/momento" });
      return;
    }

    try {
      await upsertChecklist(concluido);
      const anomaliaIds = (concluido.respostas ?? [])
        .map((r) => r?.anomaliaId)
        .filter((id): id is string => !!id);
      if (anomaliaIds.length > 0) {
        try {
          await linkAnomaliasToChecklist(anomaliaIds, concluido.id);
        } catch (linkErr) {
          console.error("[concluir] falha ao vincular anomalias:", linkErr);
        }
      }
      finalizarLocalmente(concluido);
      navigate({ to: "/operador/momento" });
    } catch (e) {
      console.error("[concluir checklist] erro de rede, enfileirando:", e);
      // operador nunca vê erro de rede — enfileira e segue
      enfileirar("checklist", concluido);
      finalizarLocalmente(concluido);
      navigate({ to: "/operador/momento" });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Resumo do checklist"
        subtitulo="Revise antes de concluir"
        voltarPara="/operador/checklist"
        voltarLabel="Revisar"
      />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6 lg:col-span-2">
            <h2 className="mb-4 text-lg font-bold text-foreground">Dados do checklist</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Info label="Data" valor={formatarData(rascunho.contexto.data)} />
              <Info label="Turno" valor={rascunho.contexto.turno} />
              <Info label="Equipe" valor={rascunho.contexto.equipe} />
              <Info label="Linha" valor={rascunho.contexto.linha} />
              <Info label="Máquina" valor={rascunho.contexto.maquina} />
              <Info label="Momento" valor={rascunho.momento} />
              {rascunho.contexto.operadorResponsavel && (
                <Info label="Operador responsável" valor={rascunho.contexto.operadorResponsavel} />
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h3 className="mb-4 text-base font-bold text-foreground">Totais</h3>
              <div className="space-y-3">
                <Contador
                  cor="success"
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  label="Conformes"
                  valor={conformes}
                />
                <Contador
                  cor="destructive"
                  icon={<XCircle className="h-5 w-5" />}
                  label="Não conformes"
                  valor={naoConformes}
                />
                <Contador
                  cor="na"
                  icon={<MinusCircle className="h-5 w-5" />}
                  label="Não aplicáveis"
                  valor={naoAplicaveis}
                />
                {anomalias > 0 && (
                  <Contador
                    cor="warning"
                    icon={<AlertTriangle className="h-5 w-5" />}
                    label="Anomalias abertas"
                    valor={anomalias}
                  />
                )}
              </div>
            </div>

            {erro && (
              <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive">
                {erro}
              </p>
            )}

            <div className="space-y-2">
              <Button
                size="lg"
                className="h-14 w-full text-base font-semibold"
                onClick={concluir}
                disabled={salvando}
              >
                {salvando ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Salvando…
                  </>
                ) : (
                  "Concluir checklist"
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-14 w-full text-base"
                onClick={() => navigate({ to: "/operador/checklist" })}
                disabled={salvando}
              >
                Voltar e revisar
              </Button>
            </div>
          </div>
        </div>

        {exigeAssinaturas && (
          <div className="mt-6 rounded-2xl border-2 border-primary/40 bg-primary-soft/30 p-5 shadow-sm md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <PenLine className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground md:text-xl">
                Assinaturas de fechamento do dia
              </h2>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              Como este é o <strong>último momento</strong> do checklist do dia,
              o operador precisa assinar para concluir. A assinatura do líder
              será coletada depois, na tela{" "}
              <strong>"Validação de Relatório pelo Líder"</strong> da home.
            </p>

            <div className="max-w-xl">
              <div className="mb-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Operador
                </p>
                <p className="text-base font-bold text-foreground">
                  {rascunho.contexto.operadorResponsavel?.trim() || usuario.nome}
                </p>
              </div>
              <SignaturePad
                label="Assinatura do operador"
                ajuda="Assine no quadro abaixo com o dedo"
                value={assinaturaOperador}
                onChange={setAssinaturaOperador}
              />
            </div>
          </div>
        )}

        <div className="mt-6">
          <ObservacoesVersoConsolidado
            folhaDiaKey={buildFolhaDiaKey(
              rascunho.contexto.data,
              rascunho.contexto.linha,
              rascunho.contexto.maquina,
            )}
            titulo="Observações da folha (espelho do verso)"
          />
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
          <h2 className="mb-4 text-lg font-bold text-foreground">Itens respondidos</h2>
          <ul className="divide-y divide-border">
            {respostas.map((r) => {
              if (!r) return null;
              return (
                <li key={r.itemNumero} className="py-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">
                        <span className="text-primary">Item {r.itemNumero}</span> — {r.descricao}
                      </p>
                      {r.valorNumerico && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Valor:{" "}
                          <span className="font-semibold text-foreground">{r.valorNumerico}</span>
                        </p>
                      )}
                      {r.valorTexto && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Detalhes: <span className="text-foreground">{r.valorTexto}</span>
                        </p>
                      )}
                      {r.observacao && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Obs: <span className="text-foreground">{r.observacao}</span>
                        </p>
                      )}
                      {r.anomaliaId && (
                        <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-warning-foreground">
                          <AlertTriangle className="h-3.5 w-3.5" /> Anomalia vinculada
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-start gap-1 md:items-end">
                      <RespostaBadge resposta={r.resposta} />
                      {r.horarioVerificacao && (
                        <p className="text-xs text-muted-foreground">
                          {formatarHora(r.horarioVerificacao)}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
    </div>
  );
}

function Info({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{valor}</p>
    </div>
  );
}

function Contador({
  cor,
  icon,
  label,
  valor,
}: {
  cor: "success" | "destructive" | "na" | "warning";
  icon: React.ReactNode;
  label: string;
  valor: number;
}) {
  const map = {
    success: "bg-success-soft text-success",
    destructive: "bg-destructive-soft text-destructive",
    na: "bg-na-soft text-na",
    warning: "bg-warning/15 text-warning-foreground",
  };
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${map[cor]}`}>
          {icon}
        </span>
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <span className="text-2xl font-bold text-foreground">{valor}</span>
    </div>
  );
}
