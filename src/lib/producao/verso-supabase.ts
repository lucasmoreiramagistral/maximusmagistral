import { supabase } from "@/integrations/supabase/client";
import { genVersoId } from "@/lib/verso/storage";
import { ConflitoVersaoError } from "@/lib/verso/supabase-storage";
import { PRODUCAO_CONTEXTO_FIXO } from "./constants";
import { TANQUES_ORDENS } from "./verso-constants";
import type {
  PassagemBloco,
  ProducaoPassagem,
  ProducaoTanque,
} from "./verso-types";
import type { AssinaturaDigital, Turno } from "@/lib/checklist/types";

export { ConflitoVersaoError };

// ─── Tanques ─────────────────────────────────────────────────────────
interface TanqueRow {
  id: string;
  folha_dia_key: string;
  data_operacao: string;
  linha: string;
  area: string;
  maquina: string;
  equipamento: string | null;
  turno: Turno;
  ordem: number;
  sabor: string | null;
  tamanho: string | null;
  numero_tanque: string | null;
  lote: string | null;
  qtd_inicial_litros: number | string | null;
  qtd_final_litros: number | string | null;
  hora_inicio: string | null;
  hora_termino: string | null;
  observacao: string | null;
  operador_login: string | null;
  operador_nome: string | null;
  operador_user_id: string | null;
  ultima_edicao_por_login: string | null;
  ultima_edicao_por_nome: string | null;
  updated_at?: string;
}

