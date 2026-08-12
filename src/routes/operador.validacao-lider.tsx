import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  PenLine,
  ArrowLeft,
  ClipboardCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { AutenticarLiderDialog } from "@/components/autenticar-lider-dialog";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/signature-pad";
import { TelaCarregando } from "@/components/tela-carregando";
import { useGuard } from "@/hooks/use-guard";
import { useChecklistsRemote } from "@/hooks/use-storage";
import { useLimpezaTurnos } from "@/hooks/use-limpeza-turnos";
import { buildFolhaDiaKey, formatarDataBR } from "@/lib/operacao/data-operacional";
import { useTurnoAtivoDoDia } from "@/lib/operacao/turno-ativo";
import { VERSO_CONTEXTO_FIXO } from "@/lib/verso/constants";
import { formatarDataHora } from "@/lib/checklist/format";
import type { Checklist } from "@/lib/checklist/types";
import type { LimpezaTurno } from "@/lib/verso/types";
import {
  finalizarValidacaoComLogin,
  finalizarValidacaoContingencia,
  novoFechamentoId,
  type ResultadoFinalizacao,
  type SolicitacaoFinalizacao,
} from "@/lib/farol/validacao-storage";

export const Route = createFileRoute("/operador/validacao-lider")({
  head: () => ({
    meta: [
      { title: "Validação de Relatório pelo Líder" },
      {
        name: "description",
        content: "Tela de assinaturas finais do líder: checklist e limpeza da sala de envase.",
      },
    ],
  }),
  component: ValidacaoLiderPage,
});

