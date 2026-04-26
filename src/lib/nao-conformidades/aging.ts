// Cálculos de aging / SLA / reincidência para a tela de NCs e NRs.
// Tudo em memória, sem nenhum acesso a banco.

import type { OrigemNcNr, RegistroNcNr } from "@/lib/checklist/nao-conformidades";
import {
  chaveRegistro,
  type ResolucaoNcNr,
} from "@/lib/nao-conformidades/resolucoes";

const MS_DIA = 1000 * 60 * 60 * 24;
const SLA_DIAS = 7;

export interface RegistroComStatus {
  registro: RegistroNcNr;
  resolucao: ResolucaoNcNr | null;
}

/** Diferença em dias (float, sem arredondar) entre dois ISOs. */
function diffDias(deIso: string, ateIso: string): number {
  const a = new Date(deIso).getTime();
  const b = new Date(ateIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, (b - a) / MS_DIA);
}

export interface AgingItem extends RegistroComStatus {
  diasEmAberto: number;
  estouroSla: boolean;
}

/** Pendentes ordenadas da mais antiga pra mais nova. */
export function calcularAgingPendentes(
  registros: RegistroComStatus[],
  agoraIso: string = new Date().toISOString(),
): AgingItem[] {
  return registros
    .filter((x) => !x.resolucao)
    .map((x) => {
      const dias = diffDias(x.registro.dataHora, agoraIso);
      return {
        ...x,
        diasEmAberto: dias,
        estouroSla: dias > SLA_DIAS,
      };
    })
    .sort((a, b) => b.diasEmAberto - a.diasEmAberto);
}

export interface KpisTempo {
  /** Dias médios de resolução das resolvidas. null = não há resolvidas. */
  tempoMedioResolucao: number | null;
  /** Dias médios em aberto das pendentes. null = não há pendentes. */
  tempoMedioEmAberto: number | null;
  /** Maior aging entre pendentes. */
  maisAntigaDias: number | null;
  maisAntigaItem: string | null;
  /** % das resolvidas que foram fechadas em até 24h. */
  percentualEm24h: number | null;
  /** Pendentes com aging > 7 dias. */
  slaEstourado: number;
}

export function calcularKpisTempo(
  registros: RegistroComStatus[],
  agoraIso: string = new Date().toISOString(),
): KpisTempo {
  const resolvidas = registros.filter((x) => x.resolucao);
  const pendentes = registros.filter((x) => !x.resolucao);

  const temposResolucao = resolvidas.map((x) =>
    diffDias(x.registro.dataHora, x.resolucao!.resolvidoEm),
  );
  const temposAberto = pendentes.map((x) => diffDias(x.registro.dataHora, agoraIso));

  const tempoMedioResolucao =
    temposResolucao.length === 0
      ? null
      : temposResolucao.reduce((s, n) => s + n, 0) / temposResolucao.length;

  const tempoMedioEmAberto =
    temposAberto.length === 0
      ? null
      : temposAberto.reduce((s, n) => s + n, 0) / temposAberto.length;

  let maisAntigaDias: number | null = null;
  let maisAntigaItem: string | null = null;
  for (const p of pendentes) {
    const d = diffDias(p.registro.dataHora, agoraIso);
    if (maisAntigaDias === null || d > maisAntigaDias) {
      maisAntigaDias = d;
      maisAntigaItem = `#${p.registro.itemNumero} — ${p.registro.itemDescricao}`;
    }
  }

  const em24h = temposResolucao.filter((d) => d <= 1).length;
  const percentualEm24h =
    temposResolucao.length === 0 ? null : (em24h / temposResolucao.length) * 100;

  const slaEstourado = temposAberto.filter((d) => d > SLA_DIAS).length;

  return {
    tempoMedioResolucao,
    tempoMedioEmAberto,
    maisAntigaDias,
    maisAntigaItem,
    percentualEm24h,
    slaEstourado,
  };
}

export interface ItemCronico {
  chave: string;
  origem: OrigemNcNr;
  descricao: string;
  itemNumero: string | number;
  ocorrencias: number;
  pendentes: number;
  tempoMedioResolucao: number | null;
  reincidencias: number;
}

/**
 * Reincidência = mesmo item (origem + número) reaparece em data diferente
 * para o mesmo turno após já ter sido resolvido pelo menos uma vez.
 * Conta cada reaparecimento posterior à primeira resolução.
 */
