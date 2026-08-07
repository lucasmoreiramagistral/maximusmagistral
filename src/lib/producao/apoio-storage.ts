import type { ProducaoApoio } from "./apoio-types";

const KEY = "fm-producao:apoio";

function isBrowser() {
  return typeof window !== "undefined";
}

function read(): Record<string, ProducaoApoio> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, ProducaoApoio>) : {};
  } catch {
    return {};
  }
}

function write(value: Record<string, ProducaoApoio>) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("fm-producao-storage"));
  } catch {
    /* ignore */
  }
}

export const producaoApoioStorage = {
  KEY,
  get(id: string): ProducaoApoio | null {
    return read()[id] ?? null;
  },
  save(a: ProducaoApoio) {
    const all = read();
    all[a.id] = a;
    write(all);
  },
};
