/**
 * AGRUPAMENTO POR ITEM RECORRENTE.
 *
 * Sem isto, a fila do líder tinha 426 linhas — uma por ocorrência. Nenhum
 * líder abre 426 planos de ação, e uma tela assim na reunião só prova que
 * o app não pensou no problema.
 *
 * Olhando o dado, quase tudo é o MESMO item se repetindo: o "dispenser de
 * sabão sem recipiente" aparece em dezenas de turnos. Não são dezenas de
 * problemas — é um problema crônico que não foi resolvido dezenas de vezes.
 *
 * Agrupando, "resolver" deixa de ser tratar ocorrência e passa a ser
 * eliminar a causa. Que é o A do PDCA que o gerente pede.
 */

import type { Pendencia } from "./pendencias";
import { faixaIdade, planoAprovado, type FaixaIdade } from "./pendencias";
import { planoDoProblema, type PlanoAcao } from "./planos-types";

export interface GrupoPendencia {
  chave: string;
  tipo: Pendencia["tipo"];
  /** Descrição do item — o que o líder lê. */
  titulo: string;
  contexto: string;
  maquina: string;
  origemTipo: "checklist" | "limpeza";
  itemNumero: number | null;

  ocorrencias: Pendencia[];
  /** Quantas vezes o problema apareceu. */
  qtd: number;
  /** Idade da ocorrência mais antiga. */
  idadeMaxDias: number;
  faixa: FaixaIdade;
  primeiraData: string;
  ultimaData: string;
  /** Turnos distintos em que apareceu — mostra se é de um turno só. */
  turnos: string[];

  /** Plano que cobre o grupo inteiro, quando existe. */
  plano: PlanoAcao | null;
  /**
   * Voltou a acontecer depois que o plano foi aprovado. Reincidência é o
   * sinal mais forte de que a causa não foi eliminada.
   */
  reincidiuAposPlano: boolean;
}

/**
 * A chave do grupo é o PROBLEMA, não a ocorrência: origem + número do item.
 * A máquina entra porque o mesmo número de item em máquinas diferentes é
 * problema diferente.
 */
function chaveGrupo(p: Pendencia): string {
  return `${p.tipo}|${p.origemTipo}|${p.maquina}|${p.itemNumero ?? "s/item"}`;
}

export function agruparPendencias(pendencias: Pendencia[], planos: PlanoAcao[]): GrupoPendencia[] {
  const mapa = new Map<string, Pendencia[]>();
  for (const p of pendencias) {
    const k = chaveGrupo(p);
    const arr = mapa.get(k) ?? [];
    arr.push(p);
    mapa.set(k, arr);
  }

  const grupos: GrupoPendencia[] = [];

  for (const [chave, ocorrencias] of mapa) {
    const ordenadas = [...ocorrencias].sort((a, b) => (a.dataOrigem < b.dataOrigem ? -1 : 1));
    const primeira = ordenadas[0];
    const ultima = ordenadas[ordenadas.length - 1];
    const idadeMaxDias = Math.max(...ocorrencias.map((o) => o.idadeDias));

    // Mesma função que pendencias.ts usa para decidir se a ocorrência está
    // coberta. Duas regras diferentes aqui era a origem do grupo aparecer
    // "com plano" enquanto as ocorrências continuavam abertas.
    const plano = planoDoProblema(
      planos,
      primeira.origemTipo,
      primeira.itemNumero,
      primeira.maquina,
    );

    // O problema voltou depois que o plano foi aprovado? Então a causa não
    // foi eliminada, por mais que o plano tenha sido "cumprido".
    const reincidiuAposPlano =
      !!plano &&
      planoAprovado(plano) &&
      !!plano.checadoEm &&
      ordenadas.some((o) => o.dataOrigem > plano.checadoEm!.slice(0, 10));

    grupos.push({
      chave,
      tipo: primeira.tipo,
      titulo: primeira.titulo,
      contexto: primeira.contexto,
      maquina: primeira.maquina,
      origemTipo: primeira.origemTipo,
      itemNumero: primeira.itemNumero,
      ocorrencias: ordenadas,
      qtd: ordenadas.length,
      idadeMaxDias,
      faixa: faixaIdade(idadeMaxDias),
      primeiraData: primeira.dataOrigem,
      ultimaData: ultima.dataOrigem,
      turnos: [...new Set(ordenadas.map((o) => o.turno))],
      plano,
      reincidiuAposPlano,
    });
  }

  // Ordem da pauta de reunião: primeiro o que reincidiu mesmo com plano,
  // depois o mais frequente, depois o mais antigo.
  return grupos.sort((a, b) => {
    if (a.reincidiuAposPlano !== b.reincidiuAposPlano) {
      return a.reincidiuAposPlano ? -1 : 1;
    }
    if (a.qtd !== b.qtd) return b.qtd - a.qtd;
    return b.idadeMaxDias - a.idadeMaxDias;
  });
}

/** A ocorrência que representa o grupo ao abrir um plano: a mais recente. */
export function ocorrenciaRepresentante(g: GrupoPendencia): Pendencia {
  return { ...g.ocorrencias[g.ocorrencias.length - 1], plano: g.plano };
}