function ValidacaoLiderPage() {
  const { usuario, loading } = useGuard("operador");
  const navigate = useNavigate();
  const {
    data: checklistsRemote,
    loading: carregandoChecklists,
    error: erroChecklists,
  } = useChecklistsRemote();

  const turnoAtivo = useTurnoAtivoDoDia(usuario);
  const equipe = turnoAtivo.equipe;
  const turno = turnoAtivo.turno;
  const data = turnoAtivo.data;
  const folhaDiaKey = buildFolhaDiaKey(
    data,
    VERSO_CONTEXTO_FIXO.linha,
    VERSO_CONTEXTO_FIXO.maquina,
  );

  const limpeza = useLimpezaTurnos(folhaDiaKey, data, usuario?.userId ?? null);

  // ── Localizar checklist Pós-setup do dia ──
  const posSetup: Checklist | null = useMemo(() => {
    if (!turno || !equipe) return null;
    return (
      checklistsRemote.find(
        (c) =>
          c.contexto.data === data &&
          c.contexto.turno === turno &&
          c.contexto.equipe === equipe &&
          c.contexto.linha === "Linha 3" &&
          c.contexto.maquina === "Enchedora 3" &&
          c.momento === "Pós-setup" &&
          c.status === "concluido",
      ) ?? null
    );
  }, [turno, equipe, data, checklistsRemote]);

  // ── Limpeza do turno do operador aguardando validação ──
  const limpezaTurno: LimpezaTurno | null = useMemo(() => {
    if (!turno) return null;
    return limpeza.turnos.find((t) => t.turno === turno) ?? null;
  }, [turno, limpeza.turnos]);

  const checklistPendente = !!posSetup?.assinaturaOperador && !posSetup?.assinaturaLider;
  const limpezaPendente = limpezaTurno?.status === "aguardando_validacao";

  const [pedindoLogin, setPedindoLogin] = useState(false);
  const [assinaturaChecklist, setAssinaturaChecklist] = useState<string | null>(null);
  const [assinaturaLimpeza, setAssinaturaLimpeza] = useState<string | null>(null);
  // Preservado em retentativas: se o banco confirmou e a resposta de rede se
  // perdeu, a mesma chave devolve o fechamento já feito, sem duplicar.
  const fechamentoIdRef = useRef<string | null>(null);

  // Reusa a mesma assinatura para os dois quando ambos pendentes (atalho)
  const usarMesmaAssinatura = () => {
    if (assinaturaChecklist && !assinaturaLimpeza) {
      setAssinaturaLimpeza(assinaturaChecklist);
    } else if (assinaturaLimpeza && !assinaturaChecklist) {
      setAssinaturaChecklist(assinaturaLimpeza);
    }
  };

  if (loading || !usuario || carregandoChecklists || limpeza.loading) return <TelaCarregando />;

  if (erroChecklists || limpeza.error) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader titulo="Validação de Relatório pelo Líder" />
        <main className="mx-auto max-w-2xl p-6">
          <p className="rounded-xl border border-destructive/40 bg-destructive-soft p-4 text-sm font-semibold text-destructive">
            Não foi possível conferir o que está pendente. Verifique a conexão e tente novamente;
            nenhum fechamento foi registrado.
          </p>
        </main>
      </div>
    );
  }

  const nadaParaValidar = !checklistPendente && !limpezaPendente;

  const handleSalvar = () => {
    if (checklistPendente && !assinaturaChecklist) {
      toast.error("Líder precisa assinar o checklist.");
      return;
    }
    if (limpezaPendente && !assinaturaLimpeza) {
      toast.error("Líder precisa assinar a limpeza.");
      return;
    }
    // Nada foi escrito ainda. O login que abre agora executa a RPC final e
    // atômica; cancelar esta janela deixa banco e auditoria intocados.
    setPedindoLogin(true);
  };

  const solicitacaoAtual = (): SolicitacaoFinalizacao => {
    fechamentoIdRef.current ??= novoFechamentoId();
    return {
      fechamentoId: fechamentoIdRef.current,
      checklist:
        checklistPendente && posSetup && assinaturaChecklist
          ? { id: posSetup.id, assinaturaDataUrl: assinaturaChecklist }
          : undefined,
      limpeza:
        limpezaPendente && limpezaTurno && assinaturaLimpeza
          ? { id: limpezaTurno.id, assinaturaDataUrl: assinaturaLimpeza }
          : undefined,
    };
  };

  const concluir = (resultado?: ResultadoFinalizacao) => {
    if (!resultado) {
      toast.error("O banco não devolveu a confirmação do fechamento.");
      return;
    }
    // O banco e a fonte oficial. Nao espelhamos a assinatura desenhada no
    // localStorage: numa retentativa idempotente ela pode nao ser a mesma que
    // ja foi confirmada pelo servidor.
    fechamentoIdRef.current = null;
    setPedindoLogin(false);
    toast.success(
      resultado.contingencia
        ? "Fechamento em contingência registrado e enviado à supervisão."
        : `Validação confirmada por ${resultado.ator.nome}.`,
    );
    navigate({ to: "/operador" });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Validação de Relatório pelo Líder"
        subtitulo={`${turno ?? "—"} · ${formatarDataBR(data)}`}
      />
      <main className="mx-auto w-full max-w-[1000px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6 flex items-center justify-between">
          <Button asChild variant="outline">
            <Link to="/operador">
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
            </Link>
          </Button>
          <span className="rounded-full border border-primary/30 bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
            Acesso do líder no fim do turno
          </span>
        </div>

        {nadaParaValidar ? (
          <div className="rounded-2xl border-2 border-success/40 bg-success/10 p-6 text-center md:p-10">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-success/20 text-success">
              <Sparkles className="h-8 w-8" />
            </div>
            <p className="text-xl font-bold text-foreground md:text-2xl">Nada para validar agora</p>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Não há checklist nem limpeza aguardando a assinatura do líder neste turno.
            </p>
            <Button asChild className="mt-5">
              <Link to="/operador">Voltar para a home</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-5 rounded-2xl border-2 border-primary/30 bg-primary-soft/40 p-5 md:p-6">
              <div className="flex items-start gap-3">
                <PenLine className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                <div>
                  <p className="text-base font-bold text-foreground md:text-lg">
                    Líder, conferimos o que você precisa assinar para encerrar o turno.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    O operador já concluiu e assinou. Sua assinatura libera o fechamento do dia.
                    Você pode usar a mesma assinatura para os dois itens.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-5 flex items-start gap-3 rounded-2xl border-2 border-primary/40 bg-card p-5 shadow-sm md:p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div>
                <p className="text-base font-bold text-foreground">
                  Assine primeiro; confirme depois
                </p>
                <p className="text-xs text-muted-foreground">
                  Ao tocar no botão final, o líder entra com o próprio usuário neste tablet. Só
                  depois do login e da confirmação o banco fecha Checklist e Limpeza juntos.
                </p>
              </div>
            </div>

            <AutenticarLiderDialog
              aberto={pedindoLogin}
              onFechar={() => setPedindoLogin(false)}
              processarLogin={async (login, senha) => {
                const r = await finalizarValidacaoComLogin(login, senha, solicitacaoAtual());
                if (!r.ok) return r;
                if (!r.lider) return { ok: false, erro: "Identidade da liderança não retornada." };
                return { ok: true, lider: r.lider, resultado: r.resultado };
              }}
              processarContingencia={async (autorizou, motivo) => {
                const r = await finalizarValidacaoContingencia(solicitacaoAtual(), {
                  autorizou,
                  motivo,
                });
                return r.ok ? { ok: true, resultado: r.resultado } : r;
              }}
              onAutenticado={(_lider, resultado) => concluir(resultado)}
              onContingencia={(_autorizou, _motivo, resultado) => concluir(resultado)}
            />

            {/* Checklist */}
            {checklistPendente && posSetup && (
              <div className="mb-5 rounded-2xl border-2 border-warning/40 bg-warning/10 p-5 shadow-sm md:p-6">
                <div className="mb-3 flex items-start gap-3">
                  <ClipboardCheck className="mt-0.5 h-6 w-6 shrink-0 text-warning-foreground" />
                  <div className="flex-1">
                    <p className="text-base font-bold text-foreground md:text-lg">
                      Checklist Operacional · Pós-setup
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Operador {posSetup.assinaturaOperador?.nome ?? "—"} assinou em{" "}
                      {posSetup.assinaturaOperador?.assinadoEm
                        ? formatarDataHora(posSetup.assinaturaOperador.assinadoEm)
                        : "—"}
                      .
                    </p>
                  </div>
                </div>
                <SignaturePad
                  label="Assinatura do líder — checklist"
                  ajuda="Assine no quadro com o dedo"
                  value={assinaturaChecklist}
                  onChange={setAssinaturaChecklist}
                />
              </div>
            )}

            {/* Limpeza */}
            {limpezaPendente && limpezaTurno && (
              <div className="mb-5 rounded-2xl border-2 border-warning/40 bg-warning/10 p-5 shadow-sm md:p-6">
                <div className="mb-3 flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-6 w-6 shrink-0 text-warning-foreground" />
                  <div className="flex-1">
                    <p className="text-base font-bold text-foreground md:text-lg">
                      Limpeza Sala de Envase · {limpezaTurno.turno}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Operador assinou em{" "}
                      {limpezaTurno.operadorAssinouEm
                        ? formatarDataHora(limpezaTurno.operadorAssinouEm)
                        : "—"}
                      .
                    </p>
                  </div>
                </div>
                <SignaturePad
                  label="Assinatura do líder — limpeza"
                  ajuda="Assine no quadro com o dedo"
                  value={assinaturaLimpeza}
                  onChange={setAssinaturaLimpeza}
                />
              </div>
            )}

            {/* Atalho: usar mesma assinatura */}
            {checklistPendente && limpezaPendente && (
              <div className="mb-5 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={usarMesmaAssinatura}
                  disabled={!assinaturaChecklist && !assinaturaLimpeza}
                >
                  Usar a mesma assinatura nos dois
                </Button>
              </div>
            )}

            <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-4 backdrop-blur md:mx-0 md:rounded-b-2xl md:px-0">
              <Button
                size="lg"
                className="h-14 w-full text-base font-semibold"
                onClick={handleSalvar}
                disabled={pedindoLogin}
              >
                <CheckCircle2 className="mr-2 h-5 w-5" /> Identificar e confirmar validação
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
