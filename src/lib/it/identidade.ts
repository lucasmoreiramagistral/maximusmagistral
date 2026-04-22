// ============================================================
// Identidade do operador para telemetria de IT.
// - device_id estável por aparelho (UUID em localStorage)
// - canonização de nome (espelha public.canonizar_nome_operador no banco)
// - persistência da identidade declarada por device
// - decisão de modo (completo / leve / nada)
// - heartbeat persistido pra detectar inatividade entre sessões
// ============================================================

import { gerarUuid } from "@/lib/it/telemetria";

// ─── Chaves de storage ───
const KEY_DEVICE_ID = "it-device-id:v1";
const KEY_IDENTIDADE = "it-operador-device:v1";
const KEY_HEARTBEAT = "it-ultimo-heartbeat:v1";

// ─── Bypass master ───
// Nome canônico que libera acesso irrestrito às IT sem ata, sem telemetria
// e sem aparecer em dashboards. Uso interno (auditoria/dono).
export const NOME_BYPASS_CANONICO = "MAGISTRAL";

/** True se a identidade informada é o acesso master (não rastreado). */
export function isIdentidadeBypass(
  nomeCanonico: string | null | undefined,
): boolean {
  if (!nomeCanonico) return false;
  return nomeCanonico.trim().toUpperCase() === NOME_BYPASS_CANONICO;
}

// Janelas de decisão
export const JANELA_LEVE_MS = 4 * 60 * 60 * 1000; // 4h: dentro disso, modo leve
export const JANELA_EXPIRA_MS = 12 * 60 * 60 * 1000; // 12h: força modo completo
export const INATIVIDADE_LEVE_MS = 30 * 60 * 1000; // 30min: força confirmação leve

// Validação de nome completo: ≥2 grupos de ≥2 letras
// Aceita letras Unicode (acentos), apóstrofo, hífen, espaço.
export const REGEX_NOME_COMPLETO =
  /^[\p{L}\p{M}]{2,}(?:[\s'’-][\p{L}\p{M}]{2,})+$/u;

export interface IdentidadeOperadorDevice {
  userId: string | null;
  nomeCompleto: string;
  nomeCanonico: string;
  confirmadoEm: string; // ISO
  ultimoUso: string; // ISO
}

export type ModoIdentidade = "completo" | "leve" | "nao";

// ─────────────────────────────────────────────────────────────
// device_id
// ─────────────────────────────────────────────────────────────

export function obterOuCriarDeviceId(): string {
  if (typeof window === "undefined") return "ssr-no-device";
  try {
    const existente = window.localStorage.getItem(KEY_DEVICE_ID);
    if (existente && existente.length > 0) return existente;
    const novo = gerarUuid();
    window.localStorage.setItem(KEY_DEVICE_ID, novo);
    return novo;
  } catch {
    return "no-storage-device";
  }
}

// ─────────────────────────────────────────────────────────────
// Canonização (espelho exato da função SQL)
// trim → colapsa espaços → remove acentos NFD → uppercase
// ─────────────────────────────────────────────────────────────

export function canonizarNomeOperador(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const semAcentos = trimmed.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const colapsado = semAcentos.replace(/\s+/g, " ");
  return colapsado.toUpperCase();
}

// ─────────────────────────────────────────────────────────────
// Persistência da identidade declarada
// ─────────────────────────────────────────────────────────────

export function lerIdentidadeDevice(): IdentidadeOperadorDevice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY_IDENTIDADE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IdentidadeOperadorDevice;
    if (!parsed?.nomeCanonico) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function salvarIdentidadeDevice(
  ident: IdentidadeOperadorDevice,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_IDENTIDADE, JSON.stringify(ident));
  } catch {
    /* ignore */
  }
}

export function limparIdentidadeDevice(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY_IDENTIDADE);
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────────────────────────────────────
// Heartbeat persistido (entre montagens)
// ─────────────────────────────────────────────────────────────

export function registrarUltimoHeartbeat(ts: number = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_HEARTBEAT, String(ts));
  } catch {
    /* ignore */
  }
}

export function lerUltimoHeartbeat(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY_HEARTBEAT);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Decisão de modo
// ─────────────────────────────────────────────────────────────

export function decidirModoIdentidade(
  ident: IdentidadeOperadorDevice | null,
  userIdAtual: string | null,
  agora: number = Date.now(),
): ModoIdentidade {
  if (!ident) return "completo";

  // userId mudou → outra conta auth no mesmo device → completo
  if (userIdAtual && ident.userId && ident.userId !== userIdAtual) {
    return "completo";
  }

  const confirmadoMs = Date.parse(ident.confirmadoEm);
  if (!Number.isFinite(confirmadoMs)) return "completo";

  const desdeConfirmacao = agora - confirmadoMs;

  // > 12h → expirou, força completo
  if (desdeConfirmacao > JANELA_EXPIRA_MS) return "completo";

  // Inatividade longa → ao menos pede leve
  const lastHb = lerUltimoHeartbeat();
  if (lastHb != null && agora - lastHb > INATIVIDADE_LEVE_MS) {
    return "leve";
  }

  // Dentro da janela leve (≤4h) e sem inatividade → ainda assim mostra leve
  // na primeira abertura nova após persistir, garantindo confirmação rápida.
  if (desdeConfirmacao <= JANELA_LEVE_MS) return "leve";

  // Entre 4h-12h → leve com confirmação explícita
  return "leve";
}

// ─────────────────────────────────────────────────────────────
// Helper: monta payload de identidade pronto pra telemetria
// ─────────────────────────────────────────────────────────────

export interface IdentidadeConfirmada {
  nomeCompleto: string;
  nomeCanonico: string;
  deviceId: string;
}

export function montarIdentidadeConfirmada(
  nomeCompleto: string,
): IdentidadeConfirmada {
  const nome = nomeCompleto.trim().replace(/\s+/g, " ");
  return {
    nomeCompleto: nome,
    nomeCanonico: canonizarNomeOperador(nome),
    deviceId: obterOuCriarDeviceId(),
  };
}
