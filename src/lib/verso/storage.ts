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

export function genVersoId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
