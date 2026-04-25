// Agregadores de Não Conformidades (checklist) e Não Realizados (limpeza)
// para a home da gestão e a tela /gestao/nao-conformidades.
//
// IMPORTANTE: NÃO depende da tabela de anomalias. Lê apenas:
//  - checklists.respostas[] com resposta = "Não conforme" e observação preenchida
//  - limpeza_turnos.itens[] com status = "nao_realizado"
//
// Toda manipulação é em memória, não muda o schema.

import type { Checklist, RespostaItem } from "@/lib/checklist/types";
import type { LimpezaItem, LimpezaTurno } from "@/lib/verso/types";

export type OrigemNcNr = "checklist" | "limpeza";

export interface RegistroNcNr {
  origem: OrigemNcNr;
  data: string; // YYYY-MM-DD (data operacional)
  dataHora: string; // ISO ordenável
  turno: string;
  equipe: string;
  itemNumero: number | string;
  itemDescricao: string;
  observacao: string;
  operador: string;
  /** Para checklist: o momento ("Início / retomada de processo", etc.). */
  momento?: string;
  /** Para limpeza: grupo/seção. */
  grupo?: string;
}

export interface AgregadoNcNr {
  registros: RegistroNcNr[];
  totalNc: number;
  totalNr: number;
  porTurno: Map<string, { nc: number; nr: number; total: number }>;
  porItem: Map<string, { origem: OrigemNcNr; descricao: string; qtd: number }>;
}

/** Filtra checklists/turnos pelos últimos N dias (data de operação). */
function dentroDeNDias(dataIso: string, dias: number): boolean {
  const limite = new Date();
  limite.setDate(limite.getDate() - dias);
  // Usa só a parte da data
  const limiteIso = limite.toISOString().slice(0, 10);
  return dataIso >= limiteIso;
}

function extrairNcDoChecklist(c: Checklist): RegistroNcNr[] {
  const naoConformes: RespostaItem[] = c.respostas.filter(
    (r) => r.resposta === "Não conforme" && r.observacao.trim().length > 0,
  );
  return naoConformes.map((r) => ({
    origem: "checklist" as const,
    data: c.contexto.data,
    dataHora: r.horarioVerificacao || c.criadoEm,
    turno: c.contexto.turno,
    equipe: c.contexto.equipe,
    itemNumero: r.itemNumero,
    itemDescricao: r.descricao,
    observacao: r.observacao.trim(),
    operador: c.operadorResponsavel ?? c.operador ?? "—",
    momento: c.momento,
  }));
}

function extrairNrDoTurno(t: LimpezaTurno): RegistroNcNr[] {
  const nrs: LimpezaItem[] = t.itens.filter(
    (i) => i.status === "nao_realizado" && (i.observacao ?? "").trim().length > 0,
  );
  return nrs.map((i) => ({
    origem: "limpeza" as const,
    data: t.dataOperacao,
    dataHora: t.operadorAssinouEm ?? t.updatedAt ?? t.createdAt ?? new Date().toISOString(),
    turno: t.turno,
    equipe: t.turno, // limpeza não tem equipe explícita; usamos o turno
    itemNumero: i.codigo,
    itemDescricao: i.descricao,
    observacao: (i.observacao ?? "").trim(),
    operador: t.operadorNome ?? t.operadorLogin ?? "—",
    grupo: `${i.grupo} · ${i.secao}`,
  }));
}

/**
 * Agrega NC (checklist) + NR (limpeza) num único conjunto, já filtrado pelos
 * últimos `dias` dias e ordenado do mais recente pro mais antigo.
 */
export function agregarNcNr(
  checklists: Checklist[],
  turnosLimpeza: LimpezaTurno[],
  dias: number,
): AgregadoNcNr {
  const ncs = checklists
    .filter((c) => dentroDeNDias(c.contexto.data, dias))
    .flatMap(extrairNcDoChecklist);

  const nrs = turnosLimpeza
    .filter((t) => dentroDeNDias(t.dataOperacao, dias))
    .flatMap(extrairNrDoTurno);

  const todos = [...ncs, ...nrs].sort((a, b) =>
    a.dataHora < b.dataHora ? 1 : a.dataHora > b.dataHora ? -1 : 0,
  );

  const porTurno = new Map<string, { nc: number; nr: number; total: number }>();
  for (const r of todos) {
    const cur = porTurno.get(r.turno) ?? { nc: 0, nr: 0, total: 0 };
    if (r.origem === "checklist") cur.nc += 1;
    else cur.nr += 1;
    cur.total += 1;
    porTurno.set(r.turno, cur);
  }

  const porItem = new Map<
    string,
    { origem: OrigemNcNr; descricao: string; qtd: number }
  >();
  for (const r of todos) {
    const chave = `${r.origem}::${r.itemNumero}::${r.itemDescricao}`;
    const cur =
      porItem.get(chave) ??
      { origem: r.origem, descricao: r.itemDescricao, qtd: 0 };
    cur.qtd += 1;
    porItem.set(chave, cur);
  }

  return {
    registros: todos,
    totalNc: ncs.length,
    totalNr: nrs.length,
    porTurno,
    porItem,
  };
}

/** Versão leve usada na home: só os contadores. */
export function contarNcNrUltimosDias(
  checklists: Checklist[],
  turnosLimpeza: LimpezaTurno[],
  dias: number,
): { totalNc: number; totalNr: number } {
  const ag = agregarNcNr(checklists, turnosLimpeza, dias);
  return { totalNc: ag.totalNc, totalNr: ag.totalNr };
}
