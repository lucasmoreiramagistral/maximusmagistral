/** Fechamento autenticado e transacional do Checklist/Limpeza (migration 09). */

import { supabase } from "@/integrations/supabase/client";
import { criarClienteValidacao } from "@/integrations/supabase/client-validacao";
import { loginParaEmail, mensagemErroLogin } from "@/lib/usuarios/login-cliente";
import { PERFIS_QUE_VALIDAM, type Contingencia, type IdentidadeLider } from "./autenticar-lider";

export interface SolicitacaoFinalizacao {
  fechamentoId: string;
  checklist?: { id: string; assinaturaDataUrl: string };
  limpeza?: { id: string; assinaturaDataUrl: string };
  observacao?: string | null;
}

export interface ResultadoFinalizacao {
  fechamentoId: string;
  validadoEm: string;
  contingencia: boolean;
  nomeAssinatura: string;
  ator: {
    userId: string;
    login: string;
    nome: string;
    perfil: string;
  };
}

export type RetornoFinalizacao =
  | { ok: true; resultado: ResultadoFinalizacao; lider?: IdentidadeLider }
  | { ok: false; erro: string };

type ClienteSupabase = typeof supabase;

export function novoFechamentoId(): string {
  return crypto.randomUUID();
}

function erroRpc(error: { code?: string; message?: string } | null): string {
  if (error?.code === "PGRST202" || /function .* does not exist/i.test(error?.message ?? "")) {
    return "A migration 09 ainda não foi aplicada. Nenhum fechamento foi registrado.";
  }
  return error?.message || "Não foi possível concluir a validação.";
}

function interpretarResultado(data: unknown): ResultadoFinalizacao | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const ator = d.ator as Record<string, unknown> | undefined;
  if (
    typeof d.fechamentoId !== "string" ||
    typeof d.validadoEm !== "string" ||
    typeof d.contingencia !== "boolean" ||
    typeof d.nomeAssinatura !== "string" ||
    !ator ||
    typeof ator.userId !== "string" ||
    typeof ator.login !== "string" ||
    typeof ator.nome !== "string" ||
    typeof ator.perfil !== "string"
  ) {
    return null;
  }
  return {
    fechamentoId: d.fechamentoId,
    validadoEm: d.validadoEm,
    contingencia: d.contingencia,
    nomeAssinatura: d.nomeAssinatura,
    ator: {
      userId: ator.userId,
      login: ator.login,
      nome: ator.nome,
      perfil: ator.perfil,
    },
  };
}

function parametros(s: SolicitacaoFinalizacao) {
  return {
    p_fechamento_id: s.fechamentoId,
    p_checklist_id: s.checklist?.id ?? null,
    p_assinatura_checklist: s.checklist?.assinaturaDataUrl ?? null,
    p_limpeza_id: s.limpeza?.id ?? null,
    p_assinatura_limpeza: s.limpeza?.assinaturaDataUrl ?? null,
    p_observacao: s.observacao?.trim() || null,
  };
}

async function chamarNormal(
  cliente: ClienteSupabase,
  solicitacao: SolicitacaoFinalizacao,
): Promise<RetornoFinalizacao> {
  const { data, error } = await cliente.rpc(
    "rpc_finalizar_validacao_lider" as never,
    {
      ...parametros(solicitacao),
    } as never,
  );
  if (error) {
    console.error("[validacao-v2] normal:", error);
    return { ok: false, erro: erroRpc(error) };
  }
  const resultado = interpretarResultado(data);
  return resultado
    ? { ok: true, resultado }
    : { ok: false, erro: "O banco confirmou a chamada, mas devolveu um resultado inválido." };
}

/** Mesmo tablet do Operador: autentica e finaliza dentro da sessão isolada do Líder. */
export async function finalizarValidacaoComLogin(
  login: string,
  senha: string,
  solicitacao: SolicitacaoFinalizacao,
): Promise<RetornoFinalizacao> {
  const usuario = login.trim();
  if (!usuario || !senha) return { ok: false, erro: "Informe usuário e senha." };

  const cliente = criarClienteValidacao();
  try {
    const { data, error } = await cliente.auth.signInWithPassword({
      email: loginParaEmail(usuario),
      password: senha,
    });
    if (error || !data.user) return { ok: false, erro: mensagemErroLogin(error) };

    const { data: perfil, error: pErr } = await cliente
      .from("profiles")
      .select("perfil, active, nome, usuario")
      .eq("id", data.user.id)
      .maybeSingle();
    if (pErr || !perfil) return { ok: false, erro: "Perfil não encontrado." };
    if (!perfil.active) return { ok: false, erro: "Usuário inativo." };
    if (!PERFIS_QUE_VALIDAM.includes(perfil.perfil as (typeof PERFIS_QUE_VALIDAM)[number])) {
      return { ok: false, erro: "Este usuário não tem permissão para validar." };
    }

    const r = await chamarNormal(cliente, solicitacao);
    if (!r.ok) return r;
    return {
      ...r,
      lider: {
        userId: data.user.id,
        login: perfil.usuario ?? usuario,
        nome: perfil.nome ?? usuario,
        perfil: perfil.perfil,
        autenticadoEm: r.resultado.validadoEm,
      },
    };
  } catch (e) {
    console.error("[validacao-v2] login:", e);
    return { ok: false, erro: "Erro ao validar. Tente novamente." };
  } finally {
    await cliente.auth.signOut().catch(() => undefined);
  }
}

/** Área própria do Líder/Sup/GI: usa a sessão já autenticada. */
export async function finalizarValidacaoSessao(
  solicitacao: SolicitacaoFinalizacao,
): Promise<RetornoFinalizacao> {
  return chamarNormal(supabase, solicitacao);
}

/** Contingência honesta: a RPC carimba o Operador e nunca se passa pelo Líder. */
export async function finalizarValidacaoContingencia(
  solicitacao: SolicitacaoFinalizacao,
  contingencia: Contingencia,
): Promise<RetornoFinalizacao> {
  const { data, error } = await supabase.rpc(
    "rpc_finalizar_validacao_contingencia" as never,
    {
      ...parametros(solicitacao),
      p_autorizou: contingencia.autorizou.trim(),
      p_motivo: contingencia.motivo.trim(),
    } as never,
  );
  if (error) {
    console.error("[validacao-v2] contingência:", error);
    return { ok: false, erro: erroRpc(error) };
  }
  const resultado = interpretarResultado(data);
  return resultado
    ? { ok: true, resultado }
    : { ok: false, erro: "O banco devolveu um resultado de contingência inválido." };
}
