import { supabase } from "@/integrations/supabase/client";
import type { Turno } from "@/lib/checklist/types";

/**
 * Espelho consolidado das observações do verso (PTP + Limpeza) no campo
 * "Observações" oficial da frente da folha.
 *
 * Regras:
 *  - 1 linha por (folha_dia_key, origem_tipo, origem_codigo).
 *  - Editar substitui o texto e bate auditoria com texto_antes/texto_depois.
 *  - Apagar texto (texto vazio) remove a linha (auditado como "removeu").
 *  - A observação é por DIA + linha + máquina, compartilhada entre turnos
 *    (espelha a folha física: 1 verso por dia).
 */

export interface ObservacaoVerso {
  id: number;
  folhaDiaKey: string;
  dataOperacao: string;
  linha: string;
  maquina: string;
  origemTipo: "ptp" | "limpeza";
  origemCodigo: string;
  origemLabel: string;
  texto: string;
  registradoEm: string;
  registradoPorLogin: string;
  registradoPorNome: string;
  updatedAt?: string;
}

interface ObservacaoRow {
  id: number;
  folha_dia_key: string;
  data_operacao: string;
  linha: string;
  maquina: string;
  origem_tipo: "ptp" | "limpeza";
  origem_codigo: string;
  origem_label: string;
  texto: string;
  registrado_em: string;
  registrado_por_login: string;
  registrado_por_nome: string;
  updated_at?: string;
}

function fromRow(r: ObservacaoRow): ObservacaoVerso {
  return {
    id: r.id,
    folhaDiaKey: r.folha_dia_key,
    dataOperacao: r.data_operacao,
    linha: r.linha,
    maquina: r.maquina,
    origemTipo: r.origem_tipo,
    origemCodigo: r.origem_codigo,
    origemLabel: r.origem_label,
    texto: r.texto,
    registradoEm: r.registrado_em,
    registradoPorLogin: r.registrado_por_login,
    registradoPorNome: r.registrado_por_nome,
    updatedAt: r.updated_at,
  };
}

export interface UpsertObservacaoInput {
  folhaDiaKey: string;
  dataOperacao: string;
  linha: string;
  maquina: string;
  origemTipo: "ptp" | "limpeza";
  origemCodigo: string;
  origemLabel: string;
  texto: string;
  registradoPorLogin: string;
  registradoPorNome: string;
}

/** Lista todas as observações do verso para um dia/linha/máquina. */
export async function fetchObservacoesVerso(
  folhaDiaKey: string,
): Promise<ObservacaoVerso[]> {
  const { data, error } = await supabase
    .from("folha_observacoes_verso" as never)
    .select("*")
    .eq("folha_dia_key", folhaDiaKey)
    .order("registrado_em", { ascending: true });
  if (error) {
    console.error("[fetchObservacoesVerso]", error);
    throw error;
  }
  return ((data ?? []) as unknown as ObservacaoRow[]).map(fromRow);
}

/**
 * Upsert/delete por (folha_dia_key, origem_tipo, origem_codigo).
 * Se texto.trim() === "" → DELETE (com auditoria "removeu").
 * Se já existir e o texto mudou → UPDATE (auditoria "editou").
 * Se não existir e tem texto → INSERT (auditoria "criou").
 * Se já existir e texto idêntico → no-op.
 */
