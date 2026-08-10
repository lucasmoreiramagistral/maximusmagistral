/**
 * EFICÁCIA E CUMPRIMENTO DA ROTINA DA LIDERANÇA.
 *
 * Fecha as duas pontas que faltavam dos papéis do gerente:
 *
 *   GI  → "Análise cump. Rotina Sup/Coord."
 *         A cascata só ia até o segundo andar: o supervisor auditava o
 *         líder, e ninguém auditava o supervisor.
 *
 *   ambos → "Avaliar Melhorias"
 *         O ciclo travava no C. Plano checado e pronto. Aqui a pergunta é
 *         outra: o problema PAROU de acontecer?
 *
 * Melhoria não é opinião, é o problema deixar de aparecer. A linha de base
 * já está no banco: o dispenser de sabão apareceu 151 vezes em 108 dias.
 * Se depois do plano ele some por 30 dias, isso é melhoria — e é medida,
 * não declarada.
 */

import type { GrupoPendencia } from "./grupos";
import type { PlanoAcao } from "./planos-types";
import { diffDias } from "./pendencias";

// ---------------------------------------------------------------------------
// Avaliar melhorias — a ação funcionou?
// ---------------------------------------------------------------------------

export type StatusMelhoria =
  | "sem_plano" // ninguém assumiu ainda
  | "em_execucao" // plano aberto, prazo correndo
  | "monitorando" // plano aprovado, ainda sem 30 dias limpos
  | "eliminado" // aprovado e 30 dias sem reincidir
  | "reincidiu"; // voltou depois de aprovado

/** Dias limpos exigidos para considerar um problema crônico eliminado. */
export const DIAS_PARA_ELIMINADO = 30;

export interface Melhoria {
  chave: string;
  titulo: string;
  maquina: string;
  status: StatusMelhoria;
  /** Ocorrências antes de o plano ser aprovado. */
  antes: number;
  /** Ocorrências depois da aprovação — o número que conta. */
  depois: number;
  planoAprovadoEm: string | null;
  /** Dias desde a última ocorrência. */
  diasSemOcorrer: number;
  ultimaOcorrencia: string;
}

export function avaliarMelhorias(
  grupos: GrupoPendencia[],
  hoje: string,
  gruposResolvidos: GrupoPendencia[] = [],
): Melhoria[] {
  const todos = [...grupos, ...gruposResolvidos];

  return todos
    .map((g): Melhoria => {
      const plano = g.plano;
      const aprovadoEm =
        plano && plano.status === "cumprido" && plano.checadoEm
          ? plano.checadoEm.slice(0, 10)
          : null;

      const antes = aprovadoEm
        ? g.ocorrencias.filter((o) => o.dataOrigem <= aprovadoEm).length
        : g.qtd;
      const depois = aprovadoEm
        ? g.ocorrencias.filter((o) => o.dataOrigem > aprovadoEm).length
        : 0;

      const diasSemOcorrer = diffDias(g.ultimaData, hoje);

      let status: StatusMelhoria;
      if (!plano) status = "sem_plano";
      else if (!aprovadoEm) status = "em_execucao";
      else if (depois > 0) status = "reincidiu";
      else if (diffDias(aprovadoEm, hoje) >= DIAS_PARA_ELIMINADO) status = "eliminado";
      else status = "monitorando";

      return {
        chave: g.chave,
        titulo: g.titulo,
        maquina: g.maquina,
        status,
        antes,
        depois,
        planoAprovadoEm: aprovadoEm,
        diasSemOcorrer,
        ultimaOcorrencia: g.ultimaData,
      };
    })
    .sort((a, b) => {
      // Reincidência primeiro (é o que precisa de decisão), eliminado por último.
      const ordem: Record<StatusMelhoria, number> = {
        reincidiu: 0,
        sem_plano: 1,
        em_execucao: 2,
        monitorando: 3,
        eliminado: 4,
      };
      if (ordem[a.status] !== ordem[b.status]) return ordem[a.status] - ordem[b.status];
      return b.antes - a.antes;
    });
}

export interface ResumoMelhorias {
  eliminados: number;
  monitorando: number;
  reincidiram: number;
  semPlano: number;
  /** Ocorrências que deixaram de acontecer nos problemas já eliminados. */
  ocorrenciasEvitadas: number;
}

export function resumirMelhorias(m: Melhoria[]): ResumoMelhorias {
  return {
    eliminados: m.filter((x) => x.status === "eliminado").length,
    monitorando: m.filter((x) => x.status === "monitorando").length,
    reincidiram: m.filter((x) => x.status === "reincidiu").length,
    semPlano: m.filter((x) => x.status === "sem_plano").length,
    ocorrenciasEvitadas: m
      .filter((x) => x.status === "eliminado")
      .reduce((s, x) => s + x.antes, 0),
  };
}

// ---------------------------------------------------------------------------
// Cumprimento da rotina do Sup/Coord — o terceiro andar da cascata
// ---------------------------------------------------------------------------

export interface RotinaLideranca {
  /** Problemas que já viraram plano de ação. */
  comPlano: number;
  semPlano: number;
  pctComPlano: number;
  /**
   * Dias entre o problema aparecer e alguém abrir o plano. É a medida
   * direta de "acompanhar e tratar itens NC-PA".
   */
  tempoMedioAberturaDias: number | null;
  /** Planos que venceram o prazo e ninguém destravou. */
  vencidosSemRecurso: number;
  /** Planos aguardando a checagem do líder. */
  aguardandoChecagem: number;
  planosChecados: number;
}

export function avaliarRotinaLideranca(
  grupos: GrupoPendencia[],
  planos: PlanoAcao[],
  hoje: string,
): RotinaLideranca {
  const comPlano = grupos.filter((g) => g.plano).length;
  const semPlano = grupos.length - comPlano;

  const atrasos: number[] = [];
  for (const g of grupos) {
    if (!g.plano) continue;
    const abertura = g.plano.criadoEm.slice(0, 10);
    atrasos.push(diffDias(g.primeiraData, abertura));
  }

  const abertos = planos.filter((p) => p.status === "aberto");

  return {
    comPlano,
    semPlano,
    pctComPlano: grupos.length === 0 ? 0 : Math.round((comPlano / grupos.length) * 100),
    tempoMedioAberturaDias:
      atrasos.length === 0
        ? null
        : Math.round(atrasos.reduce((s, d) => s + d, 0) / atrasos.length),
    vencidosSemRecurso: abertos.filter((p) => p.quando < hoje && !p.recursoLiberadoEm).length,
    aguardandoChecagem: abertos.filter((p) => p.quando <= hoje).length,
    planosChecados: planos.filter((p) => p.checadoEm).length,
  };
}
