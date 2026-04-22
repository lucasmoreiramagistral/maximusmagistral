// ============================================================
// CRUD de atas de treinamento na função (IT 002 / IT 005).
// Tabela: it_atas_treinamento
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { canonizarNomeOperador } from "@/lib/it/identidade";
import type { Turno } from "@/lib/checklist/types";

export type AtaDocumento = "it002" | "it005";

export interface AtaTreinamento {
  id: string;
  documento: AtaDocumento;
  operadorNome: string;
  operadorNomeCanonico: string;
  operadorUserId: string | null;
  turno: string;
  equipe: string | null;
  instrutorNome: string;
  instrutorAssinatura: string; // PNG dataURL
  deviceId: string | null;
  registradoPorLogin: string | null;
  registradoPorPerfil: string | null;
  dataTreinamento: string; // YYYY-MM-DD
  criadoEm: string; // ISO
}

interface AtaRow {
  id: string;
  documento: AtaDocumento;
  operador_nome: string;
  operador_nome_canonico: string;
  operador_user_id: string | null;
  turno: string;
  equipe: string | null;
  instrutor_nome: string;
  instrutor_assinatura: string;
  device_id: string | null;
  registrado_por_login: string | null;
  registrado_por_perfil: string | null;
  registrado_por_user_id: string | null;
  data_treinamento: string;
  criado_em: string;
}

function rowToAta(r: AtaRow): AtaTreinamento {
  return {
    id: r.id,
    documento: r.documento,
    operadorNome: r.operador_nome,
    operadorNomeCanonico: r.operador_nome_canonico,
    operadorUserId: r.operador_user_id,
    turno: r.turno,
    equipe: r.equipe,
    instrutorNome: r.instrutor_nome,
    instrutorAssinatura: r.instrutor_assinatura,
    deviceId: r.device_id,
    registradoPorLogin: r.registrado_por_login,
    registradoPorPerfil: r.registrado_por_perfil,
    dataTreinamento: r.data_treinamento,
    criadoEm: r.criado_em,
  };
}

export interface NovaAtaInput {
  documento: AtaDocumento;
  operadorNome: string;
  operadorUserId?: string | null;
  turno: Turno | string;
  equipe?: string | null;
  instrutorNome: string;
  instrutorAssinatura: string;
  deviceId?: string | null;
  registradoPorLogin?: string | null;
  registradoPorPerfil?: string | null;
}

/**
 * Cadastra/atualiza uma ata. Re-treinamento: re-cadastrar mesma combinação
 * (documento, operador canônico) faz UPDATE da linha existente.
 */
export async function salvarAta(input: NovaAtaInput): Promise<AtaTreinamento> {
  const operadorNomeLimpo = input.operadorNome.trim().replace(/\s+/g, " ");
  const canonico = canonizarNomeOperador(operadorNomeLimpo);

  // Tentar UPDATE primeiro (re-treinamento). Se 0 linhas, INSERT.
  const { data: existente } = await (supabase.from as any)("it_atas_treinamento")
    .select("id")
    .eq("documento", input.documento)
    .eq("operador_nome_canonico", canonico)
    .maybeSingle();

  if (existente?.id) {
    const { data, error } = await (supabase.from as any)("it_atas_treinamento")
      .update({
        operador_nome: operadorNomeLimpo,
        operador_user_id: input.operadorUserId ?? null,
        turno: input.turno,
        equipe: input.equipe ?? null,
        instrutor_nome: input.instrutorNome.trim(),
        instrutor_assinatura: input.instrutorAssinatura,
        device_id: input.deviceId ?? null,
        registrado_por_login: input.registradoPorLogin ?? null,
        registrado_por_perfil: input.registradoPorPerfil ?? null,
      })
      .eq("id", existente.id)
      .select("*")
      .single();
    if (error) throw error;
    return rowToAta(data as AtaRow);
  }

  const { data, error } = await (supabase.from as any)("it_atas_treinamento")
    .insert({
      documento: input.documento,
      operador_nome: operadorNomeLimpo,
      operador_user_id: input.operadorUserId ?? null,
      turno: input.turno,
      equipe: input.equipe ?? null,
      instrutor_nome: input.instrutorNome.trim(),
      instrutor_assinatura: input.instrutorAssinatura,
      device_id: input.deviceId ?? null,
      registrado_por_login: input.registradoPorLogin ?? null,
      registrado_por_perfil: input.registradoPorPerfil ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToAta(data as AtaRow);
}

/**
 * Verifica se um operador já tem ata cadastrada para um documento específico.
 * Usado pelo gate de identidade nas IT.
 */
export async function temAtaCadastrada(params: {
  operadorNomeCanonico: string;
  documento: AtaDocumento;
}): Promise<boolean> {
  const { data, error } = await (supabase.from as any)("it_atas_treinamento")
    .select("id")
    .eq("documento", params.documento)
    .eq("operador_nome_canonico", params.operadorNomeCanonico)
    .maybeSingle();
  if (error) {
    console.error("[atas] erro ao checar ata", error);
    return false;
  }
  return !!data?.id;
}

/** Lista todas as atas (ordem: mais recente primeiro). */
export async function listarAtas(): Promise<AtaTreinamento[]> {
  const { data, error } = await (supabase.from as any)("it_atas_treinamento")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return ((data as AtaRow[]) ?? []).map(rowToAta);
}

/** Agrupamento por operador (nome canônico) para o dashboard. */
export interface OperadorTreinado {
  nomeCanonico: string;
  nomeCompleto: string; // versão mais recente
  ataOperacao: AtaTreinamento | null;
  ataLimpeza: AtaTreinamento | null;
}

export function agruparPorOperador(atas: AtaTreinamento[]): OperadorTreinado[] {
  const map = new Map<string, OperadorTreinado>();
  // atas vêm ordenadas por criado_em desc, então a primeira que entrar é a mais recente
  for (const a of atas) {
    const key = a.operadorNomeCanonico;
    let cur = map.get(key);
    if (!cur) {
      cur = {
        nomeCanonico: key,
        nomeCompleto: a.operadorNome,
        ataOperacao: null,
        ataLimpeza: null,
      };
      map.set(key, cur);
    }
    if (a.documento === "it002" && !cur.ataOperacao) cur.ataOperacao = a;
    if (a.documento === "it005" && !cur.ataLimpeza) cur.ataLimpeza = a;
  }
  return Array.from(map.values()).sort((a, b) =>
    a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"),
  );
}
