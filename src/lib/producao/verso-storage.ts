import type { ProducaoPassagem, ProducaoTanque } from "./verso-types";

const KEYS = {
  tanques: "fm-producao:tanques",
  passagem: "fm-producao:passagem",
};

function isBrowser() {
  return typeof window !== "undefined";
}

function read<T>(key: string): Record<string, T> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function write<T>(key: string, value: Record<string, T>) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("fm-producao-storage"));
  } catch {
    /* ignore */
  }
}

export const producaoVersoStorage = {
  KEYS,

  getTanques(folhaDiaKey: string): ProducaoTanque[] {
    const all = read<ProducaoTanque[]>(KEYS.tanques);
    return all[folhaDiaKey] ?? [];
  },
  setTanques(folhaDiaKey: string, list: ProducaoTanque[]) {
    const all = read<ProducaoTanque[]>(KEYS.tanques);
    all[folhaDiaKey] = list;
    write(KEYS.tanques, all);
  },
  saveTanque(t: ProducaoTanque) {
    const list = this.getTanques(t.folhaDiaKey);
    const idx = list.findIndex((x) => x.id === t.id);
    if (idx >= 0) list[idx] = t;
    else list.push(t);
    this.setTanques(t.folhaDiaKey, list);
  },

  getPassagem(id: string): ProducaoPassagem | null {
    return read<ProducaoPassagem>(KEYS.passagem)[id] ?? null;
  },
  savePassagem(p: ProducaoPassagem) {
    const all = read<ProducaoPassagem>(KEYS.passagem);
    all[p.id] = p;
    write(KEYS.passagem, all);
  },
};
