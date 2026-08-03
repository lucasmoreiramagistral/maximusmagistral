import { supabase } from "@/integrations/supabase/client";
import { genVersoId } from "@/lib/verso/storage";
import { ConflitoVersaoError } from "@/lib/verso/supabase-storage";
import { HORA_X_HORA_FAIXAS, PRODUCAO_CONTEXTO_FIXO } from "./constants";
import { producaoHoraFromRow, producaoHoraToRow, type ProducaoHoraRow } from "./mappers";
import type { ProducaoHora, ProducaoHoraEdicaoPayload } from "./types";
import type { Turno } from "@/lib/checklist/types";

export { ConflitoVersaoError };

/**
 * Busca as horas lançadas de uma folha do dia.
 * Mesma regra do PTP: com `operadorUserId` filtra a folha do operador;
 * sem ele, devolve tudo (gestão/relatórios).
 */
export async function fetchProducaoHoras(
  folhaDiaKey: string,
  operadorUserId?: string | null,
): Promise<ProducaoHora[]> {
  let query = supabase
    .from("producao_horaria" as never)
    .select("*")
    .eq("folha_dia_key", folhaDiaKey)
    .order("updated_at", { ascending: false });
  if (operadorUserId) query = query.eq("operador_user_id", operadorUserId);

  const { data, error } = await query;
  if (error) {
    console.error("[fetchProducaoHoras] supabase error:", error);
    throw error;
  }
  return ((data ?? []) as unknown as ProducaoHoraRow[]).map(producaoHoraFromRow);
}

export async function upsertProducaoHora(
  h: ProducaoHora,
  opts: { expectedUpdatedAt?: string | null } = {},
): Promise<ProducaoHora> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  if (opts.expectedUpdatedAt !== undefined) {
    const { data: existing } = await supabase
      .from("producao_horaria" as never)
      .select("updated_at")
      .eq("id", h.id)
      .maybeSingle();
    const remoto = (existing as { updated_at?: string } | null)?.updated_at;
    if (remoto && remoto !== opts.expectedUpdatedAt) {
      throw new ConflitoVersaoError(opts.expectedUpdatedAt ?? undefined, remoto);
    }
  }

  const row = producaoHoraToRow(h, userId);
  const { data, error } = await supabase
    .from("producao_horaria" as never)
    .upsert(row as never, { onConflict: "id" })
    .select("*")
    .single();
  if (error) {
    console.error("[upsertProducaoHora] supabase error:", error);
    throw error;
  }
  return producaoHoraFromRow(data as unknown as ProducaoHoraRow);
}

export async function insertProducaoHoraEdicao(
  p: ProducaoHoraEdicaoPayload,
): Promise<void> {
  const { error } = await supabase.from("producao_horaria_edicoes" as never).insert({
    producao_horaria_id: p.producaoHorariaId,
    folha_dia_key: p.folhaDiaKey,
    hora_codigo: p.horaCodigo,
    editado_por_login: p.editadoPorLogin,
    editado_por_nome: p.editadoPorNome,
    motivo_edicao: p.motivoEdicao ?? null,
    antes_json: p.antesJson,
    depois_json: p.depoisJson,
  } as never);
  if (error) {
    console.error("[insertProducaoHoraEdicao] supabase error:", error);
    throw error;
  }
}

/**
 * Cria as 24 linhas horárias em branco do dia para um operador.
 * O id é determinístico (inclui o operador) para o upsert por `id` não
 * sobrescrever a folha de outro operador.
 */
export function createProducaoHorasPadrao(
  folhaDiaKey: string,
  dataOperacao: string,
  turno: Turno,
  operadorUserId?: string | null,
): ProducaoHora[] {
  const opSuffix = operadorUserId ? `-op:${operadorUserId}` : "";
  return HORA_X_HORA_FAIXAS.map((f) => ({
    id: genVersoId(`prod-${dataOperacao}-${f.codigo}${opSuffix}`),
    folhaDiaKey,
    dataOperacao,
    linha: PRODUCAO_CONTEXTO_FIXO.linha,
    area: PRODUCAO_CONTEXTO_FIXO.area,
    maquina: PRODUCAO_CONTEXTO_FIXO.maquina,
    equipamento: PRODUCAO_CONTEXTO_FIXO.equipamento,
    turno,
    horaCodigo: f.codigo,
    horaInicio: f.inicio,
    horaFim: f.fim,
    meta: null,
    quantidade: null,
    naoRodou: false,
    tempoParadaMin: null,
    reiniciaAcumulado: false,
    motivoReinicio: null,
    produtoSabor: null,
    produtoTamanho: null,
    observacao: null,
  }));
}
