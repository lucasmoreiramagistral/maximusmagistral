import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  PenLine,
  Loader2,
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
import { cn } from "@/lib/utils";
import type { IdentidadeLider } from "@/lib/farol/autenticar-lider";
import { TelaCarregando } from "@/components/tela-carregando";
import { useGuard } from "@/hooks/use-guard";
import { useChecklists } from "@/hooks/use-storage";
import { useLimpezaTurnos } from "@/hooks/use-limpeza-turnos";
import { storage, buildFolhaKey } from "@/lib/checklist/storage";
import { upsertChecklist } from "@/lib/checklist/supabase-storage";
import { buildFolhaDiaKey, formatarDataBR } from "@/lib/operacao/data-operacional";
import { useTurnoAtivoDoDia } from "@/lib/operacao/turno-ativo";
import { VERSO_CONTEXTO_FIXO } from "@/lib/verso/constants";
import { formatarDataHora } from "@/lib/checklist/format";
import type { Checklist, ContextoChecklist } from "@/lib/checklist/types";
import type { LimpezaTurno } from "@/lib/verso/types";

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
  const checklistsRemote = useChecklists();

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
    const contextoDoDia: ContextoChecklist = {
      data,
      turno,
      equipe,
      linha: "Linha 3",
      maquina: "Enchedora 3",
    };
    const folhaKeyDia = buildFolhaKey(contextoDoDia);
    const locais = storage.getChecklists();
    const todos = [
      ...locais,
      ...checklistsRemote.filter((c) => !locais.some((l) => l.id === c.id)),
    ];
    return (
      todos.find(
        (c) =>
          (c.folhaKey ?? buildFolhaKey(c.contexto)) === folhaKeyDia &&
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

  // ── Estado de UI ──
  //
  // O nome do líder deixou de ser digitado. Ele agora vem de uma autenticação
  // real (ver autenticar-lider.ts): `null` significa "o líder ainda não se
  // identificou", e sem isso não há assinatura.
  const [lider, setLider] = useState<IdentidadeLider | null>(null);
  const [pedindoLogin, setPedindoLogin] = useState(false);
  /**
   * Fechamento em contingência: o líder não pôde entrar. O nome aqui é
   * DECLARADO, não verificado, e a tela precisa dizer isso — senão a
   * contingência vira indistinguível da assinatura de verdade.
   */
  const [contingencia, setContingencia] = useState<{
    autorizou: string;
    motivo: string;
  } | null>(null);
  const [assinaturaChecklist, setAssinaturaChecklist] = useState<string | null>(null);
  const [assinaturaLimpeza, setAssinaturaLimpeza] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Reusa a mesma assinatura para os dois quando ambos pendentes (atalho)
  const usarMesmaAssinatura = () => {
    if (assinaturaChecklist && !assinaturaLimpeza) {
      setAssinaturaLimpeza(assinaturaChecklist);
    } else if (assinaturaLimpeza && !assinaturaChecklist) {
      setAssinaturaChecklist(assinaturaLimpeza);
    }
  };

  if (loading || !usuario) return <TelaCarregando />;

  const nadaParaValidar = !checklistPendente && !limpezaPendente;

  const handleSalvar = async () => {
    if (!lider && !contingencia) {
      toast.error("O líder precisa entrar com o próprio usuário para validar.");
      return;
    }
    // Na contingência o nome vem do que foi declarado, e vai marcado como tal
    // no que é gravado — em nenhum lugar ele se passa por assinatura do líder.
    const nomeParaRegistro = lider ? lider.nome : `${contingencia!.autorizou} (contingência)`;
    if (checklistPendente && !assinaturaChecklist) {
      toast.error("Líder precisa assinar o checklist.");
      return;
    }
    if (limpezaPendente && !assinaturaLimpeza) {
      toast.error("Líder precisa assinar a limpeza.");
      return;
    }
    setSalvando(true);
    const agora = new Date().toISOString();
    try {
      // ── Checklist (Pós-setup) ──
      if (checklistPendente && posSetup) {
        const atualizado: Checklist = {
          ...posSetup,
          assinaturaLider: {
            dataUrl: assinaturaChecklist!,
            nome: nomeParaRegistro,
            assinadoEm: agora,
          },
        };
        storage.saveChecklist(atualizado);
        await upsertChecklist(atualizado);
      }

      // ── Limpeza do turno ──
      if (limpezaPendente && limpezaTurno) {
        const payload: LimpezaTurno = {
          ...limpezaTurno,
          status: "validado",
          liderNome: nomeParaRegistro,
          assinaturaLider: {
            dataUrl: assinaturaLimpeza!,
            nome: nomeParaRegistro,
            assinadoEm: agora,
          },
          liderAssinouEm: agora,
          observacao: contingencia
            ? `${limpezaTurno.observacao ? `${limpezaTurno.observacao}\n` : ""}Fechado em contingência por ${usuario.nome}: ${contingencia.motivo}. Autorizado por ${contingencia.autorizou}.`
            : limpezaTurno.observacao,
          // Quem editou continua sendo a sessão do tablet (o operador), mas
          // quem VALIDOU é o líder autenticado. São coisas diferentes e agora
          // ficam registradas como tal.
          ultimaEdicaoPorLogin: usuario.usuario,
          ultimaEdicaoPorNome: usuario.nome,
        };
        await limpeza.salvarTurno(payload, {
          editadoPorLogin: usuario.usuario,
          editadoPorNome: usuario.nome,
        });
      }

      toast.success("Validação do líder registrada com sucesso!");
      navigate({ to: "/operador" });
    } catch (e) {
      console.error("[validacao-lider] erro ao salvar:", e);
      toast.error(e instanceof Error ? e.message : "Erro ao salvar a validação.");
    } finally {
      setSalvando(false);
    }
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

            {/* Identificação do líder — autenticada, não digitada. */}
            <div
              className={cn(
                "mb-5 rounded-2xl border-2 p-5 shadow-sm md:p-6",
                lider
                  ? "border-success/50 bg-success-soft/40"
                  : contingencia
                    ? "border-warning bg-warning/15"
                    : "border-primary/40 bg-card",
              )}
            >
              {contingencia ? (
                /* Amarelo, nunca verde: é fechamento em contingência, e a tela
                   não pode deixar isso passar por assinatura do líder. */
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning text-warning-foreground">
                    <ShieldCheck className="h-6 w-6" />
                  </span>
                  <div className="flex-1">
                    <p className="text-base font-bold text-foreground">
                      Fechamento em contingência
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Autorizado por <b className="text-foreground">{contingencia.autorizou}</b> ·{" "}
                      {contingencia.motivo}. Fica registrado que quem fechou foi {usuario.nome} —
                      não é a assinatura do líder, e a supervisão vê esta lista.
                    </p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => setContingencia(null)}>
                    Desfazer
                  </Button>
                </div>
              ) : lider ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success text-success-foreground">
                    <ShieldCheck className="h-6 w-6" />
                  </span>
                  <div className="flex-1">
                    <p className="text-base font-bold text-foreground">{lider.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      Identificado como {lider.login} · {formatarDataHora(lider.autenticadoEm)}
                    </p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => setLider(null)}>
                    Não sou eu
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <ShieldCheck className="h-6 w-6" />
                  </span>
                  <div className="flex-1">
                    <p className="text-base font-bold text-foreground">
                      O líder precisa se identificar
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ele entra com o próprio usuário aqui mesmo. O turno do operador continua
                      aberto — não é preciso sair do app nem outro tablet.
                    </p>
                  </div>
                  <Button type="button" onClick={() => setPedindoLogin(true)}>
                    Identificar líder
                  </Button>
                </div>
              )}
            </div>

            <AutenticarLiderDialog
              aberto={pedindoLogin}
              onFechar={() => setPedindoLogin(false)}
              // Estes registros são gravados na sessão do LÍDER, e o banco
              // carimba autor e horário. É o que torna a assinatura auditável:
              // o resto desta tela é escrito pela sessão do operador.
              validacoes={[
                ...(checklistPendente && posSetup
                  ? [
                      {
                        alvoTipo: "checklist" as const,
                        alvoId: posSetup.id,
                        dataOperacao: data,
                        turno: turno ?? "",
                      },
                    ]
                  : []),
                ...(limpezaPendente && limpezaTurno
                  ? [
                      {
                        alvoTipo: "limpeza" as const,
                        alvoId: limpezaTurno.id,
                        dataOperacao: data,
                        turno: turno ?? "",
                      },
                    ]
                  : []),
              ]}
              onAuditoriaIndisponivel={() =>
                toast.warning(
                  "Validação registrada localmente, mas a auditoria do banco ainda não está ativa (migration 06 pendente).",
                )
              }
              onAutenticado={(l) => {
                setLider(l);
                setContingencia(null);
                setPedindoLogin(false);
                toast.success(`Líder ${l.nome} identificado.`);
              }}
              onContingencia={(autorizou, motivo) => {
                setContingencia({ autorizou, motivo });
                setLider(null);
                setPedindoLogin(false);
                toast.warning("Fechamento em contingência registrado.");
              }}
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
                disabled={salvando}
              >
                {salvando ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Salvando…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-5 w-5" /> Confirmar validação do líder
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
