/**
 * FAROL — o quadro que o gerente desenhou no papel.
 *
 * Linhas  = máquinas
 * Colunas = os 3 momentos do checklist (A, B, C)
 * Célula  = C / NC / NA / NR, na legenda do próprio FM09
 *
 * Por que NR ("não realizado") pesa igual a NC:
 * em 525 checklists de 3 meses e meio a Enchedora 3 gerou 4 não
 * conformidades. Um farol alimentado só por NC ficaria verde quase sempre
 * e não serviria para nada. O que de fato falha é o preenchimento e a
 * validação — e é isso que o 2º papel manda o Sup/Coord e a GI cobrarem
 * ("Análise cumprimento Rotina Op/Líder").
 */

import type { Checklist, MomentoChecklist } from "@/lib/checklist/types";
import { MOMENTOS_CHECKLIST } from "@/lib/checklist/types";
import type { LimpezaTurno } from "@/lib/verso/types";

/** Estado de uma célula, na ordem de gravidade (pior primeiro). */
export type EstadoFarol =
  | "nc" // não conforme, sem tratativa
  | "nr" // não realizado — o checklist daquele momento não foi feito
  | "pendente_validacao" // operador fechou, líder ainda não validou
  | "na" // não aplicável (ex.: não houve setup no turno)
  | "conforme"
  | "sem_escopo"; // máquina ainda não implantada

const GRAVIDADE: Record<EstadoFarol, number> = {
  nc: 0,
  nr: 1,
  pendente_validacao: 2,
  na: 3,
  conforme: 4,
  sem_escopo: 5,
};

export const ROTULO_ESTADO: Record<EstadoFarol, string> = {
  nc: "NC",
  nr: "NR",
  pendente_validacao: "!",
  na: "NA",
  conforme: "C",
  sem_escopo: "—",
};

export const DESCRICAO_ESTADO: Record<EstadoFarol, string> = {
  nc: "Não conforme",
  nr: "Não realizado",
  pendente_validacao: "Aguarda o líder",
  na: "Não aplicável",
  conforme: "Conforme",
  sem_escopo: "A implantar",
};

/** Código curto do momento, como no desenho: A, B, C. */
export const CODIGO_MOMENTO = ["A", "B", "C"] as const;

export interface MaquinaFarol {
  id: string;
  nome: string;
  detalhe: string;
  /** false = ainda não implantada; a linha aparece cinza. */
  ativa: boolean;
}

export interface CelulaFarol {
  maquinaId: string;
  momento: MomentoChecklist;
  momentoIndice: number;
  estado: EstadoFarol;
  /** Quantos itens NC existem nos checklists daquele momento. */
  totalNc: number;
  /** Checklists encontrados para a célula (pode ser mais de um por turno). */
  checklists: Checklist[];
}

export interface LinhaFarol {
  maquina: MaquinaFarol;
  celulas: CelulaFarol[];
  /** Pior estado da linha — usado para ordenar/destacar. */
  pior: EstadoFarol;
}

export interface ResumoFarol {
  nc: number;
  nr: number;
  pendenteValidacao: number;
  conforme: number;
  na: number;
  /** Denominador: células de máquinas ativas. */
  totalAvaliado: number;
}

/**
 * Máquinas do farol. Hoje só a Enchedora 3 está implantada; as demais
 * ficam cinza para mostrar o caminho de expansão sem prometer o que não existe.
 *
 * Os nomes vêm do V-GRAF do FM0x (Análise Horária de Liderança), que lista
 * as máquinas reais da linha: Optima, Enchedora, Rotuladora, Empacotadora.
 */
export const MAQUINAS_FAROL: ReadonlyArray<MaquinaFarol> = [
  { id: "Enchedora 3", nome: "Enchedora 3", detalhe: "Zegla 50V", ativa: true },
  { id: "Sopradora Optima", nome: "Sopradora Optima", detalhe: "Sopro", ativa: false },
  { id: "Rotuladora 3", nome: "Rotuladora 3", detalhe: "Rotulagem", ativa: false },
  { id: "Empacotadora 3", nome: "Empacotadora 3", detalhe: "Empacotamento", ativa: false },
];

function contarNcDoChecklist(c: Checklist): number {
  return c.respostas.filter((r) => r.resposta === "Não conforme").length;
}

