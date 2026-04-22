import type { LimpezaTurno, PtpJanela } from "./types";

// Storage local específico do verso — separado do rascunho do checklist.
const KEYS = {
  ptp: "fm-verso:ptp-janelas",
  limpeza: "fm-verso:limpeza-turnos",
};

function isBrowser() {
  return typeof window !== "undefined";
}

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("fm-verso-storage", { detail: { key } }));
  } catch {
    /* ignore */
  }
}

// PTP ────────────────────────────────────────────────────────────────
export const versoStorage = {
  KEYS,

  getPtpJanelas(folhaDiaKey: string): PtpJanela[] {
    const all = read<Record<string, PtpJanela[]>>(KEYS.ptp, {});
    return all[folhaDiaKey] ?? [];
  },
  savePtpJanela(j: PtpJanela) {
    const all = read<Record<string, PtpJanela[]>>(KEYS.ptp, {});
    const list = all[j.folhaDiaKey] ?? [];
    const idx = list.findIndex((x) => x.janelaCodigo === j.janelaCodigo);
    if (idx >= 0) list[idx] = j;
    else list.push(j);
    all[j.folhaDiaKey] = list;
    write(KEYS.ptp, all);
  },
  bulkSetPtpJanelas(folhaDiaKey: string, list: PtpJanela[]) {
    const all = read<Record<string, PtpJanela[]>>(KEYS.ptp, {});
    all[folhaDiaKey] = list;
    write(KEYS.ptp, all);
  },

  // Limpeza ──────────────────────────────────────────────────────────
  getLimpezaTurnos(folhaDiaKey: string): LimpezaTurno[] {
    const all = read<Record<string, LimpezaTurno[]>>(KEYS.limpeza, {});
    return all[folhaDiaKey] ?? [];
  },
  saveLimpezaTurno(t: LimpezaTurno) {
    const all = read<Record<string, LimpezaTurno[]>>(KEYS.limpeza, {});
    const list = all[t.folhaDiaKey] ?? [];
    const idx = list.findIndex((x) => x.turno === t.turno);
    if (idx >= 0) list[idx] = t;
    else list.push(t);
    all[t.folhaDiaKey] = list;
    write(KEYS.limpeza, all);
  },
  bulkSetLimpezaTurnos(folhaDiaKey: string, list: LimpezaTurno[]) {
    const all = read<Record<string, LimpezaTurno[]>>(KEYS.limpeza, {});
    all[folhaDiaKey] = list;
    write(KEYS.limpeza, all);
  },
};

/**
 * ID **determinístico** baseado no prefixo lógico do registro.
 *
 * IMPORTANTE: dois clientes diferentes (ex.: operador A e B abrindo a mesma
 * janela ao mesmo tempo, possivelmente offline) DEVEM gerar o MESMO id, senão
 * o upsert por `id` no Postgres cria registros duplicados para a mesma
 * (folha_dia_key, janela_codigo) ou (folha_dia_key, turno).
 *
 * Implementação: UUID v5-like a partir de SHA-1 estável do prefixo, encaixado
 * no formato uuid (8-4-4-4-12) que o Postgres aceita como PK uuid.
 *
 * Para o PTP, chamar com prefix = `ptp-${dataOperacao}-${codigoJanela}` (já feito
 * em createPtpJanelasPadrao). Para limpeza, prefix = `limp-${dataOperacao}-${turno}`.
 * Esses dois identificam unicamente o registro do dia no domínio do verso.
 */
export function genVersoId(prefix: string): string {
  // FNV-1a 64-bit em duas metades para gerar 32 hex chars determinísticos.
  // Não é criptográfico — não precisa ser. Precisa só ser ESTÁVEL e ÚNICO no domínio.
  let h1 = 0xcbf29ce4;
  let h2 = 0x84222325;
  for (let i = 0; i < prefix.length; i++) {
    const c = prefix.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c;
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  // Mistura adicional para descorrelacionar h1/h2.
  h1 = Math.imul(h1 ^ (h2 >>> 13), 0x85ebca6b) >>> 0;
  h2 = Math.imul(h2 ^ (h1 >>> 16), 0xc2b2ae35) >>> 0;
  const a = h1.toString(16).padStart(8, "0");
  const b = h2.toString(16).padStart(8, "0");
  // Repete pra fechar 32 hex chars
  let h3 = Math.imul(h1 ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  let h4 = Math.imul(h2 ^ 0x9e3779b9, 0xc2b2ae35) >>> 0;
  h3 = (h3 ^ (h3 >>> 16)) >>> 0;
  h4 = (h4 ^ (h4 >>> 16)) >>> 0;
  const c = h3.toString(16).padStart(8, "0");
  const d = h4.toString(16).padStart(8, "0");
  // Formato uuid 8-4-4-4-12; força versão 5 e variante RFC.
  const seg3 = "5" + b.slice(0, 3); // versão 5
  const seg4Int = (parseInt(c.slice(0, 4), 16) & 0x3fff) | 0x8000; // variante 10xx
  const seg4 = seg4Int.toString(16).padStart(4, "0");
  return `${a}-${b.slice(4)}-${seg3}-${seg4}-${c.slice(4)}${d}`;
}
