import type { ProducaoHora } from "./types";

const KEY = "fm-producao:horas";

function isBrowser() {
  return typeof window !== "undefined";
}

function read(): Record<string, ProducaoHora[]> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, ProducaoHora[]>) : {};
  } catch {
    return {};
  }
}

function write(value: Record<string, ProducaoHora[]>) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("fm-producao-storage"));
  } catch {
    /* ignore */
  }
}

export const producaoStorage = {
  KEY,
  getHoras(folhaDiaKey: string): ProducaoHora[] {
    return read()[folhaDiaKey] ?? [];
  },
  saveHora(h: ProducaoHora) {
    const all = read();
    const list = all[h.folhaDiaKey] ?? [];
    const idx = list.findIndex((x) => x.horaCodigo === h.horaCodigo);
    if (idx >= 0) list[idx] = h;
    else list.push(h);
    all[h.folhaDiaKey] = list;
    write(all);
  },
  bulkSetHoras(folhaDiaKey: string, list: ProducaoHora[]) {
    const all = read();
    all[folhaDiaKey] = list;
    write(all);
  },
};
