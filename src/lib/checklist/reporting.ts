/**
 * Agregações para o Relatório Gerencial Operacional — Linha 3.
 *
 * Trabalha apenas com dados ATUAIS e válidos do app:
 * - checklists concluídos
 * - respostas atuais (com horarioVerificacao)
 * - anomalias atuais
 * - contagens de edições do checklist (auditoria) por id
 *
 * NÃO mistura snapshots antigos. NÃO inventa indicadores de produção/eficiência.
 */
import type {
  Anomalia,
  CategoriaAnomalia,
  Checklist,
  CriticidadeAnomalia,
  Equipe,
  MomentoChecklist,
  StatusAnomalia,
  Turno,
} from "./types";
import { MOMENTOS_CHECKLIST } from "./types";
import { buildFolhasAgrupadas } from "./supabase-storage";

// ──────────────── Filtros ────────────────
export interface FiltrosRelatorio {
  dataInicio: string; // YYYY-MM-DD (Manaus)
  dataFim: string; // YYYY-MM-DD (Manaus)
  turno?: Turno | "Todos";
  equipe?: Equipe | "Todas";
  momento?: MomentoChecklist | "Todos";
  statusAnomalia?: StatusAnomalia | "Todos";
  criticidade?: CriticidadeAnomalia | "Todas";
  categoria?: CategoriaAnomalia | string | "Todas";
  equipamentoAfetado?: string | "Todos";
}

export const FAIXAS_HORARIAS: { label: string; inicio: number; fim: number }[] = [
  { label: "00h–02h", inicio: 0, fim: 2 },
  { label: "02h–04h", inicio: 2, fim: 4 },
  { label: "04h–06h", inicio: 4, fim: 6 },
  { label: "06h–08h", inicio: 6, fim: 8 },
  { label: "08h–10h", inicio: 8, fim: 10 },
  { label: "10h–12h", inicio: 10, fim: 12 },
  { label: "12h–14h", inicio: 12, fim: 14 },
  { label: "14h–16h", inicio: 14, fim: 16 },
  { label: "16h–18h", inicio: 16, fim: 18 },
  { label: "18h–20h", inicio: 18, fim: 20 },
  { label: "20h–22h", inicio: 20, fim: 22 },
  { label: "22h–00h", inicio: 22, fim: 24 },
];

// ──────────────── Helpers ────────────────
function dentroPeriodo(dataYMD: string, ini: string, fim: string): boolean {
  return dataYMD >= ini && dataYMD <= fim;
}

