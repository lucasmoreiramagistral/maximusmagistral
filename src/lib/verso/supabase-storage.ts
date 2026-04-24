import { supabase } from "@/integrations/supabase/client";
import { genVersoId } from "./storage";
import {
  limpezaTurnoFromRow,
  limpezaTurnoToRow,
  ptpJanelaFromRow,
  ptpJanelaToRow,
  type LimpezaTurnoRow,
  type PtpJanelaRow,
} from "./mappers";
import {
  PTP_JANELAS,
  VERSO_CONTEXTO_FIXO,
  criarItensLimpezaVazios,
  criarItensPtpVazios,
} from "./constants";
import type {
  LimpezaEdicaoPayload,
  LimpezaTurno,
  PtpEdicaoPayload,
  PtpJanela,
} from "./types";
import type { Turno } from "@/lib/checklist/types";

/** Erro de conflito de versão (updated_at do servidor é mais recente). */
export class ConflitoVersaoError extends Error {
  constructor(public local: string | undefined, public remoto: string | undefined) {
    super("Conflito de versão: o registro foi alterado por outra pessoa.");
    this.name = "ConflitoVersaoError";
  }
}

// ─── PTP ─────────────────────────────────────────────────────────────
export async function fetchPtpJanelas(folhaDiaKey: string): Promise<PtpJanela[]> {
  const { data, error } = await supabase
    .from("ptp_janelas" as never)
    .select("*")
    .eq("folha_dia_key", folhaDiaKey);
  if (error) {
    console.error("[fetchPtpJanelas] supabase error:", error);
    throw error;
  }
  return ((data ?? []) as unknown as PtpJanelaRow[]).map(ptpJanelaFromRow);
}

export async function upsertPtpJanela(
  j: PtpJanela,
  opts: { expectedUpdatedAt?: string | null } = {},
): Promise<PtpJanela> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  // Detecção de conflito: se temos um expectedUpdatedAt, conferir antes de gravar.
  if (opts.expectedUpdatedAt !== undefined) {
    const { data: existing } = await supabase
      .from("ptp_janelas" as never)
      .select("updated_at")
      .eq("id", j.id)
      .maybeSingle();
    const remoto = (existing as { updated_at?: string } | null)?.updated_at;
    if (remoto && remoto !== opts.expectedUpdatedAt) {
      throw new ConflitoVersaoError(opts.expectedUpdatedAt ?? undefined, remoto);
    }
  }

  const row = ptpJanelaToRow(j, userId);
  const { data, error } = await supabase
    .from("ptp_janelas" as never)
    .upsert(row as never, { onConflict: "id" })
    .select("*")
    .single();
  if (error) {
    console.error("[upsertPtpJanela] supabase error:", error);
    throw error;
  }
  return ptpJanelaFromRow(data as unknown as PtpJanelaRow);
}

export async function insertPtpEdicao(p: PtpEdicaoPayload): Promise<void> {
  const { error } = await supabase.from("ptp_janelas_edicoes" as never).insert({
    ptp_janela_id: p.ptpJanelaId,
    folha_dia_key: p.folhaDiaKey,
    janela_codigo: p.janelaCodigo,
    editado_por_login: p.editadoPorLogin,
    editado_por_nome: p.editadoPorNome,
    motivo_edicao: p.motivoEdicao ?? null,
    antes_json: p.antesJson,
    depois_json: p.depoisJson,
  } as never);
  if (error) {
    console.error("[insertPtpEdicao] supabase error:", error);
    throw error;
  }
}

// ─── Limpeza ─────────────────────────────────────────────────────────
export async function fetchLimpezaTurnos(folhaDiaKey: string): Promise<LimpezaTurno[]> {
  const { data, error } = await supabase
    .from("limpeza_turnos" as never)
    .select("*")
    .eq("folha_dia_key", folhaDiaKey);
  if (error) {
    console.error("[fetchLimpezaTurnos] supabase error:", error);
    throw error;
  }
  return ((data ?? []) as unknown as LimpezaTurnoRow[]).map(limpezaTurnoFromRow);
}

