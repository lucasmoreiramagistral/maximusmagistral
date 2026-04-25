// ============================================================
// Validação e logging de integridade da telemetria de IT.
//
// Objetivo: garantir que toda sessão/evento gravado em
// `it_consulta_sessoes` / `it_consulta_eventos` carregue `user_id`
// (= `auth.users.id` = `profiles.id`) sempre que houver usuário
// autenticado. Sem isso, a Inteligência das ITs (gestao/it-analytics)
// perde precisão na agregação por operador.
//
// Estratégia:
// 1. Função `validarContextoTelemetria(contexto, origem)` -> retorna
//    diagnóstico (ok/warn/erro). NUNCA lança — telemetria não pode
//    quebrar UI.
// 2. Logging via `console.warn` com prefixo `[it-telemetria]` para
//    aparecer em devtools e em capturas de log do dev-server.
// 3. Buffer leve em memória (últimas 50 violações) acessível via
//    `obterDiagnosticosTelemetria()` para debug em /gestao.
// 4. Helper `temUserIdValido()` para callers (use-it-telemetria,
//    supabase-analytics) decidirem se devem persistir, enfileirar
//    ou apenas descartar.
// ============================================================

import type { ContextoOperadorIt } from "@/lib/it/telemetria";

export type NivelDiagnosticoTelemetria = "ok" | "warn" | "erro";

export interface DiagnosticoTelemetria {
  nivel: NivelDiagnosticoTelemetria;
  origem: string; // ex.: "insertItSessao", "insertItEvento", "abrir-sessao"
  motivo: string;
  contexto_resumo: {
    user_id: string | null;
    operador_nome: string | null;
    perfil: string | null;
  };
  timestamp: string;
}

const BUFFER_MAX = 50;
const buffer: DiagnosticoTelemetria[] = [];

function push(diag: DiagnosticoTelemetria) {
  buffer.push(diag);
  if (buffer.length > BUFFER_MAX) buffer.shift();
}

/**
 * UUID v4-ish guard. Não valida formato exato; apenas garante que é
 * uma string razoável para `user_id` (não vazia, com hífens).
 */
function pareceUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length >= 32 &&
    v.length <= 64 &&
    /[0-9a-f-]{32,}/i.test(v)
  );
}

export function temUserIdValido(contexto: ContextoOperadorIt | null): boolean {
  if (!contexto) return false;
  return pareceUuid(contexto.user_id);
}

/**
 * Valida o contexto antes de persistir uma sessão ou evento.
 * Sempre retorna um diagnóstico — nunca lança.
 *
 * Regra: se há `operador_nome` mas falta `user_id`, é uma
 * inconsistência grave (o login deveria ter populado ambos).
 */
export function validarContextoTelemetria(
  contexto: ContextoOperadorIt | null,
  origem: string,
): DiagnosticoTelemetria {
  const resumo = {
    user_id: contexto?.user_id ?? null,
    operador_nome: contexto?.operador_nome ?? null,
    perfil: contexto?.perfil ?? null,
  };

  if (!contexto) {
    const diag: DiagnosticoTelemetria = {
      nivel: "erro",
      origem,
      motivo: "contexto ausente",
      contexto_resumo: resumo,
      timestamp: new Date().toISOString(),
    };
    push(diag);
    if (typeof console !== "undefined") {
      console.warn(`[it-telemetria][${origem}] contexto ausente`);
    }
    return diag;
  }

  if (!pareceUuid(contexto.user_id)) {
    // Se há nome mas não há user_id => bug: usuário logado deveria ter id.
    const grave = !!contexto.operador_nome;
    const diag: DiagnosticoTelemetria = {
      nivel: grave ? "erro" : "warn",
      origem,
      motivo: grave
        ? "operador_nome presente sem user_id (login inconsistente)"
        : "sem user_id e sem operador_nome (provavelmente pré-login)",
      contexto_resumo: resumo,
      timestamp: new Date().toISOString(),
    };
    push(diag);
    if (typeof console !== "undefined") {
      const fn = grave ? console.error : console.warn;
      fn(
        `[it-telemetria][${origem}] ${diag.motivo}`,
        resumo,
      );
    }
    return diag;
  }

  return {
    nivel: "ok",
    origem,
    motivo: "ok",
    contexto_resumo: resumo,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Snapshot dos últimos diagnósticos (uso: debug em /gestao ou testes).
 * Retorna cópia para evitar mutação externa.
 */
export function obterDiagnosticosTelemetria(): DiagnosticoTelemetria[] {
  return buffer.slice();
}

/** Limpa o buffer — útil em testes. */
export function limparDiagnosticosTelemetria(): void {
  buffer.length = 0;
}