function num(v: number | string | null): number | null {
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function tanqueFromRow(r: TanqueRow): ProducaoTanque {
  return {
    id: r.id,
    folhaDiaKey: r.folha_dia_key,
    dataOperacao: r.data_operacao,
    linha: r.linha,
    area: r.area,
    maquina: r.maquina,
    equipamento: r.equipamento ?? "",
    turno: r.turno,
    ordem: r.ordem,
    sabor: r.sabor,
    tamanho: r.tamanho,
    numeroTanque: r.numero_tanque,
    lote: r.lote,
    qtdInicialLitros: num(r.qtd_inicial_litros),
    qtdFinalLitros: num(r.qtd_final_litros),
    horaInicio: r.hora_inicio,
    horaTermino: r.hora_termino,
    observacao: r.observacao,
    operadorLogin: r.operador_login,
    operadorNome: r.operador_nome,
    operadorUserId: r.operador_user_id,
    ultimaEdicaoPorLogin: r.ultima_edicao_por_login,
    ultimaEdicaoPorNome: r.ultima_edicao_por_nome,
    updatedAt: r.updated_at,
  };
}

function tanqueToRow(t: ProducaoTanque, userId: string | null) {
  return {
    id: t.id,
    folha_dia_key: t.folhaDiaKey,
    data_operacao: t.dataOperacao,
    linha: t.linha,
    area: t.area,
    maquina: t.maquina,
    equipamento: t.equipamento || null,
    turno: t.turno,
    ordem: t.ordem,
    sabor: t.sabor,
    tamanho: t.tamanho,
    numero_tanque: t.numeroTanque,
    lote: t.lote,
    qtd_inicial_litros: t.qtdInicialLitros,
    qtd_final_litros: t.qtdFinalLitros,
    hora_inicio: t.horaInicio,
    hora_termino: t.horaTermino,
    observacao: t.observacao,
    operador_login: t.operadorLogin ?? null,
    operador_nome: t.operadorNome ?? null,
    operador_user_id: t.operadorUserId ?? userId,
    ultima_edicao_por_login: t.ultimaEdicaoPorLogin ?? null,
    ultima_edicao_por_nome: t.ultimaEdicaoPorNome ?? null,
  };
}

export function tanqueId(
  dataOperacao: string,
  ordem: number,
  operadorUserId?: string | null,
): string {
  return genVersoId(
    `tanque-${dataOperacao}-${ordem}${operadorUserId ? `-op:${operadorUserId}` : ""}`,
  );
}

export function createTanquesPadrao(
  folhaDiaKey: string,
  dataOperacao: string,
  turno: Turno,
  operadorUserId?: string | null,
): ProducaoTanque[] {
  return TANQUES_ORDENS.map((ordem) => ({
    id: tanqueId(dataOperacao, ordem, operadorUserId),
    folhaDiaKey,
    dataOperacao,
    linha: PRODUCAO_CONTEXTO_FIXO.linha,
    area: PRODUCAO_CONTEXTO_FIXO.area,
    maquina: PRODUCAO_CONTEXTO_FIXO.maquina,
    equipamento: PRODUCAO_CONTEXTO_FIXO.equipamento,
    turno,
    ordem,
    sabor: null,
    tamanho: null,
    numeroTanque: null,
    lote: null,
    qtdInicialLitros: null,
    qtdFinalLitros: null,
    horaInicio: null,
    horaTermino: null,
    observacao: null,
    operadorUserId: operadorUserId ?? null,
  }));
}

export async function fetchProducaoTanques(
  folhaDiaKey: string,
  operadorUserId?: string | null,
): Promise<ProducaoTanque[]> {
  let query = supabase
    .from("producao_tanques" as never)
    .select("*")
    .eq("folha_dia_key", folhaDiaKey)
    .order("ordem", { ascending: true });
  if (operadorUserId) query = query.eq("operador_user_id", operadorUserId);

  const { data, error } = await query;
  if (error) {
    console.error("[fetchProducaoTanques] supabase error:", error);
    throw error;
  }
  return ((data ?? []) as unknown as TanqueRow[]).map(tanqueFromRow);
}

export async function upsertProducaoTanque(
  t: ProducaoTanque,
  opts: { expectedUpdatedAt?: string | null } = {},
): Promise<ProducaoTanque> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  if (opts.expectedUpdatedAt) {
    const { data: existing } = await supabase
      .from("producao_tanques" as never)
      .select("updated_at")
      .eq("id", t.id)
      .maybeSingle();
    const remoto = (existing as { updated_at?: string } | null)?.updated_at;
    if (remoto && remoto !== opts.expectedUpdatedAt) {
      throw new ConflitoVersaoError(opts.expectedUpdatedAt, remoto);
    }
  }

  const { data, error } = await supabase
    .from("producao_tanques" as never)
    .upsert(tanqueToRow(t, userId) as never, { onConflict: "id" })
    .select("*")
    .single();
  if (error) {
    console.error("[upsertProducaoTanque] supabase error:", error);
    throw error;
  }
  return tanqueFromRow(data as unknown as TanqueRow);
}

// ─── Passagem de turno ───────────────────────────────────────────────
interface PassagemRow {
  id: string;
  folha_dia_key: string;
  data_operacao: string;
  linha: string;
  area: string;
  maquina: string;
  equipamento: string | null;
  turno: Turno;
  bloco: PassagemBloco;
  ocorrencias: string | null;
  assinatura_operador: AssinaturaDigital | null;
  lider_nome: string | null;
  assinatura_lider: AssinaturaDigital | null;
  operador_login: string | null;
  operador_nome: string | null;
  operador_user_id: string | null;
  ultima_edicao_por_login: string | null;
  ultima_edicao_por_nome: string | null;
  updated_at?: string;
}

function passagemFromRow(r: PassagemRow): ProducaoPassagem {
  return {
    id: r.id,
    folhaDiaKey: r.folha_dia_key,
    dataOperacao: r.data_operacao,
    linha: r.linha,
    area: r.area,
    maquina: r.maquina,
    equipamento: r.equipamento ?? "",
    turno: r.turno,
    bloco: r.bloco,
    ocorrencias: r.ocorrencias,
    assinaturaOperador: r.assinatura_operador,
    liderNome: r.lider_nome,
    assinaturaLider: r.assinatura_lider,
    operadorLogin: r.operador_login,
    operadorNome: r.operador_nome,
    operadorUserId: r.operador_user_id,
    ultimaEdicaoPorLogin: r.ultima_edicao_por_login,
    ultimaEdicaoPorNome: r.ultima_edicao_por_nome,
    updatedAt: r.updated_at,
  };
}

