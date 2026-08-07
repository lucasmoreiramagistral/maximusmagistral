import { supabase } from "@/integrations/supabase/client";
import { genVersoId } from "@/lib/verso/storage";
import { ConflitoVersaoError } from "@/lib/verso/supabase-storage";
import { PRODUCAO_CONTEXTO_FIXO } from "./constants";
import {
  criarEtapasCipVazias,
  criarMarcacoesApoioVazias,
  criarTrocasAssepsiaVazias,
} from "./apoio-constants";
import type {
  ApoioMarcacao,
  AssepsiaTroca,
  CipEtapa,
  ProducaoApoio,
} from "./apoio-types";
import type { AssinaturaDigital, Turno } from "@/lib/checklist/types";

export { ConflitoVersaoError };

interface ProducaoApoioRow {
  id: string;
  folha_dia_key: string;
  data_operacao: string;
  linha: string;
  area: string;
  maquina: string;
  equipamento: string | null;
  turno: Turno;
  checklist_json: ApoioMarcacao[] | null;
  assepsia_json: AssepsiaTroca[] | null;
  cip_json: CipEtapa[] | null;
  cip_observacao: string | null;
  assinatura_operador_cip: AssinaturaDigital | null;
  assinatura_cq: AssinaturaDigital | null;
  cq_horario: string | null;
  operador_login: string | null;
  operador_nome: string | null;
  operador_user_id: string | null;
  ultima_edicao_por_login: string | null;
  ultima_edicao_por_nome: string | null;
  updated_at?: string;
}

function fromRow(r: ProducaoApoioRow): ProducaoApoio {
  return {
    id: r.id,
    folhaDiaKey: r.folha_dia_key,
    dataOperacao: r.data_operacao,
    linha: r.linha,
    area: r.area,
    maquina: r.maquina,
    equipamento: r.equipamento ?? "",
    turno: r.turno,
    checklist: r.checklist_json?.length ? r.checklist_json : criarMarcacoesApoioVazias(),
    assepsia: r.assepsia_json?.length ? r.assepsia_json : criarTrocasAssepsiaVazias(),
    cip: r.cip_json?.length ? r.cip_json : criarEtapasCipVazias(),
    cipObservacao: r.cip_observacao,
    assinaturaOperadorCip: r.assinatura_operador_cip,
    assinaturaCq: r.assinatura_cq,
    cqHorario: r.cq_horario,
    operadorLogin: r.operador_login,
    operadorNome: r.operador_nome,
    operadorUserId: r.operador_user_id,
    ultimaEdicaoPorLogin: r.ultima_edicao_por_login,
    ultimaEdicaoPorNome: r.ultima_edicao_por_nome,
    updatedAt: r.updated_at,
  };
}

function toRow(a: ProducaoApoio, userId: string | null) {
  return {
    id: a.id,
    folha_dia_key: a.folhaDiaKey,
    data_operacao: a.dataOperacao,
    linha: a.linha,
    area: a.area,
    maquina: a.maquina,
    equipamento: a.equipamento || null,
    turno: a.turno,
    checklist_json: a.checklist,
    assepsia_json: a.assepsia,
    cip_json: a.cip,
    cip_observacao: a.cipObservacao,
    assinatura_operador_cip: a.assinaturaOperadorCip,
    assinatura_cq: a.assinaturaCq,
    cq_horario: a.cqHorario,
    operador_login: a.operadorLogin ?? null,
    operador_nome: a.operadorNome ?? null,
    operador_user_id: a.operadorUserId ?? userId,
    ultima_edicao_por_login: a.ultimaEdicaoPorLogin ?? null,
    ultima_edicao_por_nome: a.ultimaEdicaoPorNome ?? null,
  };
}

/** Id determinístico por folha do dia + turno + operador. */
export function apoioId(
  dataOperacao: string,
  turno: Turno,
  operadorUserId?: string | null,
): string {
  return genVersoId(
    `apoio-${dataOperacao}-${turno}${operadorUserId ? `-op:${operadorUserId}` : ""}`,
  );
}

export function createProducaoApoioPadrao(
  folhaDiaKey: string,
  dataOperacao: string,
  turno: Turno,
  operadorUserId?: string | null,
): ProducaoApoio {
  return {
    id: apoioId(dataOperacao, turno, operadorUserId),
    folhaDiaKey,
    dataOperacao,
    linha: PRODUCAO_CONTEXTO_FIXO.linha,
    area: PRODUCAO_CONTEXTO_FIXO.area,
    maquina: PRODUCAO_CONTEXTO_FIXO.maquina,
    equipamento: PRODUCAO_CONTEXTO_FIXO.equipamento,
    turno,
    checklist: criarMarcacoesApoioVazias(),
    assepsia: criarTrocasAssepsiaVazias(),
    cip: criarEtapasCipVazias(),
    cipObservacao: null,
    assinaturaOperadorCip: null,
    assinaturaCq: null,
    cqHorario: null,
    operadorUserId: operadorUserId ?? null,
  };
}

/**
 * Busca os blocos de apoio de uma folha do dia.
 * Com `operadorUserId`, filtra só o registro do operador (tela do operador);
 * sem ele, devolve todos os turnos (gestão/relatórios).
 */
export async function fetchProducaoApoio(
  folhaDiaKey: string,
  operadorUserId?: string | null,
): Promise<ProducaoApoio[]> {
  let query = supabase
    .from("producao_apoio" as never)
    .select("*")
    .eq("folha_dia_key", folhaDiaKey)
    .order("updated_at", { ascending: false });
  if (operadorUserId) query = query.eq("operador_user_id", operadorUserId);

  const { data, error } = await query;
  if (error) {
    console.error("[fetchProducaoApoio] supabase error:", error);
    throw error;
  }
  return ((data ?? []) as unknown as ProducaoApoioRow[]).map(fromRow);
}

export async function upsertProducaoApoio(
  a: ProducaoApoio,
  opts: { expectedUpdatedAt?: string | null } = {},
): Promise<ProducaoApoio> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  if (opts.expectedUpdatedAt !== undefined) {
    const { data: existing } = await supabase
      .from("producao_apoio" as never)
      .select("updated_at")
      .eq("id", a.id)
      .maybeSingle();
    const remoto = (existing as { updated_at?: string } | null)?.updated_at;
    if (remoto && opts.expectedUpdatedAt && remoto !== opts.expectedUpdatedAt) {
      throw new ConflitoVersaoError(opts.expectedUpdatedAt, remoto);
    }
  }

  const { data, error } = await supabase
    .from("producao_apoio" as never)
    .upsert(toRow(a, userId) as never, { onConflict: "id" })
    .select("*")
    .single();
  if (error) {
    console.error("[upsertProducaoApoio] supabase error:", error);
    throw error;
  }
  return fromRow(data as unknown as ProducaoApoioRow);
}