export async function upsertObservacaoVerso(input: UpsertObservacaoInput): Promise<void> {
  const textoNovo = input.texto.trim();

  // Buscar registro existente
  const { data: existente, error: errSel } = await supabase
    .from("folha_observacoes_verso" as never)
    .select("id, texto")
    .eq("folha_dia_key", input.folhaDiaKey)
    .eq("origem_tipo", input.origemTipo)
    .eq("origem_codigo", input.origemCodigo)
    .maybeSingle();
  if (errSel) {
    console.error("[upsertObservacaoVerso/select]", errSel);
    throw errSel;
  }

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  const ex = existente as { id: number; texto: string } | null;

  // Caso 1: vazio + não existe → no-op
  if (!textoNovo && !ex) return;

  // Caso 2: vazio + existe → DELETE + auditoria
  if (!textoNovo && ex) {
    const { error: errDel } = await supabase
      .from("folha_observacoes_verso" as never)
      .delete()
      .eq("id", ex.id);
    if (errDel) {
      console.error("[upsertObservacaoVerso/delete]", errDel);
      throw errDel;
    }
    await supabase.from("folha_observacoes_verso_edicoes" as never).insert({
      folha_observacao_id: ex.id,
      folha_dia_key: input.folhaDiaKey,
      origem_tipo: input.origemTipo,
      origem_codigo: input.origemCodigo,
      texto_antes: ex.texto,
      texto_depois: null,
      acao: "removeu",
      editado_por_login: input.registradoPorLogin,
      editado_por_nome: input.registradoPorNome,
    } as never);
    return;
  }

  const agora = new Date().toISOString();

  // Caso 3: existe e texto mudou → UPDATE + auditoria
  if (ex && ex.texto !== textoNovo) {
    const { error: errUpd } = await supabase
      .from("folha_observacoes_verso" as never)
      .update({
        texto: textoNovo,
        origem_label: input.origemLabel,
        registrado_em: agora,
        registrado_por_login: input.registradoPorLogin,
        registrado_por_nome: input.registradoPorNome,
        registrado_por_user_id: userId,
      } as never)
      .eq("id", ex.id);
    if (errUpd) {
      console.error("[upsertObservacaoVerso/update]", errUpd);
      throw errUpd;
    }
    await supabase.from("folha_observacoes_verso_edicoes" as never).insert({
      folha_observacao_id: ex.id,
      folha_dia_key: input.folhaDiaKey,
      origem_tipo: input.origemTipo,
      origem_codigo: input.origemCodigo,
      texto_antes: ex.texto,
      texto_depois: textoNovo,
      acao: "editou",
      editado_por_login: input.registradoPorLogin,
      editado_por_nome: input.registradoPorNome,
    } as never);
    return;
  }

  // Caso 4: existe e texto idêntico → no-op
  if (ex) return;

  // Caso 5: não existe e tem texto → INSERT + auditoria "criou"
  const { data: inserted, error: errIns } = await supabase
    .from("folha_observacoes_verso" as never)
    .insert({
      folha_dia_key: input.folhaDiaKey,
      data_operacao: input.dataOperacao,
      linha: input.linha,
      maquina: input.maquina,
      origem_tipo: input.origemTipo,
      origem_codigo: input.origemCodigo,
      origem_label: input.origemLabel,
      texto: textoNovo,
      registrado_em: agora,
      registrado_por_login: input.registradoPorLogin,
      registrado_por_nome: input.registradoPorNome,
      registrado_por_user_id: userId,
    } as never)
    .select("id")
    .single();
  if (errIns) {
    console.error("[upsertObservacaoVerso/insert]", errIns);
    throw errIns;
  }
  const novoId = (inserted as { id: number } | null)?.id;
  if (novoId) {
    await supabase.from("folha_observacoes_verso_edicoes" as never).insert({
      folha_observacao_id: novoId,
      folha_dia_key: input.folhaDiaKey,
      origem_tipo: input.origemTipo,
      origem_codigo: input.origemCodigo,
      texto_antes: null,
      texto_depois: textoNovo,
      acao: "criou",
      editado_por_login: input.registradoPorLogin,
      editado_por_nome: input.registradoPorNome,
    } as never);
  }
}

/**
 * Formata uma observação no padrão pedido pela operação:
 *   [PTP J01 21/04 08:13] texto...
 *   [LIMPEZA 12x36 Dia 21/04 14:32] texto...
 */
export function formatarLinhaObservacao(o: ObservacaoVerso): string {
  const dt = new Date(o.registradoEm);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  return `[${o.origemLabel} ${dd}/${mm} ${hh}:${mi}] ${o.texto}`;
}

/** Helper: monta o origem_label de uma janela do PTP. */
export function labelPtpJanela(janelaCodigo: string): string {
  return `PTP ${janelaCodigo}`;
}

/** Helper: monta o origem_label de um turno da limpeza. */
export function labelLimpezaTurno(turno: Turno): string {
  return `LIMPEZA ${turno}`;
}