function passagemToRow(p: ProducaoPassagem, userId: string | null) {
  return {
    id: p.id,
    folha_dia_key: p.folhaDiaKey,
    data_operacao: p.dataOperacao,
    linha: p.linha,
    area: p.area,
    maquina: p.maquina,
    equipamento: p.equipamento || null,
    turno: p.turno,
    bloco: p.bloco,
    ocorrencias: p.ocorrencias,
    assinatura_operador: p.assinaturaOperador,
    operador_assinou_em: p.assinaturaOperador?.assinadoEm ?? null,
    lider_nome: p.liderNome,
    assinatura_lider: p.assinaturaLider,
    lider_assinou_em: p.assinaturaLider?.assinadoEm ?? null,
    operador_login: p.operadorLogin ?? null,
    operador_nome: p.operadorNome ?? null,
    operador_user_id: p.operadorUserId ?? userId,
    ultima_edicao_por_login: p.ultimaEdicaoPorLogin ?? null,
    ultima_edicao_por_nome: p.ultimaEdicaoPorNome ?? null,
  };
}

export function passagemId(
  dataOperacao: string,
  bloco: PassagemBloco,
  operadorUserId?: string | null,
): string {
  return genVersoId(
    `passagem-${dataOperacao}-${bloco}${operadorUserId ? `-op:${operadorUserId}` : ""}`,
  );
}

export function createPassagemPadrao(
  folhaDiaKey: string,
  dataOperacao: string,
  turno: Turno,
  bloco: PassagemBloco,
  operadorUserId?: string | null,
): ProducaoPassagem {
  return {
    id: passagemId(dataOperacao, bloco, operadorUserId),
    folhaDiaKey,
    dataOperacao,
    linha: PRODUCAO_CONTEXTO_FIXO.linha,
    area: PRODUCAO_CONTEXTO_FIXO.area,
    maquina: PRODUCAO_CONTEXTO_FIXO.maquina,
    equipamento: PRODUCAO_CONTEXTO_FIXO.equipamento,
    turno,
    bloco,
    ocorrencias: null,
    assinaturaOperador: null,
    liderNome: null,
    assinaturaLider: null,
    operadorUserId: operadorUserId ?? null,
  };
}

export async function fetchProducaoPassagens(
  folhaDiaKey: string,
  operadorUserId?: string | null,
): Promise<ProducaoPassagem[]> {
  let query = supabase
    .from("producao_passagem_turno" as never)
    .select("*")
    .eq("folha_dia_key", folhaDiaKey)
    .order("updated_at", { ascending: false });
  if (operadorUserId) query = query.eq("operador_user_id", operadorUserId);

  const { data, error } = await query;
  if (error) {
    console.error("[fetchProducaoPassagens] supabase error:", error);
    throw error;
  }
  return ((data ?? []) as unknown as PassagemRow[]).map(passagemFromRow);
}

export async function upsertProducaoPassagem(
  p: ProducaoPassagem,
  opts: { expectedUpdatedAt?: string | null } = {},
): Promise<ProducaoPassagem> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  if (opts.expectedUpdatedAt) {
    const { data: existing } = await supabase
      .from("producao_passagem_turno" as never)
      .select("updated_at")
      .eq("id", p.id)
      .maybeSingle();
    const remoto = (existing as { updated_at?: string } | null)?.updated_at;
    if (remoto && remoto !== opts.expectedUpdatedAt) {
      throw new ConflitoVersaoError(opts.expectedUpdatedAt, remoto);
    }
  }

  const { data, error } = await supabase
    .from("producao_passagem_turno" as never)
    .upsert(passagemToRow(p, userId) as never, { onConflict: "id" })
    .select("*")
    .single();
  if (error) {
    console.error("[upsertProducaoPassagem] supabase error:", error);
    throw error;
  }
  return passagemFromRow(data as unknown as PassagemRow);
}
