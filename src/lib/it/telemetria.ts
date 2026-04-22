// ============================================================
// Tipos e helpers puros de telemetria de IT.
// Lado-cliente. Não depende do Supabase aqui (vai em supabase-analytics.ts).
// ============================================================

import { IT_DOC_KEY, type ItDocSlug } from "@/lib/it/types";

export type TipoEventoIt =
  | "it_open"
  | "it_close"
  | "page_view"
  | "page_leave"
  | "index_open"
  | "index_click"
  | "index_search"
  | "index_search_result_click"
  | "zoom_in"
  | "zoom_out"
  | "zoom_reset"
  | "image_retry"
  | "image_error"
  | "cache_mode"
  | "identidade_declarada"
  | "identidade_confirmada"
  | "identidade_trocada"
  | "identidade_trocada_servidor"
  | "identidade_expirada"
  | "heartbeat";

export type ModoCacheIt = "online" | "cache" | "offline";

export interface ContextoOperadorIt {
  user_id: string | null;
  operador_nome: string | null;
  perfil: string | null;
  equipe: string | null;
  turno: string | null;
  data_operacional: string | null;
}

export interface SessaoIt {
  id: string;
  documento: "it002" | "it005";
  rota: string;
  iniciado_em: string;
  contexto: ContextoOperadorIt;
}

export interface EventoIt {
  sessao_id: string;
  documento: "it002" | "it005";
  tipo_evento: TipoEventoIt;
  pagina?: number | null;
  pagina_destino?: number | null;
  tipo_entrada?: string | null;
  label?: string | null;
  numero?: string | null;
  termo_busca?: string | null;
  quantidade_resultados?: number | null;
  duracao_ms?: number | null;
  modo_cache?: ModoCacheIt | null;
  metadata_json?: Record<string, unknown> | null;
  contexto: ContextoOperadorIt;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────
// Helpers puros
// ─────────────────────────────────────────────────────────────────

export function slugParaDocumento(slug: ItDocSlug): "it002" | "it005" {
  return IT_DOC_KEY[slug] as "it002" | "it005";
}

export function gerarUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback p/ ambientes sem crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Sanitiza o termo de busca para telemetria.
 * - trim
 * - lowercase
 * - máximo 100 chars
 * - retorna null se < 2 chars úteis
 */
export function sanitizarTermoBusca(raw: string): string | null {
  if (!raw) return null;
  const limpo = raw.trim().toLowerCase().slice(0, 100);
  if (limpo.length < 2) return null;
  return limpo;
}

/**
 * Cria um debouncer simples para registro de buscas.
 * Retorna fn que recebe (termo, resultados, callback).
 */
export function criarDebouncerBusca(delayMs = 600) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ultimoTermoEnviado: string | null = null;

  return {
    agendar(
      termoRaw: string,
      quantidadeResultados: number,
      onFlush: (termo: string, qtd: number) => void,
    ) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const sanitizado = sanitizarTermoBusca(termoRaw);
        if (!sanitizado) return;
        if (sanitizado === ultimoTermoEnviado) return;
        ultimoTermoEnviado = sanitizado;
        onFlush(sanitizado, quantidadeResultados);
      }, delayMs);
    },
    cancelar() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    reset() {
      ultimoTermoEnviado = null;
    },
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}