export function calcularItensCronicos(
  registros: RegistroComStatus[],
): ItemCronico[] {
  const grupos = new Map<string, RegistroComStatus[]>();
  for (const x of registros) {
    const k = `${x.registro.origem}::${x.registro.itemNumero}`;
    const arr = grupos.get(k) ?? [];
    arr.push(x);
    grupos.set(k, arr);
  }

  const out: ItemCronico[] = [];
  for (const [chave, arr] of grupos.entries()) {
    const ocorrencias = arr.length;
    const pendentes = arr.filter((x) => !x.resolucao).length;
    const resolvidos = arr.filter((x) => x.resolucao);
    const tempos = resolvidos.map((x) =>
      diffDias(x.registro.dataHora, x.resolucao!.resolvidoEm),
    );
    const tempoMedio =
      tempos.length === 0 ? null : tempos.reduce((s, n) => s + n, 0) / tempos.length;

    // Reincidência por turno: ordena por data e conta quantas vezes apareceu
    // depois de uma resolução anterior.
    const porTurno = new Map<string, RegistroComStatus[]>();
    for (const x of arr) {
      const t = x.registro.turno;
      const lst = porTurno.get(t) ?? [];
      lst.push(x);
      porTurno.set(t, lst);
    }
    let reincidencias = 0;
    for (const lst of porTurno.values()) {
      lst.sort((a, b) => (a.registro.dataHora < b.registro.dataHora ? -1 : 1));
      let jaResolvidaUmaVez = false;
      for (const x of lst) {
        if (jaResolvidaUmaVez) reincidencias += 1;
        if (x.resolucao) jaResolvidaUmaVez = true;
      }
    }

    const ref = arr[0].registro;
    out.push({
      chave,
      origem: ref.origem,
      descricao: ref.itemDescricao,
      itemNumero: ref.itemNumero,
      ocorrencias,
      pendentes,
      tempoMedioResolucao: tempoMedio,
      reincidencias,
    });
  }

  // Ordena por: pendentes desc, depois reincidência desc, depois ocorrências.
  out.sort(
    (a, b) =>
      b.pendentes - a.pendentes ||
      b.reincidencias - a.reincidencias ||
      b.ocorrencias - a.ocorrencias,
  );
  return out;
}

export interface PerformanceTurno {
  turno: string;
  total: number;
  resolvidas: number;
  pendentes: number;
  percentualResolvido: number;
  tempoMedioResolucao: number | null;
  pendentesAcimaSla: number;
}

export function calcularPerformanceTurno(
  registros: RegistroComStatus[],
  agoraIso: string = new Date().toISOString(),
): PerformanceTurno[] {
  const porTurno = new Map<string, RegistroComStatus[]>();
  for (const x of registros) {
    const t = x.registro.turno;
    const lst = porTurno.get(t) ?? [];
    lst.push(x);
    porTurno.set(t, lst);
  }

  const out: PerformanceTurno[] = [];
  for (const [turno, lst] of porTurno.entries()) {
    const total = lst.length;
    const resolvidas = lst.filter((x) => x.resolucao).length;
    const pendentes = total - resolvidas;
    const tempos = lst
      .filter((x) => x.resolucao)
      .map((x) => diffDias(x.registro.dataHora, x.resolucao!.resolvidoEm));
    const tempoMedio =
      tempos.length === 0 ? null : tempos.reduce((s, n) => s + n, 0) / tempos.length;
    const acimaSla = lst.filter(
      (x) => !x.resolucao && diffDias(x.registro.dataHora, agoraIso) > SLA_DIAS,
    ).length;
    out.push({
      turno,
      total,
      resolvidas,
      pendentes,
      percentualResolvido: total === 0 ? 0 : (resolvidas / total) * 100,
      tempoMedioResolucao: tempoMedio,
      pendentesAcimaSla: acimaSla,
    });
  }
  out.sort((a, b) => b.pendentesAcimaSla - a.pendentesAcimaSla || b.total - a.total);
  return out;
}

export interface PerformanceEquipe {
  equipe: string;
  total: number;
  resolvidas: number;
  pendentes: number;
  percentualResolvido: number;
  tempoMedioResolucao: number | null;
  pendentesAcimaSla: number;
}

export function calcularPerformanceEquipe(
  registros: RegistroComStatus[],
  agoraIso: string = new Date().toISOString(),
): PerformanceEquipe[] {
  const porEquipe = new Map<string, RegistroComStatus[]>();
  for (const x of registros) {
    const e = x.registro.equipe;
    const lst = porEquipe.get(e) ?? [];
    lst.push(x);
    porEquipe.set(e, lst);
  }

  const out: PerformanceEquipe[] = [];
  for (const [equipe, lst] of porEquipe.entries()) {
    const total = lst.length;
    const resolvidas = lst.filter((x) => x.resolucao).length;
    const pendentes = total - resolvidas;
    const tempos = lst
      .filter((x) => x.resolucao)
      .map((x) => diffDias(x.registro.dataHora, x.resolucao!.resolvidoEm));
    const tempoMedio =
      tempos.length === 0 ? null : tempos.reduce((s, n) => s + n, 0) / tempos.length;
    const acimaSla = lst.filter(
      (x) => !x.resolucao && diffDias(x.registro.dataHora, agoraIso) > SLA_DIAS,
    ).length;
    out.push({
      equipe,
      total,
      resolvidas,
      pendentes,
      percentualResolvido: total === 0 ? 0 : (resolvidas / total) * 100,
      tempoMedioResolucao: tempoMedio,
      pendentesAcimaSla: acimaSla,
    });
  }
  out.sort((a, b) => b.pendentesAcimaSla - a.pendentesAcimaSla || b.total - a.total);
  return out;
}

/** Formata duração em dias para texto curto: "3h", "1,2 d", "12 d". */
export function formatarDias(dias: number | null): string {
  if (dias === null) return "—";
  if (dias < 1) {
    const horas = Math.max(0, Math.round(dias * 24));
    return `${horas}h`;
  }
  if (dias < 10) return `${dias.toFixed(1).replace(".", ",")} d`;
  return `${Math.round(dias)} d`;
}

/** Cor de badge pelo aging (em dias). */
export function tomAging(dias: number): "success" | "warning" | "destructive" {
  if (dias <= 2) return "success";
  if (dias <= SLA_DIAS) return "warning";
  return "destructive";
}

export { chaveRegistro, SLA_DIAS };