function ymdManausFromIso(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Converte para horário de Manaus (UTC-4)
  const utcMs = d.getTime();
  const manaus = new Date(utcMs - 4 * 60 * 60_000);
  const y = manaus.getUTCFullYear();
  const m = String(manaus.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(manaus.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function horaManausFromIso(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const manaus = new Date(d.getTime() - 4 * 60 * 60_000);
  return manaus.getUTCHours();
}

function diffHoras(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.max(0, (db - da) / 3_600_000);
}

function fmtHoras(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function pct(num: number, den: number): number {
  if (den === 0) return 0;
  return Math.round((num / den) * 1000) / 10;
}

function normalizar(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// ──────────────── Filtragem base ────────────────
export function filtrarChecklists(
  lista: Checklist[],
  f: FiltrosRelatorio,
): Checklist[] {
  return lista.filter((c) => {
    if (c.status !== "concluido") return false;
    if (!dentroPeriodo(c.contexto.data, f.dataInicio, f.dataFim)) return false;
    if (f.turno && f.turno !== "Todos" && c.contexto.turno !== f.turno) return false;
    if (f.equipe && f.equipe !== "Todas" && c.contexto.equipe !== f.equipe) return false;
    if (f.momento && f.momento !== "Todos" && c.momento !== f.momento) return false;
    return true;
  });
}

export function filtrarAnomalias(lista: Anomalia[], f: FiltrosRelatorio): Anomalia[] {
  return lista.filter((a) => {
    const ymd = ymdManausFromIso(a.criadoEm);
    if (!ymd || !dentroPeriodo(ymd, f.dataInicio, f.dataFim)) return false;
    if (f.turno && f.turno !== "Todos" && a.turno !== f.turno) return false;
    if (f.equipe && f.equipe !== "Todas" && a.equipe !== f.equipe) return false;
    if (f.momento && f.momento !== "Todos" && a.momento !== f.momento) return false;
    if (f.statusAnomalia && f.statusAnomalia !== "Todos" && a.status !== f.statusAnomalia)
      return false;
    if (f.criticidade && f.criticidade !== "Todas" && a.criticidade !== f.criticidade)
      return false;
    if (f.categoria && f.categoria !== "Todas" && a.categoria !== f.categoria) return false;
    if (
      f.equipamentoAfetado &&
      f.equipamentoAfetado !== "Todos" &&
      (a.equipamentoAfetado ?? "Enchedora 3") !== f.equipamentoAfetado
    )
      return false;
    return true;
  });
}

// ──────────────── BLOCO 1 — Resumo Executivo ────────────────
export interface ResumoExecutivo {
  folhasRegistradas: number;
  folhasCompletas: number;
  taxaCompletude: number; // %
  itensAvaliados: number;
  conformes: number;
  naoConformes: number;
  naoAplicaveis: number;
  pctConformes: number;
  pctNaoConformes: number;
  totalAnomalias: number;
  abertas: number;
  emAndamento: number;
  resolvidas: number;
  pctResolvidasMesmoDia: number;
  tempoMedioInicioHoras: number; // até entrar em andamento
  tempoMedioResolucaoHoras: number;
}

export function calcularResumoExecutivo(
  checklists: Checklist[],
  anomalias: Anomalia[],
): ResumoExecutivo {
  const folhas = buildFolhasAgrupadas(checklists, anomalias);
  const folhasRegistradas = folhas.length;
  const folhasCompletas = folhas.filter((f) =>
    f.momentos.every((m) => m.status === "concluido"),
  ).length;

  let conformes = 0;
  let naoConformes = 0;
  let naoAplicaveis = 0;
  for (const c of checklists) {
    for (const r of c.respostas ?? []) {
      if (r.resposta === "Conforme") conformes++;
      else if (r.resposta === "Não conforme") naoConformes++;
      else if (r.resposta === "Não aplicável") naoAplicaveis++;
    }
  }
  const itensAvaliados = conformes + naoConformes + naoAplicaveis;

  const totalAnomalias = anomalias.length;
  const abertas = anomalias.filter((a) => a.status === "Aberta").length;
  const emAndamento = anomalias.filter((a) => a.status === "Em andamento").length;
  const resolvidas = anomalias.filter((a) => a.status === "Resolvida").length;

  const resolvidasArr = anomalias.filter((a) => a.status === "Resolvida" && a.resolvidoEm);
  const mesmoDia = resolvidasArr.filter((a) => {
    const ymdAbertura = ymdManausFromIso(a.criadoEm);
    const ymdResol = ymdManausFromIso(a.resolvidoEm);
    return ymdAbertura && ymdResol && ymdAbertura === ymdResol;
  }).length;

  const horasInicio: number[] = [];
  for (const a of anomalias) {
    if (a.emAndamentoEm) horasInicio.push(diffHoras(a.criadoEm, a.emAndamentoEm));
  }
  const horasResol: number[] = [];
  for (const a of resolvidasArr) {
    if (a.resolvidoEm) horasResol.push(diffHoras(a.criadoEm, a.resolvidoEm));
  }

  const media = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;

  return {
    folhasRegistradas,
    folhasCompletas,
    taxaCompletude: pct(folhasCompletas, folhasRegistradas),
    itensAvaliados,
    conformes,
    naoConformes,
    naoAplicaveis,
    pctConformes: pct(conformes, itensAvaliados),
    pctNaoConformes: pct(naoConformes, itensAvaliados),
    totalAnomalias,
    abertas,
    emAndamento,
    resolvidas,
    pctResolvidasMesmoDia: pct(mesmoDia, resolvidasArr.length),
    tempoMedioInicioHoras: media(horasInicio),
    tempoMedioResolucaoHoras: media(horasResol),
  };
}

// ──────────────── BLOCO 2 — Disciplina FM09 ────────────────
export interface DisciplinaPorChave {
  chave: string;
  folhasRegistradas: number;
  folhasCompletas: number;
  taxaCompletude: number;
}

export interface TopItem {
  numero: number;
  descricao: string;
  total: number;
}

export interface DisciplinaFM09 {
  porTurno: DisciplinaPorChave[];
  porEquipe: DisciplinaPorChave[];
  porMomento: { momento: MomentoChecklist; concluidos: number; pendentes: number }[];
  checklistsAlterados: number;
  totalAlteracoes: number;
  topItensNC: TopItem[];
  topItensObservados: TopItem[];
}

function disciplinaPor(
  checklists: Checklist[],
  anomalias: Anomalia[],
  pegaChave: (c: Checklist) => string,
): DisciplinaPorChave[] {
  const folhas = buildFolhasAgrupadas(checklists, anomalias);
  const map = new Map<string, { reg: number; comp: number }>();
  for (const f of folhas) {
    const exemplo = f.momentos.flatMap((m) => m.verificacoes)[0];
    if (!exemplo) continue;
    const chave = pegaChave(exemplo);
    const cur = map.get(chave) ?? { reg: 0, comp: 0 };
    cur.reg++;
    if (f.momentos.every((m) => m.status === "concluido")) cur.comp++;
    map.set(chave, cur);
  }
  return Array.from(map.entries())
    .map(([chave, v]) => ({
      chave,
      folhasRegistradas: v.reg,
      folhasCompletas: v.comp,
      taxaCompletude: pct(v.comp, v.reg),
    }))
    .sort((a, b) => b.folhasRegistradas - a.folhasRegistradas);
}

export function calcularDisciplinaFM09(
  checklists: Checklist[],
  anomalias: Anomalia[],
  edicoesPorChecklist: Map<string, number>,
): DisciplinaFM09 {
  const porTurno = disciplinaPor(checklists, anomalias, (c) => c.contexto.turno);
  const porEquipe = disciplinaPor(checklists, anomalias, (c) => c.contexto.equipe);

  const porMomento = MOMENTOS_CHECKLIST.map((momento) => {
    const lista = checklists.filter((c) => c.momento === momento);
    const concluidos = lista.filter((c) => c.status === "concluido").length;
    const pendentes = lista.length - concluidos;
    return { momento, concluidos, pendentes };
  });

  let checklistsAlterados = 0;
  let totalAlteracoes = 0;
  const idsPeriodo = new Set(checklists.map((c) => c.id));
  for (const [id, total] of edicoesPorChecklist.entries()) {
    if (!idsPeriodo.has(id)) continue;
    if (total > 0) {
      checklistsAlterados++;
      totalAlteracoes += total;
    }
  }

  // Top itens NC e top itens observados
  const ncMap = new Map<number, { descricao: string; total: number }>();
  const obsMap = new Map<number, { descricao: string; total: number }>();
  for (const c of checklists) {
    for (const r of c.respostas ?? []) {
      if (r.resposta === "Não conforme") {
        const cur = ncMap.get(r.itemNumero) ?? { descricao: r.descricao, total: 0 };
        cur.total++;
        ncMap.set(r.itemNumero, cur);
      }
      if (r.observacao && r.observacao.trim()) {
        const cur = obsMap.get(r.itemNumero) ?? { descricao: r.descricao, total: 0 };
        cur.total++;
        obsMap.set(r.itemNumero, cur);
      }
    }
  }
  const topItensNC = Array.from(ncMap.entries())
    .map(([numero, v]) => ({ numero, descricao: v.descricao, total: v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const topItensObservados = Array.from(obsMap.entries())
    .map(([numero, v]) => ({ numero, descricao: v.descricao, total: v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return {
    porTurno,
    porEquipe,
    porMomento,
    checklistsAlterados,
    totalAlteracoes,
    topItensNC,
    topItensObservados,
  };
}

// ──────────────── BLOCO 3 — Anomalias e tratativa ────────────────
export interface AnomaliaTratativa {
  porStatus: { chave: string; total: number }[];
  porCriticidade: { chave: string; total: number }[];
  porCategoria: { chave: string; total: number }[];
  porEquipamento: { chave: string; total: number }[];
  abertasMais24h: Anomalia[];
  topItensGeradores: TopItem[];
  tempoMedioInicioHoras: number;
  tempoMedioResolucaoHoras: number;
}

function rankear<T extends string>(
  itens: T[],
): { chave: string; total: number }[] {
  const m = new Map<string, number>();
  for (const i of itens) m.set(i, (m.get(i) ?? 0) + 1);
  return Array.from(m.entries())
    .map(([chave, total]) => ({ chave, total }))
    .sort((a, b) => b.total - a.total);
}

export function calcularAnomaliasTratativa(anomalias: Anomalia[]): AnomaliaTratativa {
  const porStatus = rankear(anomalias.map((a) => a.status));
  const porCriticidade = rankear(anomalias.map((a) => a.criticidade));
  const porCategoria = rankear(anomalias.map((a) => a.categoria));
  const porEquipamento = rankear(anomalias.map((a) => a.equipamentoAfetado ?? "Enchedora 3"));

  const agora = Date.now();
  const abertasMais24h = anomalias
    .filter((a) => a.status === "Aberta")
    .filter((a) => agora - new Date(a.criadoEm).getTime() > 24 * 3600 * 1000)
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));

  const itemMap = new Map<number, { descricao: string; total: number }>();
  for (const a of anomalias) {
    if (!a.itemOrigem) continue;
    const cur = itemMap.get(a.itemOrigem.numero) ?? {
      descricao: a.itemOrigem.descricao,
      total: 0,
    };
    cur.total++;
    itemMap.set(a.itemOrigem.numero, cur);
  }
  const topItensGeradores = Array.from(itemMap.entries())
    .map(([numero, v]) => ({ numero, descricao: v.descricao, total: v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const horasInicio: number[] = [];
  const horasResol: number[] = [];
  for (const a of anomalias) {
    if (a.emAndamentoEm) horasInicio.push(diffHoras(a.criadoEm, a.emAndamentoEm));
    if (a.status === "Resolvida" && a.resolvidoEm)
      horasResol.push(diffHoras(a.criadoEm, a.resolvidoEm));
  }
  const media = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;

  return {
    porStatus,
    porCriticidade,
    porCategoria,
    porEquipamento,
    abertasMais24h,
    topItensGeradores,
    tempoMedioInicioHoras: media(horasInicio),
    tempoMedioResolucaoHoras: media(horasResol),
  };
}

// ──────────────── BLOCO 4 — Faixas horárias críticas ────────────────
export interface FaixaHoraria {
  label: string;
  nc: number;
  observacoes: number;
  anomalias: number;
}

function indiceFaixa(hora: number): number {
  return FAIXAS_HORARIAS.findIndex((f) => hora >= f.inicio && hora < f.fim);
}

export function calcularFaixasHorarias(
  checklists: Checklist[],
  anomalias: Anomalia[],
): FaixaHoraria[] {
  const base: FaixaHoraria[] = FAIXAS_HORARIAS.map((f) => ({
    label: f.label,
    nc: 0,
    observacoes: 0,
    anomalias: 0,
  }));

  for (const c of checklists) {
    for (const r of c.respostas ?? []) {
      const h = horaManausFromIso(r.horarioVerificacao);
      if (h === null) continue;
      const idx = indiceFaixa(h);
      if (idx < 0) continue;
      if (r.resposta === "Não conforme") base[idx].nc++;
      if (r.observacao && r.observacao.trim()) base[idx].observacoes++;
    }
  }

  for (const a of anomalias) {
    const h = horaManausFromIso(a.criadoEm);
    if (h === null) continue;
    const idx = indiceFaixa(h);
    if (idx < 0) continue;
    base[idx].anomalias++;
  }

  return base;
}

// ──────────────── BLOCO 5 — Causas / Recorrência ────────────────
export interface Recorrencia {
  topCategorias: { chave: string; total: number }[];
  topEquipamentos: { chave: string; total: number }[];
  topDescricoes: { descricao: string; total: number }[];
  topItensReincidentes: TopItem[];
  itemCategoria: { item: string; categoria: string; total: number }[];
}

export function calcularRecorrencia(
  checklists: Checklist[],
  anomalias: Anomalia[],
): Recorrencia {
  const topCategorias = rankear(anomalias.map((a) => a.categoria)).slice(0, 5);
  const topEquipamentos = rankear(
    anomalias.map((a) => a.equipamentoAfetado ?? "Enchedora 3"),
  ).slice(0, 5);

  const descMap = new Map<string, { descricao: string; total: number }>();
  for (const a of anomalias) {
    const norm = normalizar(a.descricao);
    if (!norm) continue;
    const cur = descMap.get(norm) ?? { descricao: a.descricao.trim(), total: 0 };
    cur.total++;
    descMap.set(norm, cur);
  }
  const topDescricoes = Array.from(descMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Reincidência de itens FM09 = NC + anomalia geradas pelo item
  const itemMap = new Map<number, { descricao: string; total: number }>();
  for (const c of checklists) {
    for (const r of c.respostas ?? []) {
      if (r.resposta !== "Não conforme") continue;
      const cur = itemMap.get(r.itemNumero) ?? { descricao: r.descricao, total: 0 };
      cur.total++;
      itemMap.set(r.itemNumero, cur);
    }
  }
  for (const a of anomalias) {
    if (!a.itemOrigem) continue;
    const cur = itemMap.get(a.itemOrigem.numero) ?? {
      descricao: a.itemOrigem.descricao,
      total: 0,
    };
    cur.total++;
    itemMap.set(a.itemOrigem.numero, cur);
  }
  const topItensReincidentes = Array.from(itemMap.entries())
    .map(([numero, v]) => ({ numero, descricao: v.descricao, total: v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Item × categoria (top 5)
  const cruzMap = new Map<string, { item: string; categoria: string; total: number }>();
  for (const a of anomalias) {
    if (!a.itemOrigem) continue;
    const item = `Item ${a.itemOrigem.numero}`;
    const key = `${item}__${a.categoria}`;
    const cur = cruzMap.get(key) ?? { item, categoria: a.categoria, total: 0 };
    cur.total++;
    cruzMap.set(key, cur);
  }
  const itemCategoria = Array.from(cruzMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return {
    topCategorias,
    topEquipamentos,
    topDescricoes,
    topItensReincidentes,
    itemCategoria,
  };
}

// ──────────────── BLOCO 6 — Comparativo equipe / turno ────────────────
export interface LinhaComparativo {
  chave: string;
  folhasRegistradas: number;
  taxaCompletude: number;
  ncPorFolha: number;
  anomaliasPorFolha: number;
  tempoMedioResolucaoHoras: number;
  pctResolvidasMesmoDia: number;
}

function linhaComparativa(
  chave: string,
  checklists: Checklist[],
  anomalias: Anomalia[],
): LinhaComparativo {
  const folhas = buildFolhasAgrupadas(checklists, anomalias);
  const folhasRegistradas = folhas.length;
  const folhasCompletas = folhas.filter((f) =>
    f.momentos.every((m) => m.status === "concluido"),
  ).length;
  const totalNC = folhas.reduce((s, f) => s + f.totalNaoConformes, 0);
  const totalAnom = anomalias.length;
  const resolvidas = anomalias.filter((a) => a.status === "Resolvida" && a.resolvidoEm);
  const horasResol = resolvidas.map((a) => diffHoras(a.criadoEm, a.resolvidoEm!));
  const mesmoDia = resolvidas.filter((a) => {
    const ya = ymdManausFromIso(a.criadoEm);
    const yr = ymdManausFromIso(a.resolvidoEm);
    return ya && yr && ya === yr;
  }).length;
  const media = horasResol.length === 0 ? 0 : horasResol.reduce((s, v) => s + v, 0) / horasResol.length;

  return {
    chave,
    folhasRegistradas,
    taxaCompletude: pct(folhasCompletas, folhasRegistradas),
    ncPorFolha: folhasRegistradas === 0 ? 0 : Math.round((totalNC / folhasRegistradas) * 10) / 10,
    anomaliasPorFolha:
      folhasRegistradas === 0 ? 0 : Math.round((totalAnom / folhasRegistradas) * 10) / 10,
    tempoMedioResolucaoHoras: media,
    pctResolvidasMesmoDia: pct(mesmoDia, resolvidas.length),
  };
}

export function calcularComparativos(
  checklists: Checklist[],
  anomalias: Anomalia[],
): { porEquipe: LinhaComparativo[]; porTurno: LinhaComparativo[] } {
  const equipes = Array.from(new Set(checklists.map((c) => c.contexto.equipe))).sort();
  const turnos = Array.from(new Set(checklists.map((c) => c.contexto.turno))).sort();

  const porEquipe = equipes.map((eq) =>
    linhaComparativa(
      eq,
      checklists.filter((c) => c.contexto.equipe === eq),
      anomalias.filter((a) => a.equipe === eq),
    ),
  );
  const porTurno = turnos.map((tu) =>
    linhaComparativa(
      tu,
      checklists.filter((c) => c.contexto.turno === tu),
      anomalias.filter((a) => a.turno === tu),
    ),
  );

  return { porEquipe, porTurno };
}

// ──────────────── BLOCO 7 — Ação imediata ────────────────
export interface AcaoImediata {
  texto: string;
  destaque: "destructive" | "warning" | "primary";
}

export function calcularAcoesImediatas(
  anomalias: Anomalia[],
  recorrencia: Recorrencia,
  faixas: FaixaHoraria[],
  comparativos: { porEquipe: LinhaComparativo[] },
): AcaoImediata[] {
  const lista: AcaoImediata[] = [];

  const criticasAbertas = anomalias.filter(
    (a) => a.status !== "Resolvida" && a.criticidade === "Crítica",
  ).length;
  if (criticasAbertas > 0) {
    lista.push({
      texto: `${criticasAbertas} ${criticasAbertas === 1 ? "anomalia crítica segue aberta" : "anomalias críticas seguem abertas"}`,
      destaque: "destructive",
    });
  }

  const agora = Date.now();
  const abertas24h = anomalias
    .filter((a) => a.status === "Aberta")
    .filter((a) => agora - new Date(a.criadoEm).getTime() > 24 * 3600 * 1000).length;
  if (abertas24h > 0) {
    lista.push({
      texto: `${abertas24h} ${abertas24h === 1 ? "anomalia aberta" : "anomalias abertas"} há mais de 24h`,
      destaque: "destructive",
    });
  }

  const itemTop = recorrencia.topItensReincidentes[0];
  if (itemTop) {
    lista.push({
      texto: `Item ${itemTop.numero} do FM09 foi o mais reincidente no período (${itemTop.total} ocorrências)`,
      destaque: "warning",
    });
  }

  const eqTop = recorrencia.topEquipamentos[0];
  if (eqTop && eqTop.total > 0) {
    lista.push({
      texto: `${eqTop.chave} foi o equipamento mais afetado no período`,
      destaque: "warning",
    });
  }

  const equipeMaiorNC = [...comparativos.porEquipe].sort(
    (a, b) => b.ncPorFolha - a.ncPorFolha,
  )[0];
  if (equipeMaiorNC && equipeMaiorNC.ncPorFolha > 0) {
    lista.push({
      texto: `Equipe ${equipeMaiorNC.chave} apresentou a maior taxa de NC por folha (${equipeMaiorNC.ncPorFolha})`,
      destaque: "primary",
    });
  }

  const faixaTop = [...faixas].sort(
    (a, b) => b.nc + b.anomalias - (a.nc + a.anomalias),
  )[0];
  if (faixaTop && faixaTop.nc + faixaTop.anomalias > 0) {
    lista.push({
      texto: `Faixa ${faixaTop.label} concentrou a maior incidência de NC e anomalias`,
      destaque: "primary",
    });
  }

  const catTop = recorrencia.topCategorias[0];
  if (catTop && catTop.total > 0) {
    lista.push({
      texto: `Categoria "${catTop.chave}" foi a mais recorrente no período`,
      destaque: "primary",
    });
  }

  return lista;
}

// ──────────────── Util de exibição ────────────────
export const reportFmt = { fmtHoras };
