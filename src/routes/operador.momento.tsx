import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { MOMENTOS_CHECKLIST } from "@/lib/checklist/types";
import type { ContextoChecklist, MomentoChecklist, Checklist } from "@/lib/checklist/types";
import { itensPorMomento } from "@/lib/checklist/itens";
import {
  buildFolhaKey,
  fetchFolhaExistenteRemota,
  fetchMomentoConcluidoRemoto,
  genId,
  upsertChecklist,
} from "@/lib/checklist/supabase-storage";
import { storage } from "@/lib/checklist/storage";
import {
  iniciarEdicaoChecklist,
  permissaoEdicaoChecklist,
} from "@/lib/checklist/edicao";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";
import { formatarData } from "@/lib/checklist/format";
import { ChevronRight, ListChecks, AlertTriangle, CheckCircle2, Clock, Loader2, Pencil } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { STORAGE_CTX } from "./operador.contexto";

export const Route = createFileRoute("/operador/momento")({
  head: () => ({ meta: [{ title: "Escolher momento — Checklist" }] }),
  component: MomentoPage,
});

interface MomentoStatusInfo {
  preenchido: boolean;
  registradoPor?: string; // operador_responsavel quem preencheu
  registradoPorEquipe?: string;
  checklistId?: string;
  checklist?: Checklist; // checklist completo, usado para edição
}

/**
 * O bloco Pós-setup (itens 13–20) só se aplica quando houve troca de
 * produto, sabor ou tamanho. Nos dados: 92 folhas com o bloco de
 * setup/paradas respondido normalmente e o pós-setup INTEIRO em "não
 * aplicável" — 8 toques sem informação nenhuma, em 71% dos turnos.
 *
 * Não dá para perguntar na abertura do turno: o operador descobre a troca
 * na hora. Então o atalho fica no card, para quando o turno fechar sem
 * troca — um toque no lugar de oito, e o "não aplicável" passa a ter causa
 * registrada em vez de ser mudo.
 */
const MOMENTO_POS_SETUP = MOMENTOS_CHECKLIST[2];
const MOTIVO_SEM_TROCA =
  "Não houve troca de produto, sabor ou tamanho neste turno.";

