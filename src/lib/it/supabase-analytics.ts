// ============================================================
// Persistência de telemetria de IT no Supabase.
// Fire-and-forget: em caso de falha, enfileira na fila offline existente.
// Nunca lança erro pra cima — telemetria não pode quebrar UI.
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
}

function sessaoToRow(sessao: SessaoIt): InsertSessaoRow {
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
  };
}

function eventoToRow(evento: EventoIt): InsertEventoRow {
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
  };
}

/**
 * Insere a sessão (chamada ao abrir a IT).
 * Lança erro se falhar — quem chama decide o que fazer.
 */
export async function insertItSessao(sessao: SessaoIt): Promise<void> {
  // Cast pq tabela ainda pode não estar nos tipos gerados
  const { error } = await (supabase.from as any)("it_consulta_sessoes")
    .insert(sessaoToRow(sessao));
  if (error) throw error;
}

/**
 * Atualiza encerramento da sessão.
 */
export async function updateItSessaoFechamento(
  sessaoId: string,
  duracaoTotalMs: number,
): Promise<void> {
  // Idempotente: só fecha se ainda não foi fechada (evita race entre
  // visibilitychange + pagehide + beforeunload + cleanup + sendBeacon)
  const { error } = await (supabase.from as any)("it_consulta_sessoes")
    .update({
      encerrado_em: new Date().toISOString(),
      duracao_total_ms: duracaoTotalMs,
    })
    .eq("id", sessaoId)
    .is("encerrado_em", null);
  if (error) throw error;
}

/**
 * Insere um evento individual.
 */
export async function insertItEvento(evento: EventoIt): Promise<void> {
  const { error } = await (supabase.from as any)("it_consulta_eventos")
    .insert(eventoToRow(evento));
  if (error) throw error;
}
