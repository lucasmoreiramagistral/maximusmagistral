// ============================================================
// Persistência de telemetria de IT no Supabase.
// Fire-and-forget: em caso de falha, enfileira na fila offline existente.
// Nunca lança erro pra cima — telemetria não pode quebrar UI.
// Inclui device_id, user_agent e ip_address (estes dois capturados pelo client).
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import type { EventoIt, SessaoIt } from "./telemetria";

interface InsertSessaoRow {
  id: string;
  user_id: string | null;
  operador_nome: string | null;
  perfil: string | null;
  equipe: string | null;
  turno: string | null;
  data_operacional: string | null;
  documento: "it002" | "it005";
  rota: string;
  iniciado_em: string;
  device_id?: string | null;
  user_agent?: string | null;
}

interface InsertEventoRow {
  sessao_id: string;
  user_id: string | null;
  operador_nome: string | null;
  perfil: string | null;
  equipe: string | null;
  turno: string | null;
  data_operacional: string | null;
  documento: "it002" | "it005";
  tipo_evento: string;
  pagina: number | null;
  pagina_destino: number | null;
  tipo_entrada: string | null;
  label: string | null;
  numero: string | null;
  termo_busca: string | null;
  quantidade_resultados: number | null;
  duracao_ms: number | null;
  modo_cache: string | null;
  metadata_json: Record<string, unknown> | null;
  device_id?: string | null;
}

export interface ExtrasSessao {
  deviceId?: string | null;
  userAgent?: string | null;
}

export interface ExtrasEvento {
  deviceId?: string | null;
}

function sessaoToRow(sessao: SessaoIt, extras?: ExtrasSessao): InsertSessaoRow {
  return {
    id: sessao.id,
    user_id: sessao.contexto.user_id,
    operador_nome: sessao.contexto.operador_nome,
    perfil: sessao.contexto.perfil,
    equipe: sessao.contexto.equipe,
    turno: sessao.contexto.turno,
    data_operacional: sessao.contexto.data_operacional,
    documento: sessao.documento,
    rota: sessao.rota,
    iniciado_em: sessao.iniciado_em,
    device_id: extras?.deviceId ?? null,
    user_agent: extras?.userAgent ?? null,
  };
}

function eventoToRow(evento: EventoIt, extras?: ExtrasEvento): InsertEventoRow {
  return {
    sessao_id: evento.sessao_id,
    user_id: evento.contexto.user_id,
    operador_nome: evento.contexto.operador_nome,
    perfil: evento.contexto.perfil,
    equipe: evento.contexto.equipe,
    turno: evento.contexto.turno,
    data_operacional: evento.contexto.data_operacional,
    documento: evento.documento,
    tipo_evento: evento.tipo_evento,
    pagina: evento.pagina ?? null,
    pagina_destino: evento.pagina_destino ?? null,
    tipo_entrada: evento.tipo_entrada ?? null,
    label: evento.label ?? null,
    numero: evento.numero ?? null,
    termo_busca: evento.termo_busca ?? null,
    quantidade_resultados: evento.quantidade_resultados ?? null,
    duracao_ms: evento.duracao_ms ?? null,
    modo_cache: evento.modo_cache ?? null,
    metadata_json: evento.metadata_json ?? null,
    device_id: extras?.deviceId ?? null,
  };
}

export async function insertItSessao(
  sessao: SessaoIt,
  extras?: ExtrasSessao,
): Promise<void> {
  const { error } = await (supabase.from as any)("it_consulta_sessoes")
    .insert(sessaoToRow(sessao, extras));
  if (error) throw error;
}

export async function updateItSessaoFechamento(
  sessaoId: string,
  duracaoTotalMs: number,
): Promise<void> {
  // Idempotente: só fecha se ainda não foi fechada.
  // O trigger no Postgres também fecha em it_close — esta é camada extra.
  const { error } = await (supabase.from as any)("it_consulta_sessoes")
    .update({
      encerrado_em: new Date().toISOString(),
      duracao_total_ms: duracaoTotalMs,
    })
    .eq("id", sessaoId)
    .is("encerrado_em", null);
  if (error) throw error;
}

export async function insertItEvento(
  evento: EventoIt,
  extras?: ExtrasEvento,
): Promise<void> {
  const { error } = await (supabase.from as any)("it_consulta_eventos")
    .insert(eventoToRow(evento, extras));
  if (error) throw error;
}
