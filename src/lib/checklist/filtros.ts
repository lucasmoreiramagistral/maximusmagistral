import type {
  Anomalia,
  CategoriaAnomalia,
  Checklist,
  CriticidadeAnomalia,
  Equipe,
  FolhaChecklistDia,
  MomentoChecklist,
  StatusAnomalia,
  Turno,
} from "./types";

export interface Filtros {
  dataInicio?: string; // YYYY-MM-DD
  dataFim?: string; // YYYY-MM-DD
  turno?: Turno | "";
  equipe?: Equipe | "";
  momento?: MomentoChecklist | "";
  statusAnomalia?: StatusAnomalia | "";
  categoriaAnomalia?: CategoriaAnomalia | "";
  criticidadeAnomalia?: CriticidadeAnomalia | "";
  maquina?: string | "";
  equipamentoAfetado?: string | "";
}

const KEY = "fm-checklist:filtros";

export function getFiltros(): Filtros {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Filtros) : {};
  } catch {
    return {};
  }
}

export function setFiltros(f: Filtros) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(f));
  window.dispatchEvent(new CustomEvent("fm-storage-update", { detail: { key: KEY } }));
}

export const FILTROS_KEY = KEY;

function matchData(dataISO: string, f: Filtros): boolean {
  const ymd = dataISO.length >= 10 ? dataISO.slice(0, 10) : dataISO;
  if (f.dataInicio && ymd < f.dataInicio) return false;
  if (f.dataFim && ymd > f.dataFim) return false;
  return true;
}

export function filtrarChecklists(
  lista: Checklist[],
  f: Filtros,
  anomalias?: Anomalia[],
): Checklist[] {
  // Quando filtra por equipamento afetado, só passa o checklist que possui pelo menos
  // uma anomalia vinculada com aquele equipamento afetado.
  let checklistsComEquipamento: Set<string> | null = null;
  if (f.equipamentoAfetado && anomalias) {
    checklistsComEquipamento = new Set();
    for (const a of anomalias) {
      const eq = a.equipamentoAfetado ?? "Enchedora 3";
      if (eq === f.equipamentoAfetado && a.checklistId) {
        checklistsComEquipamento.add(a.checklistId);
      }
    }
  }
  return lista.filter((c) => {
    if (!matchData(c.contexto.data, f)) return false;
    if (f.turno && c.contexto.turno !== f.turno) return false;
    if (f.equipe && c.contexto.equipe !== f.equipe) return false;
    if (f.momento && c.momento !== f.momento) return false;
    if (checklistsComEquipamento && !checklistsComEquipamento.has(c.id)) return false;
    return true;
  });
}

export function filtrarAnomalias(lista: Anomalia[], f: Filtros): Anomalia[] {
  return lista.filter((a) => {
    if (!matchData(a.criadoEm, f)) return false;
    if (f.equipe && a.equipe !== f.equipe) return false;
    if (f.turno && a.turno !== f.turno) return false;
    if (f.statusAnomalia && a.status !== f.statusAnomalia) return false;
    if (f.categoriaAnomalia && a.categoria !== f.categoriaAnomalia) return false;
    if (f.criticidadeAnomalia && a.criticidade !== f.criticidadeAnomalia) return false;
    if (f.maquina && a.maquina !== f.maquina) return false;
    if (f.equipamentoAfetado) {
      const eq = a.equipamentoAfetado ?? "Enchedora 3";
      if (eq !== f.equipamentoAfetado) return false;
    }
    return true;
  });
}

export function filtrarFolhas(
  lista: FolhaChecklistDia[],
  f: Filtros,
  anomalias?: Anomalia[],
): FolhaChecklistDia[] {
  // Mesmo critério das checklists: folha do dia precisa ter anomalia com aquele equipamento.
  let folhasComEquipamento: Set<string> | null = null;
  if (f.equipamentoAfetado && anomalias) {
    folhasComEquipamento = new Set();
    for (const a of anomalias) {
      const eq = a.equipamentoAfetado ?? "Enchedora 3";
      if (eq === f.equipamentoAfetado && a.folhaKey) {
        folhasComEquipamento.add(a.folhaKey);
      }
    }
  }
  return lista.filter((folha) => {
    if (!matchData(folha.contexto.data, f)) return false;
    if (f.turno && folha.contexto.turno !== f.turno) return false;
    if (f.equipe && folha.contexto.equipe !== f.equipe) return false;
    if (folhasComEquipamento && !folhasComEquipamento.has(folha.folhaKey)) return false;
    return true;
  });
}

export function filtrosAtivos(f: Filtros): boolean {
  return !!(
    f.dataInicio ||
    f.dataFim ||
    f.turno ||
    f.equipe ||
    f.momento ||
    f.statusAnomalia ||
    f.categoriaAnomalia ||
    f.criticidadeAnomalia ||
    f.maquina ||
    f.equipamentoAfetado
  );
}

/**
 * Ordenação padrão para a Manutenção:
 * 1. Abertas críticas → altas → médias → baixas
 * 2. Em andamento
 * 3. Resolvidas
 * Dentro de cada grupo: mais recente primeiro.
 */
export function ordenarAnomaliasManutencao(lista: Anomalia[]): Anomalia[] {
  const statusOrder: Record<StatusAnomalia, number> = {
    Aberta: 0,
    "Em andamento": 1,
    Resolvida: 2,
  };
  const critOrder: Record<CriticidadeAnomalia, number> = {
    Crítica: 0,
    Alta: 1,
    Média: 2,
    Baixa: 3,
  };
  return [...lista].sort((a, b) => {
    const sa = statusOrder[a.status] ?? 99;
    const sb = statusOrder[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    if (a.status === "Aberta" && b.status === "Aberta") {
      const ca = critOrder[a.criticidade] ?? 99;
      const cb = critOrder[b.criticidade] ?? 99;
      if (ca !== cb) return ca - cb;
    }
    return b.criadoEm.localeCompare(a.criadoEm);
  });
}
