/**
 * Persistência dos planos de ação v2.
 *
 * Nenhuma transição é mais montada no navegador. As RPCs da migration 09
 * derivam contexto e autoria dos registros reais e gravam estado + evento na
 * mesma transação. Se o evento falhar, a ação inteira volta.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Usuario } from "@/lib/checklist/types";
import type { Pendencia } from "./pendencias";
import { planoFromRow, type PlanoAcao, type PlanoAcaoRow } from "./planos-types";

const TABELA = "planos_acao";

function mensagemRpc(error: { code?: string; message?: string } | null, fallback: string): string {
  if (error?.code === "PGRST202" || /function .* does not exist/i.test(error?.message ?? "")) {
    return "A migration 09 ainda não foi aplicada. Nenhuma alteração foi registrada.";
  }
  return error?.message || fallback;
}

/** Falha de leitura é exceção: tela nenhuma deve converter “não sei” em zero. */
export async function buscarPlanos(): Promise<PlanoAcao[]> {
  const { data, error } = await supabase
    .from(TABELA as never)
    .select("*")
    .order("criado_em", { ascending: false });
  if (error) {
    console.error("[planos] buscar:", error);
    throw new Error(error.message || "Falha ao carregar os planos de ação.");
  }
  return ((data ?? []) as unknown as PlanoAcaoRow[]).map(planoFromRow);
}

export interface NovoPlano {
  oQue: string;
  quem: string;
  quando: string;
  como?: string;
}

export async function abrirPlano(
  pendencia: Pendencia,
  dados: NovoPlano,
  _usuario: Usuario,
): Promise<{ ok: true; planoId: string } | { ok: false; erro: string }> {
  if (pendencia.itemNumero == null) {
    return { ok: false, erro: "Esta pendência não é um item que aceite plano de ação." };
  }

  const anterior = pendencia.plano;
  const { data, error } = await supabase.rpc(
    "rpc_abrir_plano" as never,
    {
      p_origem_tipo: pendencia.origemTipo,
      p_origem_id: pendencia.origemId,
      p_item_numero: pendencia.itemNumero,
      p_o_que: dados.oQue,
      p_quem: dados.quem,
      p_quando: dados.quando,
      p_como: dados.como ?? null,
      p_substitui_plano_id: anterior?.status === "nao_cumprido" ? anterior.id : null,
    } as never,
  );

  if (error) {
    console.error("[planos] abrir:", error);
    return { ok: false, erro: mensagemRpc(error, "Falha ao abrir o plano de ação.") };
  }
  return { ok: true, planoId: String(data) };
}

export interface Checagem {
  cumprido: boolean;
  saiuNc: boolean;
  evidencia?: string;
}

export async function checarPlano(
  plano: PlanoAcao,
  c: Checagem,
  _usuario: Usuario,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { error } = await supabase.rpc(
    "rpc_checar_plano" as never,
    {
      p_plano_id: plano.id,
      p_cumprido: c.cumprido,
      p_saiu_nc: c.saiuNc,
      p_evidencia: c.evidencia?.trim() || null,
    } as never,
  );
  if (error) {
    console.error("[planos] checar:", error);
    return { ok: false, erro: mensagemRpc(error, "Falha ao registrar a checagem.") };
  }
  return { ok: true };
}

export type DecisaoPadronizacao = "padronizar" | "monitorar" | "girar";

export interface Padronizacao {
  decisao: DecisaoPadronizacao;
  analise: string;
  padraoRef?: string;
}

export async function padronizarPlano(
  plano: PlanoAcao,
  p: Padronizacao,
  _usuario: Usuario,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!p.analise.trim()) return { ok: false, erro: "Descreva o que foi aprendido." };
  if (p.decisao === "padronizar" && !p.padraoRef?.trim()) {
    return {
      ok: false,
      erro: "Informe qual procedimento foi alterado. Padronizar sem documento não é padronizar.",
    };
  }

  const { error } = await supabase.rpc(
    "rpc_padronizar_plano" as never,
    {
      p_plano_id: plano.id,
      p_decisao: p.decisao,
      p_analise: p.analise.trim(),
      p_padrao_ref: p.padraoRef?.trim() || null,
    } as never,
  );
  if (error) {
    console.error("[planos] decisão A:", error);
    return { ok: false, erro: mensagemRpc(error, "Falha ao registrar a decisão A.") };
  }
  return { ok: true };
}

/** GI: disponibiliza ou encaminha o recurso para a execução do PA. */
export async function liberarRecurso(
  plano: PlanoAcao,
  observacao: string,
  _usuario: Usuario,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { error } = await supabase.rpc(
    "rpc_liberar_recurso_plano" as never,
    {
      p_plano_id: plano.id,
      p_observacao: observacao.trim(),
    } as never,
  );
  if (error) {
    console.error("[planos] recurso:", error);
    return { ok: false, erro: mensagemRpc(error, "Falha ao registrar o recurso.") };
  }
  return { ok: true };
}
