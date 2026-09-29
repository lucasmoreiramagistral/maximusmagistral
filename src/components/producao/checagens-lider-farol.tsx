import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignaturePad } from "@/components/signature-pad";
import { supabase } from "@/integrations/supabase/client";
import type { Usuario } from "@/lib/checklist/types";
import { MAQUINAS_ORDENADAS } from "@/lib/maquinas/catalogo";
import { formatarDataBR } from "@/lib/operacao/data-operacional";

interface ChecagemPendente {
  id: string;
  data_operacao: string;
  maquina: string;
  hora_codigo: string;
  hora_inicio: string;
  hora_fim: string;
  operador_user_id: string | null;
  operador_nome: string | null;
  quantidade: number | null;
  nao_rodou: boolean;
  operador_assinou_em: string | null;
  updated_at: string;
}

const HORAS_FINAIS = ["H12", "H24"];
const NOMES_MAQUINAS = MAQUINAS_ORDENADAS.map((maquina) => maquina.nome);
const TAMANHO_PAGINA = 200;

function mesmoInstante(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const primeiro = Date.parse(a);
  const segundo = Date.parse(b);
  return Number.isFinite(primeiro) && primeiro === segundo;
}

async function buscarChecagens(operadoresEquipe: ReadonlySet<string>): Promise<ChecagemPendente[]> {
  const ids = [...operadoresEquipe];
  if (ids.length === 0) return [];

  const todas: ChecagemPendente[] = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    // O filtro de equipe vai ao banco. A RPC confere novamente essa relação
    // antes de aceitar a assinatura; o filtro de tela não concede acesso.
    const { data, error } = await supabase
      .from("producao_horaria" as never)
      .select(
        "id,data_operacao,maquina,hora_codigo,hora_inicio,hora_fim,operador_user_id,operador_nome,quantidade,nao_rodou,operador_assinou_em,updated_at",
      )
      .in("operador_user_id", ids)
      .in("maquina", NOMES_MAQUINAS)
      .in("hora_codigo", HORAS_FINAIS)
      .not("finalizado_em", "is", null)
      .is("assinatura_lider", null)
      .order("data_operacao", { ascending: false })
      .order("hora_codigo", { ascending: false })
      .order("id", { ascending: true })
      .range(inicio, inicio + TAMANHO_PAGINA - 1);
    if (error) throw error;
    const pagina = (data ?? []) as unknown as ChecagemPendente[];
    todas.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA) return todas;
  }
}

function assinaturaConfirmada(
  valor: unknown,
  horaId: string,
  userId: string,
  assinaturaDataUrl: string,
): boolean {
  if (!valor || typeof valor !== "object") return false;
  const resposta = valor as Record<string, unknown>;
  const ator = resposta.ator as Record<string, unknown> | undefined;
  const hora = resposta.hora as Record<string, unknown> | undefined;
  const assinatura = hora?.assinatura_lider as Record<string, unknown> | undefined;
  return (
    ator?.userId === userId &&
    hora?.id === horaId &&
    assinatura?.userId === userId &&
    assinatura?.dataUrl === assinaturaDataUrl &&
    assinatura?.nome === ator?.nome &&
    hora?.lider_nome === ator?.nome &&
    mesmoInstante(assinatura?.assinadoEm, hora?.lider_assinou_em)
  );
}

async function releituraConfirmaAssinatura(
  horaId: string,
  userId: string,
  assinaturaDataUrl: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("producao_horaria" as never)
    .select("id,assinatura_lider,lider_assinou_em")
    .eq("id", horaId)
    .maybeSingle();
  if (error || !data) return false;
  const linha = data as unknown as {
    id: string;
    assinatura_lider: { dataUrl?: string; userId?: string; assinadoEm?: string } | null;
    lider_assinou_em: string | null;
  };
  return (
    linha.id === horaId &&
    linha.assinatura_lider?.userId === userId &&
    linha.assinatura_lider?.dataUrl === assinaturaDataUrl &&
    mesmoInstante(linha.assinatura_lider?.assinadoEm, linha.lider_assinou_em)
  );
}

