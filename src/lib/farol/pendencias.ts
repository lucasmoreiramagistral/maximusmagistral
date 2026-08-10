/**
 * PENDÊNCIAS ABERTAS — o passivo que o farol tem que mostrar.
 *
 * O farol que eu tinha feito era de EVENTO: mostrava o que aconteceu no dia
 * escolhido. Passou o dia, sumia. O Lucas apontou o furo e o banco confirmou:
 *
 *   - 56 limpezas sem validação do líder, a mais antiga de 24/04 (108 dias)
 *   - 4 NCs abertas desde maio/junho, ZERO resoluções registradas
 *
 * E mesmo assim o farol de hoje dizia "Ciclo em dia — nada exigindo ação".
 *
 * Uma não conformidade não some porque virou a data. Ela fica aberta até
 * alguém resolver. Então o farol é de ESTADO: a célula fica acesa enquanto
 * houver pendência, não importa de quando ela é — e mostra a idade, porque
 * uma NC de 60 dias tem que gritar mais alto que a de ontem.
 */

import type { Checklist } from "@/lib/checklist/types";
import type { LimpezaTurno } from "@/lib/verso/types";
import type { PlanoAcao } from "./planos-types";

export type TipoPendencia = "nc" | "validacao";

export interface Pendencia {
  chave: string;
  tipo: TipoPendencia;
  maquina: string;
  momento: string | null;
  turno: string;
  /** Dia em que a pendência nasceu. */
  dataOrigem: string;
  /** Dias em aberto até hoje. */
  idadeDias: number;
  titulo: string;
  detalhe: string;
  /** Plano de ação vigente, quando já existe. */
  plano: PlanoAcao | null;
  origemTipo: "checklist" | "limpeza";
  origemId: string;
  itemNumero: number | null;
}

export function diffDias(de: string, ate: string): number {
  const a = Date.parse(`${de}T00:00:00Z`);
  const b = Date.parse(`${ate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * Um plano encerra a pendência quando foi checado e o item saiu da NC.
 * Plano reprovado (`nao_cumprido`) NÃO encerra: volta pro vermelho, que é
 * exatamente o "Farol Sim/Não" do papel.
 */
export function planoEncerraPendencia(p: PlanoAcao | null | undefined): boolean {
  if (!p) return false;
  return p.status === "cumprido" && p.checagemSaiuNc === true;
}

/** O plano mais recente que aponta para esta origem. */
function planoVigente(
  planos: PlanoAcao[],
  origemTipo: "checklist" | "limpeza",
  origemId: string,
  itemNumero: number | null,
): PlanoAcao | null {
  const candidatos = planos
    .filter(
      (p) =>
        p.origemTipo === origemTipo &&
        p.origemId === origemId &&
        (itemNumero === null || p.itemNumero === itemNumero) &&
        p.status !== "cancelado",
    )
    .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
  return candidatos[0] ?? null;
}

export interface EntradaPendencias {
  checklists: Checklist[];
  limpezas: LimpezaTurno[];
  planos: PlanoAcao[];
  /** Data de referência para calcular a idade. */
  hoje: string;
}

/**
 * Levanta tudo que está em aberto AGORA, de qualquer data.
 *
 * Duas fontes:
 *   1. item do checklist respondido "Não conforme" sem plano concluído
 *   2. limpeza em "aguardando_validacao" — o líder nunca fechou
 */
export function levantarPendencias(e: EntradaPendencias): Pendencia[] {
  const out: Pendencia[] = [];

  for (const c of e.checklists) {
    for (const r of c.respostas) {
      if (r.resposta !== "Não conforme") continue;
      const plano = planoVigente(e.planos, "checklist", c.id, r.itemNumero);
      if (planoEncerraPendencia(plano)) continue;

      out.push({
        chave: `nc:${c.id}:${r.itemNumero}`,
        tipo: "nc",
        maquina: c.contexto.maquina,
        momento: c.momento,
        turno: c.contexto.turno,
        dataOrigem: c.contexto.data,
        idadeDias: diffDias(c.contexto.data, e.hoje),
        titulo: `Item ${r.itemNumero} — ${r.descricao}`,
        detalhe: r.observacao || "sem ação registrada pelo operador",
        plano,
        origemTipo: "checklist",
        origemId: c.id,
        itemNumero: r.itemNumero,
      });
    }
  }

  for (const l of e.limpezas) {
    if (l.status !== "aguardando_validacao") continue;
    const plano = planoVigente(e.planos, "limpeza", l.id, null);
    if (planoEncerraPendencia(plano)) continue;

    out.push({
      chave: `val:${l.id}`,
      tipo: "validacao",
      maquina: l.maquina ?? "Enchedora 3",
      momento: null,
      turno: l.turno,
      dataOrigem: l.dataOperacao,
      idadeDias: diffDias(l.dataOperacao, e.hoje),
      titulo: "Limpeza da sala de envase sem validação",
      detalhe: l.operadorNome
        ? `Operador ${l.operadorNome} assinou; o líder nunca fechou.`
        : "O líder nunca fechou.",
      plano,
      origemTipo: "limpeza",
      origemId: l.id,
      itemNumero: null,
    });
  }

  // Mais velha primeiro: é a que envergonha e a que tem que sair.
  return out.sort((a, b) => b.idadeDias - a.idadeDias);
}

/** Faixa de envelhecimento — o aging que um black belt procura primeiro. */
export type FaixaIdade = "hoje" | "ate7" | "ate30" | "acima30";

export function faixaIdade(dias: number): FaixaIdade {
  if (dias <= 0) return "hoje";
  if (dias <= 7) return "ate7";
  if (dias <= 30) return "ate30";
  return "acima30";
}

export const ROTULO_FAIXA: Record<FaixaIdade, string> = {
  hoje: "Hoje",
  ate7: "Até 7 dias",
  ate30: "8 a 30 dias",
  acima30: "Mais de 30 dias",
};

export function agruparPorIdade(p: Pendencia[]): Array<{
  faixa: FaixaIdade;
  rotulo: string;
  qtd: number;
}> {
  const ordem: FaixaIdade[] = ["acima30", "ate30", "ate7", "hoje"];
  const c = new Map<FaixaIdade, number>();
  for (const x of p) c.set(faixaIdade(x.idadeDias), (c.get(faixaIdade(x.idadeDias)) ?? 0) + 1);
  return ordem
    .filter((f) => (c.get(f) ?? 0) > 0)
    .map((f) => ({ faixa: f, rotulo: ROTULO_FAIXA[f], qtd: c.get(f) ?? 0 }));
}
