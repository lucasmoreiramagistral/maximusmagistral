// CRUD das resoluções de NCs (checklist) e NRs (limpeza).
// Tabela: public.nao_conformidade_resolucoes (chave composta:
// origem + origem_id + item_numero).

import { supabase } from "@/integrations/supabase/client";
import type { OrigemNcNr, RegistroNcNr } from "@/lib/checklist/nao-conformidades";

export interface ResolucaoNcNr {
  id: string;
  origem: OrigemNcNr;
  origemId: string;
  itemNumero: string;
  dataOperacao: string;
  turno: string;
  resolvidoEm: string;
  oQueFoiFeito: string;
  resolvidoPorUserId: string | null;
  resolvidoPorLogin: string;
  resolvidoPorNome: string;
  criadoEm: string;
}

interface Row {
  id: string;
  origem: string;
  origem_id: string;
  item_numero: string;
  data_operacao: string;
  turno: string;
  resolvido_em: string;
  o_que_foi_feito: string;
  resolvido_por_user_id: string | null;
  resolvido_por_login: string;
  resolvido_por_nome: string;
  criado_em: string;
}

function fromRow(r: Row): ResolucaoNcNr {
  return {
    id: r.id,
    origem: r.origem as OrigemNcNr,
    origemId: r.origem_id,
    itemNumero: r.item_numero,
    dataOperacao: r.data_operacao,
    turno: r.turno,
    resolvidoEm: r.resolvido_em,
    oQueFoiFeito: r.o_que_foi_feito,
    resolvidoPorUserId: r.resolvido_por_user_id,
    resolvidoPorLogin: r.resolvido_por_login,
    resolvidoPorNome: r.resolvido_por_nome,
    criadoEm: r.criado_em,
  };
}

/** Chave composta usada para indexar resoluções por registro. */
export function chaveRegistro(r: {
  origem: OrigemNcNr;
  origemId: string;
  itemNumero: number | string;
}): string {
  return `${r.origem}::${r.origemId}::${String(r.itemNumero)}`;
}

export function chaveResolucao(r: ResolucaoNcNr): string {
  return `${r.origem}::${r.origemId}::${r.itemNumero}`;
}

/** Lista todas as resoluções desde uma data. */
export async function listarResolucoes(desdeIso: string): Promise<ResolucaoNcNr[]> {
  const { data, error } = await supabase
    .from("nao_conformidade_resolucoes" as never)
    .select("*")
    .gte("data_operacao", desdeIso);
  if (error) {
    console.error("[resolucoes] listar:", error);
    return [];
  }
  return ((data ?? []) as unknown as Row[]).map(fromRow);
}

export interface MarcarResolvidaInput {
  registro: RegistroNcNr & { origemId: string };
  oQueFoiFeito: string;
  resolvidoEm: string; // ISO
  resolvidoPor: {
    userId: string | null;
    login: string;
    nome: string;
  };
}

export async function marcarResolvida(
  input: MarcarResolvidaInput,
): Promise<ResolucaoNcNr | null> {
  const payload = {
    origem: input.registro.origem,
    origem_id: input.registro.origemId,
    item_numero: String(input.registro.itemNumero),
    data_operacao: input.registro.data,
    turno: input.registro.turno,
    resolvido_em: input.resolvidoEm,
    o_que_foi_feito: input.oQueFoiFeito.trim(),
    resolvido_por_user_id: input.resolvidoPor.userId,
    resolvido_por_login: input.resolvidoPor.login,
    resolvido_por_nome: input.resolvidoPor.nome,
  };
  const { data, error } = await supabase
    .from("nao_conformidade_resolucoes" as never)
    .upsert(payload, { onConflict: "origem,origem_id,item_numero" })
    .select("*")
    .single();
  if (error) {
    console.error("[resolucoes] marcar:", error);
    throw error;
  }
  return data ? fromRow(data as unknown as Row) : null;
}

export async function reabrir(resolucaoId: string): Promise<void> {
  const { error } = await supabase
    .from("nao_conformidade_resolucoes" as never)
    .delete()
    .eq("id", resolucaoId);
  if (error) {
    console.error("[resolucoes] reabrir:", error);
    throw error;
  }
}