export function ChecagensLiderFarol({
  usuario,
  operadoresEquipe,
  carregandoEquipe,
}: {
  usuario: Usuario;
  operadoresEquipe: ReadonlySet<string>;
  carregandoEquipe: boolean;
}) {
  const [pendentes, setPendentes] = useState<ChecagemPendente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLeitura, setErroLeitura] = useState("");
  const [selecionada, setSelecionada] = useState<ChecagemPendente | null>(null);
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroAssinatura, setErroAssinatura] = useState("");
  const [recarregar, setRecarregar] = useState(0);

  const perfilPodeAssinar =
    ["lider", "supervisor", "gestao"].includes(usuario.perfil) &&
    !usuario.somenteLeitura &&
    Boolean(usuario.userId);

  useEffect(() => {
    if (!perfilPodeAssinar || carregandoEquipe) return;
    let cancelado = false;
    setCarregando(true);
    setErroLeitura("");
    void buscarChecagens(operadoresEquipe)
      .then((horas) => {
        if (!cancelado) setPendentes(horas);
      })
      .catch((error: unknown) => {
        console.error("[checagens-lider-farol] leitura:", error);
        if (!cancelado) setErroLeitura("Não foi possível carregar as checagens Hora x Hora.");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [perfilPodeAssinar, carregandoEquipe, operadoresEquipe, recarregar]);

  if (!perfilPodeAssinar) return null;

  const fechar = () => {
    if (salvando) return;
    setSelecionada(null);
    setAssinatura(null);
    setErroAssinatura("");
  };

  const assinar = async () => {
    if (!selecionada || !usuario.userId || salvando) return;
    if (!selecionada.operador_assinou_em) {
      setErroAssinatura("O operador deve assinar o turno antes da validação do líder.");
      return;
    }
    if (!assinatura?.startsWith("data:image/png;base64,") || assinatura.length < 100) {
      setErroAssinatura("Desenhe a assinatura antes de confirmar.");
      return;
    }
    setSalvando(true);
    setErroAssinatura("");
    let confirmado = false;
    let falha: unknown;
    try {
      const { data: autenticacao, error: erroAuth } = await supabase.auth.getUser();
      if (erroAuth || autenticacao.user?.id !== usuario.userId) {
        throw new Error("Sua sessão mudou. Entre novamente antes de assinar.");
      }
      const { data, error } = await supabase.rpc("rpc_assinar_hora_lider", {
        p_hora_id: selecionada.id,
        p_updated_at: selecionada.updated_at,
        p_assinatura_data_url: assinatura,
      });
      if (error) throw error;
      if (!assinaturaConfirmada(data, selecionada.id, usuario.userId, assinatura)) {
        throw new Error("O banco não devolveu a assinatura confirmada. Recarregue a fila.");
      }
      confirmado = true;
    } catch (error) {
      falha = error;
      // A resposta pode se perder após o commit. Só tratamos como sucesso se
      // uma nova leitura trouxer esta mesma assinatura e o usuário autenticado.
      confirmado = await releituraConfirmaAssinatura(
        selecionada.id,
        usuario.userId,
        assinatura,
      ).catch(() => false);
    }
    if (confirmado) {
      setPendentes((atual) => atual.filter((hora) => hora.id !== selecionada.id));
      toast.success(
        `${selecionada.maquina} · ${selecionada.hora_codigo} assinada por ${usuario.nome}.`,
      );
      setSelecionada(null);
      setAssinatura(null);
      setRecarregar((atual) => atual + 1);
    } else {
      setErroAssinatura(
        falha instanceof Error ? falha.message : "Não foi possível confirmar a assinatura.",
      );
      setRecarregar((atual) => atual + 1);
    }
    setSalvando(false);
  };

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <PenLine className="h-5 w-5" /> Checagens finais · Hora x Hora
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Assinatura do líder nas horas 17:00–18:00 (H12) e 05:00–06:00 (H24), após a assinatura do operador.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRecarregar((n) => n + 1)}
          disabled={carregando || carregandoEquipe}
        >
          Atualizar
        </Button>
      </div>

      {carregando || carregandoEquipe ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando checagens...
        </p>
      ) : erroLeitura ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {erroLeitura} Tente atualizar.
        </p>
      ) : pendentes.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" /> Nenhuma checagem finalizada da sua
          equipe aguarda assinatura.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">
            {pendentes.length} checagem(ns) pendente(s)
          </p>
          {pendentes.map((hora) => (
            <div
              key={hora.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/5 p-3"
            >
              <div>
                <p className="font-semibold text-foreground">
                  {hora.maquina} · {hora.hora_codigo} · {formatarDataBR(hora.data_operacao)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hora.hora_inicio}–{hora.hora_fim} ·{" "}
                  {hora.operador_nome?.trim() || "Operador não informado"} ·{" "}
                  {hora.nao_rodou
                    ? "Não rodou"
                    : `${hora.quantidade?.toLocaleString("pt-BR") ?? "—"} unidades`}
                </p>
                <p className={`mt-1 text-xs font-semibold ${hora.operador_assinou_em ? "text-success" : "text-warning"}`}>
                  {hora.operador_assinou_em
                    ? "Operador assinou · pronto para validação"
                    : "Aguardando assinatura do operador"}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!hora.operador_assinou_em}
                onClick={() => {
                  setSelecionada(hora);
                  setAssinatura(null);
                  setErroAssinatura("");
                }}
              >
                Conferir e assinar
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!selecionada}
        onOpenChange={(aberto) => {
          if (!aberto) fechar();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Checagem final · Hora x Hora</DialogTitle>
          </DialogHeader>
          {selecionada && (
            <div className="space-y-4">
              <p className="text-sm text-foreground">
                {selecionada.maquina} · {formatarDataBR(selecionada.data_operacao)} ·{" "}
                {selecionada.hora_inicio}–{selecionada.hora_fim}
              </p>
              <p className="text-sm text-muted-foreground">
                Operador: {selecionada.operador_nome?.trim() || "Não informado"}. A produção já foi
                confirmada; esta ação acrescenta somente a checagem do líder.
              </p>
              <SignaturePad
                label="Assinatura do líder"
                ajuda="Assine com o dedo ou mouse; sua sessão atual identifica a assinatura."
                value={assinatura}
                onChange={setAssinatura}
              />
              {erroAssinatura && (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {erroAssinatura}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={fechar} disabled={salvando}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => void assinar()}
                  disabled={salvando || !assinatura}
                >
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar assinatura"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