export async function upsertLimpezaTurno(
  t: LimpezaTurno,
  opts: { expectedUpdatedAt?: string | null } = {},
): Promise<LimpezaTurno> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  if (opts.expectedUpdatedAt !== undefined) {
    const { data: existing } = await supabase
      .from("limpeza_turnos" as never)
      .select("updated_at")
      .eq("id", t.id)
      .maybeSingle();
    const remoto = (existing as { updated_at?: string } | null)?.updated_at;
    if (remoto && remoto !== opts.expectedUpdatedAt) {
      throw new ConflitoVersaoError(opts.expectedUpdatedAt ?? undefined, remoto);
    }
  }

  const row = limpezaTurnoToRow(t, userId);
  const { data, error } = await supabase
    .from("limpeza_turnos" as never)
    .upsert(row as never, { onConflict: "id" })
    .select("*")
    .single();
  if (error) {
    console.error("[upsertLimpezaTurno] supabase error:", error);
    throw error;
  }
  return limpezaTurnoFromRow(data as unknown as LimpezaTurnoRow);
}

export async function insertLimpezaEdicao(p: LimpezaEdicaoPayload): Promise<void> {
  const { error } = await supabase.from("limpeza_turnos_edicoes" as never).insert({
    limpeza_turno_id: p.limpezaTurnoId,
    folha_dia_key: p.folhaDiaKey,
    turno: p.turno,
    editado_por_login: p.editadoPorLogin,
    editado_por_nome: p.editadoPorNome,
    motivo_edicao: p.motivoEdicao ?? null,
    antes_json: p.antesJson,
    depois_json: p.depoisJson,
  } as never);
  if (error) {
    console.error("[insertLimpezaEdicao] supabase error:", error);
    throw error;
  }
}

// ─── Fábricas (estado default no front) ─────────────────────────────
export function createPtpJanelasPadrao(folhaDiaKey: string, dataOperacao: string): PtpJanela[] {
  return PTP_JANELAS.map((def) => ({
    id: genVersoId(`ptp-${dataOperacao}-${def.codigo}`),
    folhaDiaKey,
    dataOperacao,
    linha: VERSO_CONTEXTO_FIXO.linha,
    area: VERSO_CONTEXTO_FIXO.area,
    maquina: VERSO_CONTEXTO_FIXO.maquina,
    equipamento: VERSO_CONTEXTO_FIXO.equipamento,
    janelaCodigo: def.codigo,
    janelaInicio: def.inicio,
    janelaFim: def.fim,
    statusJanela: "pendente",
    itens: criarItensPtpVazios(),
    observacao: null,
  }));
}

/**
 * Modelo LAZY: cria UM registro padrão de limpeza para o turno informado.
 *
 * Substitui o antigo `createLimpezaTurnosPadrao` que pré-criava registros
 * para todos os turnos da lista fixa. Agora só existe registro de limpeza
 * para o turno em que o operador efetivamente abriu/preencheu — evitando
 * lixo operacional para turnos que não trabalharam naquele dia.
 */
export function createLimpezaTurnoPadrao(
  folhaDiaKey: string,
  dataOperacao: string,
  turno: Turno,
): LimpezaTurno {
  return {
    id: genVersoId(`limp-${dataOperacao}-${turno.replace(/\s/g, "_")}`),
    folhaDiaKey,
    dataOperacao,
    linha: VERSO_CONTEXTO_FIXO.linha,
    area: VERSO_CONTEXTO_FIXO.area,
    maquina: VERSO_CONTEXTO_FIXO.maquina,
    equipamento: VERSO_CONTEXTO_FIXO.equipamento,
    turno,
    status: "pendente",
    itens: criarItensLimpezaVazios(),
  };
}

// ─── Débitos técnicos documentados ───────────────────────────────────
// TODO(verso/gestao): criar hooks remotos `usePtpJanelasRemote` e
//   `useLimpezaTurnosRemote` antes de estender a tela da gestão e o
//   "Gerar Relatório".
// TODO(verso/excel): adicionar nova aba/planilha PTP + Limpeza no
//   template Excel FM09 quando a gestão for exportar a folha completa.
