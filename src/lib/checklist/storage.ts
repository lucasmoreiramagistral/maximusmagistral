import type {
  Anomalia,
  Checklist,
  ContextoChecklist,
  FolhaChecklistDia,
  MomentoChecklist,
  MomentoFolha,
  StatusMomentoFolha,
  Usuario,
} from "./types";
import { MOMENTOS_CHECKLIST } from "./types";
import { buildFolhaKey } from "./supabase-storage";

const KEYS = {
  rascunho: "fm-checklist:rascunho",
  checklists: "fm-checklist:checklists",
  anomalias: "fm-checklist:anomalias",
  usuario: "fm-checklist:usuario",
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
    window.dispatchEvent(new CustomEvent("fm-storage-update", { detail: { key } }));
  } catch {
    // ignora
  }
}

function remove(key: string) {
  if (!isBrowser()) return;
  window.localStorage.removeItem(key);
  window.dispatchEvent(new CustomEvent("fm-storage-update", { detail: { key } }));
}

function checklistFolhaKey(c: Checklist): string {
  return c.folhaKey ?? buildFolhaKey(c.contexto);
}

function buildFolhasLocais(
  checklists: Checklist[],
  anomalias: Anomalia[],
): FolhaChecklistDia[] {
  const map = new Map<string, FolhaChecklistDia>();
  for (const c of checklists) {
    const key = checklistFolhaKey(c);
    let folha = map.get(key);
    if (!folha) {
      folha = {
        folhaKey: key,
        contexto: c.contexto,
        momentos: MOMENTOS_CHECKLIST.map<MomentoFolha>((m) => ({
          momento: m,
          status: "pendente" as StatusMomentoFolha,
          verificacoes: [],
        })),
        totalConformes: 0,
        totalNaoConformes: 0,
        totalNaoAplicaveis: 0,
        totalAnomalias: 0,
        ultimaAtualizacao: c.criadoEm,
      };
      map.set(key, folha);
    }
    const slot = folha.momentos.find((mm) => mm.momento === c.momento);
    if (slot) {
      slot.verificacoes.push(c);
      if (c.status === "concluido") slot.status = "concluido";
      else if (slot.status !== "concluido") slot.status = "em_andamento";
    }
    for (const r of c.respostas ?? []) {
      if (!r) continue;
      if (r.resposta === "Conforme") folha.totalConformes++;
      else if (r.resposta === "Não conforme") folha.totalNaoConformes++;
      else if (r.resposta === "Não aplicável") folha.totalNaoAplicaveis++;
    }
    const ts = c.concluidoEm ?? c.criadoEm;
    if (ts > folha.ultimaAtualizacao) folha.ultimaAtualizacao = ts;
  }
  for (const a of anomalias) {
    const dia = a.criadoEm.slice(0, 10);
    for (const folha of map.values()) {
      const c = folha.contexto;
      if (
        c.data === dia &&
        c.turno === a.turno &&
        c.equipe === a.equipe &&
        c.linha === a.linha &&
        c.maquina === a.maquina
      ) {
        folha.totalAnomalias++;
      }
    }
  }
  for (const f of map.values()) {
    for (const m of f.momentos) {
      m.verificacoes.sort((a, b) => (a.verificacaoNumero ?? 1) - (b.verificacaoNumero ?? 1));
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    b.ultimaAtualizacao.localeCompare(a.ultimaAtualizacao),
  );
}

/**
 * Storage local: rascunho, checklists concluídos (cache local), anomalias (cache local),
 * usuário (legado). Os dados reais são sincronizados via Supabase pelos hooks dedicados.
 */
export const storage = {
  // ─── Usuário (legado local) ───
  getUsuario: (): Usuario | null => read<Usuario | null>(KEYS.usuario, null),
  setUsuario: (u: Usuario) => write(KEYS.usuario, u),
  clearUsuario: () => remove(KEYS.usuario),

  // ─── Rascunho ───
  getRascunho: (): Checklist | null => read<Checklist | null>(KEYS.rascunho, null),
  setRascunho: (c: Checklist) => write(KEYS.rascunho, c),
  clearRascunho: () => remove(KEYS.rascunho),

  // ─── Checklists (cache local) ───
  getChecklists: (): Checklist[] => read<Checklist[]>(KEYS.checklists, []),
  saveChecklist: (c: Checklist) => {
    const list = read<Checklist[]>(KEYS.checklists, []);
    const idx = list.findIndex((x) => x.id === c.id);
    if (idx >= 0) list[idx] = c;
    else list.unshift(c);
    write(KEYS.checklists, list);
  },

  // ─── Anomalias (cache local) ───
  getAnomalias: (): Anomalia[] => read<Anomalia[]>(KEYS.anomalias, []),
  saveAnomalia: (a: Anomalia) => {
    const list = read<Anomalia[]>(KEYS.anomalias, []);
    list.unshift(a);
    write(KEYS.anomalias, list);
  },

  // ─── Helpers de agrupamento ───
  getFolhasAgrupadas: (): FolhaChecklistDia[] => {
    return buildFolhasLocais(
      read<Checklist[]>(KEYS.checklists, []),
      read<Anomalia[]>(KEYS.anomalias, []),
    );
  },

  getChecklistsByMomentoNoDia: (
    contexto: ContextoChecklist,
    momento: string,
  ): Checklist[] => {
    const key = buildFolhaKey(contexto);
    return read<Checklist[]>(KEYS.checklists, []).filter(
      (c) => checklistFolhaKey(c) === key && c.momento === momento,
    );
  },

  getChecklistConcluidoMesmoMomento: (
    contexto: ContextoChecklist,
    momento: string,
  ): Checklist | null => {
    const key = buildFolhaKey(contexto);
    const lista = read<Checklist[]>(KEYS.checklists, []).filter(
      (c) => checklistFolhaKey(c) === key && c.momento === momento,
    );
    return lista.find((c) => c.status === "concluido") ?? null;
  },

  getChecklistEmAndamentoMesmoMomento: (
    contexto: ContextoChecklist,
    momento: string,
  ): Checklist | null => {
    const r = read<Checklist | null>(KEYS.rascunho, null);
    if (!r) return null;
    const key = r.folhaKey ?? buildFolhaKey(r.contexto);
    if (key === buildFolhaKey(contexto) && r.momento === momento) return r;
    return null;
  },

  KEYS,
};

export { buildFolhaKey, genId } from "./supabase-storage";