/** Todas as respostas do checklist são "Não aplicável"? */
function todoNaoAplicavel(c: Checklist): boolean {
  return (
    c.respostas.length > 0 &&
    c.respostas.every((r) => r.resposta === "Não aplicável")
  );
}

export interface EntradaFarol {
  checklists: Checklist[];
  /** Limpezas do dia — alimentam o estado "aguarda o líder". */
  limpezas?: LimpezaTurno[];
  /** Data operacional (YYYY-MM-DD) que o farol representa. */
  data: string;
  /** Quando informado, considera só este turno. */
  turno?: string | null;
  maquinas?: ReadonlyArray<MaquinaFarol>;
}

/**
 * Monta o farol.
 *
 * Regra de cada célula, na ordem em que decide:
 *   1. máquina não implantada       → sem_escopo
 *   2. nenhum checklist no momento  → nr   (é o caso que mais acontece)
 *   3. tem item não conforme        → nc
 *   4. concluído mas sem validação  → pendente_validacao
 *   5. tudo "não aplicável"         → na
 *   6. resto                        → conforme
 */
export function montarFarol(entrada: EntradaFarol): LinhaFarol[] {
  const maquinas = entrada.maquinas ?? MAQUINAS_FAROL;

  const doDia = entrada.checklists.filter((c) => {
    if (c.contexto.data !== entrada.data) return false;
    if (entrada.turno && c.contexto.turno !== entrada.turno) return false;
    return true;
  });

  const limpezaPendente = (entrada.limpezas ?? []).some(
    (l) =>
      l.dataOperacao === entrada.data &&
      (!entrada.turno || l.turno === entrada.turno) &&
      l.status === "aguardando_validacao",
  );

  return maquinas.map((maquina) => {
    const celulas: CelulaFarol[] = MOMENTOS_CHECKLIST.map((momento, i) => {
      if (!maquina.ativa) {
        return {
          maquinaId: maquina.id,
          momento,
          momentoIndice: i,
          estado: "sem_escopo" as EstadoFarol,
          totalNc: 0,
          checklists: [],
        };
      }

      const daCelula = doDia.filter(
        (c) => c.contexto.maquina === maquina.id && c.momento === momento,
      );

      let estado: EstadoFarol;
      const totalNc = daCelula.reduce((s, c) => s + contarNcDoChecklist(c), 0);

      if (daCelula.length === 0) {
        estado = "nr";
      } else if (totalNc > 0) {
        estado = "nc";
      } else if (daCelula.every((c) => c.status === "concluido") && limpezaPendente) {
        estado = "pendente_validacao";
      } else if (daCelula.every(todoNaoAplicavel)) {
        estado = "na";
      } else {
        estado = "conforme";
      }

      return {
        maquinaId: maquina.id,
        momento,
        momentoIndice: i,
        estado,
        totalNc,
        checklists: daCelula,
      };
    });

    const pior = celulas.reduce<EstadoFarol>(
      (acc, c) => (GRAVIDADE[c.estado] < GRAVIDADE[acc] ? c.estado : acc),
      "sem_escopo",
    );

    return { maquina, celulas, pior };
  });
}

export function resumirFarol(linhas: LinhaFarol[]): ResumoFarol {
  const r: ResumoFarol = {
    nc: 0,
    nr: 0,
    pendenteValidacao: 0,
    conforme: 0,
    na: 0,
    totalAvaliado: 0,
  };
  for (const linha of linhas) {
    for (const c of linha.celulas) {
      if (c.estado === "sem_escopo") continue;
      r.totalAvaliado += 1;
      if (c.estado === "nc") r.nc += 1;
      else if (c.estado === "nr") r.nr += 1;
      else if (c.estado === "pendente_validacao") r.pendenteValidacao += 1;
      else if (c.estado === "na") r.na += 1;
      else r.conforme += 1;
    }
  }
  return r;
}

/** Percentual de cumprimento: o que foi feito sobre o que era esperado. */
export function percentualCumprimento(resumo: ResumoFarol): number {
  if (resumo.totalAvaliado === 0) return 0;
  const feito = resumo.totalAvaliado - resumo.nr;
  return Math.round((feito / resumo.totalAvaliado) * 100);
}