function MomentoPage() {
  const navigate = useNavigate();
  const { usuario, loading } = useGuard("operador");
  const [contexto, setContexto] = useState<ContextoChecklist | null>(null);

  const [carregandoStatus, setCarregandoStatus] = useState(true);
  const [statusPorMomento, setStatusPorMomento] = useState<
    Record<string, MomentoStatusInfo>
  >({});
  // Folha já existe e foi criada por OUTRA equipe do mesmo turno → bloqueio total.
  const [bloqueioOutraEquipe, setBloqueioOutraEquipe] = useState<{
    equipe?: string;
    operador?: string;
    checklistId?: string;
  } | null>(null);

  const [dialogoRascunho, setDialogoRascunho] = useState<{
    open: boolean;
    momento: MomentoChecklist | null;
  }>({ open: false, momento: null });
  const [dialogoMomentoOcupado, setDialogoMomentoOcupado] = useState<{
    open: boolean;
    momento: MomentoChecklist | null;
    info?: MomentoStatusInfo;
  }>({ open: false, momento: null });
  const [confirmarEdicao, setConfirmarEdicao] = useState<{
    open: boolean;
    checklist?: Checklist;
  }>({ open: false });
  const [bloqueioEdicao, setBloqueioEdicao] = useState<string | null>(null);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<MomentoChecklist | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || loading || !usuario) return;
    const raw = window.sessionStorage.getItem(STORAGE_CTX);
    if (!raw) {
      navigate({ to: "/operador/contexto" });
      return;
    }
    setContexto(JSON.parse(raw) as ContextoChecklist);
  }, [navigate, usuario, loading]);

  // Verifica REMOTAMENTE quais momentos já foram preenchidos para esta folha
  // e se já existe folha de outra equipe do mesmo turno no mesmo dia.
  useEffect(() => {
    if (!contexto || !usuario) return;
    let cancelado = false;

    (async () => {
      setCarregandoStatus(true);
      try {
        // 1) folha já existe?
        const folhaExistente = await fetchFolhaExistenteRemota(contexto);
        if (cancelado) return;

        if (folhaExistente && folhaExistente.contexto.equipe !== contexto.equipe) {
          // Outra equipe do mesmo turno já abriu a folha do dia.
          setBloqueioOutraEquipe({
            equipe: folhaExistente.contexto.equipe,
            operador:
              folhaExistente.operadorResponsavel ??
              folhaExistente.contexto.operadorResponsavel ??
              folhaExistente.operador,
            checklistId: folhaExistente.id,
          });
          setStatusPorMomento({});
          return;
        }
        setBloqueioOutraEquipe(null);

        // 2) status de cada momento (mesma equipe pode continuar a própria folha)
        const resultados = await Promise.all(
          MOMENTOS_CHECKLIST.map(async (m) => {
            const concluido = await fetchMomentoConcluidoRemoto(contexto, m);
            return [m, concluido] as const;
          }),
        );
        if (cancelado) return;
        const novoStatus: Record<string, MomentoStatusInfo> = {};
        for (const [m, c] of resultados) {
          if (c) {
            novoStatus[m] = {
              preenchido: true,
              registradoPor:
                c.operadorResponsavel ?? c.contexto.operadorResponsavel ?? c.operador,
              registradoPorEquipe: c.contexto.equipe,
              checklistId: c.id,
              checklist: c,
            };
          } else {
            novoStatus[m] = { preenchido: false };
          }
        }
        setStatusPorMomento(novoStatus);
      } catch (e) {
        console.error("[momento] erro ao consultar status remoto", e);
      } finally {
        if (!cancelado) setCarregandoStatus(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [contexto, usuario]);

  const [semTroca, setSemTroca] = useState<{ open: boolean; salvando: boolean }>({
    open: false,
    salvando: false,
  });

  const criarChecklist = (momento: MomentoChecklist): Checklist => {
    const itens = itensPorMomento(momento);
    return {
      id: genId(),
      contexto: contexto!,
      momento,
      respostas: itens.map((it) => ({
        itemNumero: it.numero,
        descricao: it.descricao,
        resposta: null,
        observacao: "",
        valorNumerico: "",
        valorTexto: "",
        horarioVerificacao: "",
        momentoChecklist: momento,
      })),
      status: "rascunho",
      criadoEm: new Date().toISOString(),
      operador: usuario!.nome,
      folhaKey: buildFolhaKey(contexto!),
      verificacaoNumero: 1, // sempre 1 — compatibilidade técnica
    };
  };

  /** Fecha o pós-setup inteiro como "não aplicável", com o motivo gravado. */
  const marcarSemTroca = async () => {
    if (!contexto || !usuario) return;
    setSemTroca({ open: true, salvando: true });
    const agora = new Date().toISOString();
    const base = criarChecklist(MOMENTO_POS_SETUP);
    const checklist: Checklist = {
      ...base,
      status: "concluido",
      concluidoEm: agora,
      operadorResponsavel: contexto.operadorResponsavel ?? usuario.nome,
      respostas: base.respostas.map((r) => ({
        ...r,
        resposta: "Não aplicável",
        // O motivo entra em TODOS os itens: é o que faz o NA deixar de ser
        // mudo no relatório e na análise da liderança.
        observacao: MOTIVO_SEM_TROCA,
        horarioVerificacao: agora,
      })),
    };
    try {
      storage.saveChecklist(checklist);
      await upsertChecklist(checklist);
      setStatusPorMomento((s) => ({
        ...s,
        [MOMENTO_POS_SETUP]: {
          preenchido: true,
          registradoPor: checklist.operadorResponsavel,
          registradoPorEquipe: contexto.equipe,
          checklistId: checklist.id,
          checklist,
        },
      }));
      setSemTroca({ open: false, salvando: false });
    } catch (e) {
      console.error("[momento] sem troca:", e);
      setSemTroca({ open: false, salvando: false });
    }
  };

  const iniciar = async (momento: MomentoChecklist) => {
    if (!contexto || !usuario || bloqueioOutraEquipe) return;

    // 1) rascunho local do mesmo momento → continuar (restaura como slot "atual")
    const rascunhoLocal = storage.getChecklistEmAndamentoMesmoMomento(contexto, momento);
    console.log("[momento.iniciar]", {
      momento,
      folhaKey: buildFolhaKey(contexto),
      encontrouRascunho: !!rascunhoLocal,
      respostasMarcadas: rascunhoLocal
        ? rascunhoLocal.respostas.filter((r) => r.resposta !== null).length
        : 0,
    });
    if (rascunhoLocal) {
      storage.restaurarRascunhoMomento(contexto, momento);
      setDialogoRascunho({ open: true, momento });
      return;
    }

    // 2) revalida no banco se este momento já foi preenchido
    setAcaoEmAndamento(momento);
    try {
      const concluido = await fetchMomentoConcluidoRemoto(contexto, momento);
      if (concluido) {
        const info: MomentoStatusInfo = {
          preenchido: true,
          registradoPor:
            concluido.operadorResponsavel ??
            concluido.contexto.operadorResponsavel ??
            concluido.operador,
          registradoPorEquipe: concluido.contexto.equipe,
          checklistId: concluido.id,
          checklist: concluido,
        };
        setStatusPorMomento((s) => ({ ...s, [momento]: info }));
        setDialogoMomentoOcupado({ open: true, momento, info });
        return;
      }

      // 3) novo
      console.log("[momento.iniciar] criando NOVO checklist para", momento);
      const novo = criarChecklist(momento);
      storage.setRascunho(novo);
      navigate({ to: "/operador/checklist" });
    } catch (e) {
      console.error("[momento] erro ao iniciar", e);
    } finally {
      setAcaoEmAndamento(null);
    }
  };

  const continuarRascunho = () => {
    // o slot "atual" já foi restaurado em iniciar(); só navega.
    setDialogoRascunho({ open: false, momento: null });
    navigate({ to: "/operador/checklist" });
  };

  const pedirEdicao = (checklist?: Checklist) => {
    if (!checklist || !usuario) return;
    const perm = permissaoEdicaoChecklist(checklist, usuario.usuario);
    if (!perm.permitido) {
      setBloqueioEdicao(perm.mensagem ?? "Edição não permitida.");
      return;
    }
    setDialogoMomentoOcupado({ open: false, momento: null });
    setConfirmarEdicao({ open: true, checklist });
  };

  const confirmarAlterar = () => {
    const c = confirmarEdicao.checklist;
    if (!c) return;
    iniciarEdicaoChecklist(c);
    setConfirmarEdicao({ open: false });
    navigate({ to: "/operador/checklist" });
  };

  if (!contexto) return null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Escolha o momento"
        subtitulo="Selecione qual checklist deseja realizar"
        voltarPara="/operador/contexto"
      />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
          <Info label="Data" valor={formatarData(contexto.data)} />
          <Info label="Turno" valor={contexto.turno} />
          <Info label="Equipe" valor={contexto.equipe} />
          <Info label="Máquina" valor={contexto.maquina} />
        </div>

        {bloqueioOutraEquipe ? (
          <div className="rounded-2xl border-2 border-destructive/40 bg-destructive-soft/40 p-6 md:p-8">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-6 w-6 flex-shrink-0 text-destructive" />
              <div className="flex-1">
                <h2 className="text-lg font-bold text-destructive md:text-xl">
                  Folha do dia já existe para este turno
                </h2>
                <p className="mt-2 text-sm text-foreground md:text-base">
                  Já existe uma folha do dia para <strong>{contexto.turno}</strong> em{" "}
                  <strong>{formatarData(contexto.data)}</strong>. Na operação atual,
                  apenas uma equipe deste turno deve preencher o checklist.
                </p>
                {(bloqueioOutraEquipe.equipe || bloqueioOutraEquipe.operador) && (
                  <p className="mt-3 rounded-md bg-card px-3 py-2 text-sm text-foreground">
                    Registrada por:{" "}
                    <strong>
                      Equipe {bloqueioOutraEquipe.equipe ?? "—"}
                      {bloqueioOutraEquipe.operador
                        ? ` · ${bloqueioOutraEquipe.operador}`
                        : ""}
                    </strong>
                  </p>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  {bloqueioOutraEquipe.checklistId && (
                    <Button
                      onClick={() =>
                        navigate({
                          to: "/gestao/visualizar/checklist/$id",
                          params: { id: bloqueioOutraEquipe.checklistId! },
                        })
                      }
                    >
                      Ver checklist existente
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => navigate({ to: "/operador" })}>
                    Voltar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : carregandoStatus ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Verificando folha do dia…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {MOMENTOS_CHECKLIST.map((m) => {
              const total = itensPorMomento(m).length;
              const info = statusPorMomento[m];
              const preenchido = info?.preenchido ?? false;
              const rascunho = storage.getChecklistEmAndamentoMesmoMomento(contexto, m);
              const carregando = acaoEmAndamento === m;
              return (
                <div key={m} className="flex flex-col">
                <button
                  type="button"
                  disabled={carregando}
                  onClick={() => {
                    if (preenchido) {
                      setDialogoMomentoOcupado({ open: true, momento: m, info });
                    } else {
                      void iniciar(m);
                    }
                  }}
                  className="group flex flex-col items-start gap-4 rounded-2xl border-2 border-border bg-card p-6 text-left shadow-sm transition-all hover:border-primary hover:shadow-md disabled:opacity-60 md:p-7"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <ListChecks className="h-7 w-7" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xl font-bold leading-tight text-foreground">{m}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{total} itens</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(() => {
                        const respondidos = rascunho
                          ? rascunho.respostas.filter((r) => r.resposta !== null).length
                          : 0;
                        if (preenchido) {
                          return (
                            <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                              <CheckCircle2 className="h-3 w-3" /> Concluído — {total}/{total} itens
                            </span>
                          );
                        }
                        if (rascunho && respondidos > 0) {
                          return (
                            <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning-foreground">
                              <Clock className="h-3 w-3" /> Em andamento — {respondidos}/{total} itens
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                            <Clock className="h-3 w-3" /> Pendente — 0/{total} itens
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <p className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    {carregando ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Verificando…
                      </>
                    ) : preenchido ? (
                      <>
                        Ver checklist preenchido <ChevronRight className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        Toque para iniciar <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </p>
                </button>

                  {/* Atalho do pós-setup: 1 toque no lugar de 8 "não aplicável" */}
                  {m === MOMENTO_POS_SETUP && !preenchido && !rascunho && (
                    <button
                      type="button"
                      onClick={() => setSemTroca({ open: true, salvando: false })}
                      className="mt-2 w-full rounded-xl border-2 border-dashed border-border bg-muted/40 px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      Não houve troca de produto neste turno
                      <span className="mt-0.5 block text-xs font-normal">
                        Marca os {total} itens como não aplicável, com o motivo registrado
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Diálogo: pós-setup sem troca de produto */}
      <AlertDialog
        open={semTroca.open}
        onOpenChange={(v) => !v && !semTroca.salvando && setSemTroca({ open: false, salvando: false })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Não houve troca de produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Os itens do Pós-setup (trocar estrelas, guias, tubos de ar, bocais e guardar
              o kit) só se aplicam quando houve troca de produto, sabor ou tamanho.
              <br />
              <br />
              Confirmando, o Pós-setup é fechado com todos os itens em{" "}
              <b>não aplicável</b> e o motivo registrado. Se a troca acontecer depois,
              procure a liderança para reabrir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={semTroca.salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void marcarSemTroca();
              }}
              disabled={semTroca.salvando}
            >
              {semTroca.salvando ? "Salvando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo: rascunho existente */}
      <AlertDialog
        open={dialogoRascunho.open}
        onOpenChange={(v) => !v && setDialogoRascunho({ open: false, momento: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Checklist em andamento</AlertDialogTitle>
            <AlertDialogDescription>
              Você já possui este checklist em andamento. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={continuarRascunho}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo: momento já preenchido */}
      <AlertDialog
        open={dialogoMomentoOcupado.open}
        onOpenChange={(v) =>
          !v && setDialogoMomentoOcupado({ open: false, momento: null })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Momento já preenchido</AlertDialogTitle>
            <AlertDialogDescription>
              Este momento já foi preenchido para este turno nesta data.
              {dialogoMomentoOcupado.info?.registradoPor && (
                <>
                  <br />
                  <br />
                  Registrado por:{" "}
                  <strong>
                    Equipe {dialogoMomentoOcupado.info.registradoPorEquipe ?? "—"}
                    {dialogoMomentoOcupado.info.registradoPor
                      ? ` · ${dialogoMomentoOcupado.info.registradoPor}`
                      : ""}
                  </strong>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            {dialogoMomentoOcupado.info?.checklist &&
              usuario &&
              permissaoEdicaoChecklist(
                dialogoMomentoOcupado.info.checklist,
                usuario.usuario,
              ).permitido && (
                <Button
                  variant="outline"
                  className="border-warning text-warning-foreground"
                  onClick={() => pedirEdicao(dialogoMomentoOcupado.info?.checklist)}
                >
                  <Pencil className="mr-1.5 h-4 w-4" /> Alterar dados
                </Button>
              )}
            {dialogoMomentoOcupado.info?.checklistId && (
              <AlertDialogAction
                onClick={() => {
                  const id = dialogoMomentoOcupado.info!.checklistId!;
                  setDialogoMomentoOcupado({ open: false, momento: null });
                  navigate({
                    to: "/operador/visualizar/checklist/$id",
                    params: { id },
                  });
                }}
              >
                Ver checklist preenchido
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo: confirmação de alteração */}
      <AlertDialog
        open={confirmarEdicao.open}
        onOpenChange={(v) => !v && setConfirmarEdicao({ open: false })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar respostas do checklist</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que quer alterar as respostas atuais do checklist já preenchido?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarAlterar}>Sim, alterar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo: bloqueio de edição */}
      <AlertDialog
        open={!!bloqueioEdicao}
        onOpenChange={(v) => !v && setBloqueioEdicao(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edição não permitida</AlertDialogTitle>
            <AlertDialogDescription>{bloqueioEdicao}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBloqueioEdicao(null)}>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
