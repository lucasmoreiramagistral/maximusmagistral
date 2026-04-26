// Helpers exclusivos do Dashboard Gestão (/gestao/dashboard).
// Tudo em memória, reaproveita tipos de aging.ts e nao-conformidades.ts.

import type { OrigemNcNr } from "@/lib/checklist/nao-conformidades";
import type { RegistroComStatus } from "./aging";
import { calcularItensCronicos, SLA_DIAS } from "./aging";

const MS_DIA = 1000 * 60 * 60 * 24;

function diffDias(deIso: string, ateIso: string): number {
  const a = new Date(deIso).getTime();
  const b = new Date(ateIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, (b - a) / MS_DIA);
}

// ---------------------------------------------------------------------------
// Heatmap Turno × Origem (NC / NR)
// ---------------------------------------------------------------------------
export interface HeatmapCell {
  turno: string;
  nc: number;
  nr: number;
  total: number;
  /** Pendências (não resolvidas) — usadas para destaque. */
  pendentes: number;
}

export function calcularHeatmapTurnoOrigem(
  registros: RegistroComStatus[],
): HeatmapCell[] {
  const map = new Map<string, HeatmapCell>();
  for (const x of registros) {
    const t = x.registro.turno || "—";
    const cur =
      map.get(t) ??
      ({ turno: t, nc: 0, nr: 0, total: 0, pendentes: 0 } as HeatmapCell);
    if (x.registro.origem === "checklist") cur.nc += 1;
    else cur.nr += 1;
    cur.total += 1;
    if (!x.resolucao) cur.pendentes += 1;
    map.set(t, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.pendentes - a.pendentes);
}

// ---------------------------------------------------------------------------
// Série diária (últimos N dias) — abertas vs resolvidas
// ---------------------------------------------------------------------------
export interface PontoSerieDiaria {
  data: string; // YYYY-MM-DD
  rotulo: string; // ex.: "21/04"
  abertas: number;
  resolvidas: number;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function calcularSerieDiaria(
  registros: RegistroComStatus[],
  dias: number,
  agoraIso: string = new Date().toISOString(),
): PontoSerieDiaria[] {
  const agora = new Date(agoraIso);
  const buckets = new Map<string, PontoSerieDiaria>();

  for (let i = dias - 1; i >= 0; i -= 1) {
    const d = new Date(agora);
    d.setDate(d.getDate() - i);
    const key = ymd(d);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    buckets.set(key, { data: key, rotulo: `${dd}/${mm}`, abertas: 0, resolvidas: 0 });
  }

  for (const x of registros) {
    const aberta = x.registro.data;
    const b1 = buckets.get(aberta);
    if (b1) b1.abertas += 1;
    if (x.resolucao) {
      const resolvidaDia = x.resolucao.resolvidoEm.slice(0, 10);
      const b2 = buckets.get(resolvidaDia);
      if (b2) b2.resolvidas += 1;
    }
  }

  return Array.from(buckets.values());
}

// ---------------------------------------------------------------------------
// Faixa horária com pico de NCs
// ---------------------------------------------------------------------------
export interface FaixaHorariaPico {
  faixa: string; // ex.: "14h–16h"
  total: number;
}

export function calcularPicoFaixaHoraria(
  registros: RegistroComStatus[],
): FaixaHorariaPico | null {
  const buckets = new Map<number, number>(); // hora inicial (par) → qtd
  for (const x of registros) {
    if (x.registro.origem !== "checklist") continue;
    const h = new Date(x.registro.dataHora).getHours();
    if (Number.isNaN(h)) continue;
    const baseHora = Math.floor(h / 2) * 2;
    buckets.set(baseHora, (buckets.get(baseHora) ?? 0) + 1);
  }
  let maxQtd = 0;
  let maxHora = -1;
  for (const [hora, qtd] of buckets.entries()) {
    if (qtd > maxQtd) {
      maxQtd = qtd;
      maxHora = hora;
    }
  }
  if (maxHora < 0 || maxQtd === 0) return null;
  return {
    faixa: `${String(maxHora).padStart(2, "0")}h–${String(maxHora + 2).padStart(2, "0")}h`,
    total: maxQtd,
  };
}

// ---------------------------------------------------------------------------
// Alertas inteligentes
// ---------------------------------------------------------------------------
export type SeveridadeAlerta = "alta" | "media" | "info";

export interface Alerta {
  id: string;
  severidade: SeveridadeAlerta;
  titulo: string;
  detalhe: string;
  link?: { to: string; label: string };
}

export function gerarAlertas(
  registros: RegistroComStatus[],
  agoraIso: string = new Date().toISOString(),
): Alerta[] {
  const out: Alerta[] = [];

  // 1) SLA estourado
  const pendentesSla = registros.filter(
    (x) => !x.resolucao && diffDias(x.registro.dataHora, agoraIso) > SLA_DIAS,
  );
  if (pendentesSla.length > 0) {
    // Turno que mais concentra
    const porTurno = new Map<string, number>();
    for (const p of pendentesSla)
      porTurno.set(p.registro.turno, (porTurno.get(p.registro.turno) ?? 0) + 1);
    const turnoTop = [...porTurno.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push({
      id: "sla",
      severidade: "alta",
      titulo: `${pendentesSla.length} pendência(s) com SLA estourado (>${SLA_DIAS}d)`,
      detalhe: turnoTop
        ? `Turno ${turnoTop[0]} concentra ${turnoTop[1]} delas.`
        : "Tratar imediatamente.",
      link: { to: "/gestao/nao-conformidades", label: "Abrir lista" },
    });
  }

  // 2) Itens crônicos (reincidência ≥ 2)
  const cronicos = calcularItensCronicos(registros).filter(
    (c) => c.reincidencias >= 2,
  );
  if (cronicos.length > 0) {
    const top = cronicos[0];
    out.push({
      id: "cronicos",
      severidade: "media",
      titulo: `${cronicos.length} item(ns) crônico(s) com reincidência`,
      detalhe: `Destaque: #${top.itemNumero} — ${top.descricao} (${top.reincidencias} reincidências).`,
      link: { to: "/gestao/nao-conformidades", label: "Investigar" },
    });
  }

  // 3) Faixa horária com pico
  const pico = calcularPicoFaixaHoraria(registros);
  if (pico && pico.total >= 3) {
    out.push({
      id: "pico-horario",
      severidade: "info",
      titulo: `Pico de NCs na faixa ${pico.faixa}`,
      detalhe: `${pico.total} NCs registradas nessa janela. Considere reforço operacional.`,
    });
  }

  // 4) Acúmulo geral de pendências
  const total = registros.length;
  const pendentes = registros.filter((x) => !x.resolucao).length;
  if (total > 0) {
    const pct = (pendentes / total) * 100;
    if (pct >= 60) {
      out.push({
        id: "acumulo",
        severidade: "alta",
        titulo: `${Math.round(pct)}% das ocorrências do período seguem pendentes`,
        detalhe: "Risco de acúmulo. Priorize tratativa antes do próximo turno.",
        link: { to: "/gestao/nao-conformidades", label: "Tratar pendências" },
      });
    } else if (pct >= 35) {
      out.push({
        id: "acumulo-medio",
        severidade: "media",
        titulo: `${Math.round(pct)}% das ocorrências do período seguem pendentes`,
        detalhe: "Acompanhar de perto.",
        link: { to: "/gestao/nao-conformidades", label: "Ver lista" },
      });
    }
  }

  // 5) Tudo resolvido
  if (out.length === 0 && total > 0) {
    out.push({
      id: "tudo-ok",
      severidade: "info",
      titulo: "Sem alertas críticos no período",
      detalhe: `${total} ocorrência(s) registradas, todas tratadas dentro do esperado.`,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Cor de intensidade para o heatmap (0..max → opacidade)
// ---------------------------------------------------------------------------
export function intensidadeHeat(valor: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(1, valor / max);
}

export type { OrigemNcNr };
