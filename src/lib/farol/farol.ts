/**
 * FAROL — o quadro que o gerente desenhou no papel.
 *
 * Linhas  = máquinas
 * Colunas = as ROTINAS da máquina: os 3 momentos do FM09 (A, B, C), a
 *           limpeza FM28 e o PTP. Ver COLUNAS_FAROL para o porquê de não
 *           serem só os três momentos.
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
import type { LimpezaTurno, PtpJanela } from "@/lib/verso/types";
import type { Pendencia } from "./pendencias";

/** Estado de uma célula, na ordem de gravidade (pior primeiro). */
export type EstadoFarol =
  | "nc" // não conforme, sem tratativa
  | "nr" // não realizado — o momento fechou e o checklist não foi feito
  | "pendente_validacao" // operador fechou, líder ainda não validou
  | "aguardando" // o turno ainda está correndo; ainda não é cobrança
  | "na" // não aplicável (ex.: não houve setup no turno)
  | "conforme"
  | "sem_escopo"; // máquina ainda não implantada

const GRAVIDADE: Record<EstadoFarol, number> = {
  nc: 0,
  nr: 1,
  pendente_validacao: 2,
  aguardando: 3,
  na: 4,
  conforme: 5,
  sem_escopo: 6,
};

export const ROTULO_ESTADO: Record<EstadoFarol, string> = {
  nc: "NC",
  nr: "NR",
  pendente_validacao: "!",
  aguardando: "·",
  na: "NA",
  conforme: "C",
  sem_escopo: "—",
};

export const DESCRICAO_ESTADO: Record<EstadoFarol, string> = {
  nc: "Não conforme",
  nr: "Não realizado",
  pendente_validacao: "Aguarda o líder",
  aguardando: "Turno em andamento",
  na: "Não aplicável",
  conforme: "Conforme",
  sem_escopo: "A implantar",
};

/**
 * A que etapa do PDCA cada estado chama.
 *
 * O farol não é só semáforo: cada cor diz qual letra do ciclo está parada.
 * É a leitura que o gerente pediu nos dois papéis.
 */
export const ETAPA_PDCA: Record<EstadoFarol, { letra: string; acao: string } | null> = {
  nc: { letra: "D", acao: "Liderança precisa abrir plano de ação" },
  nr: { letra: "D", acao: "Rotina não executada — cobrar operador/líder" },
  pendente_validacao: { letra: "C", acao: "Líder precisa checar e validar" },
  aguardando: null,
  na: null,
  conforme: null,
  sem_escopo: null,
};

/** Código curto do momento, como no desenho: A, B, C. */
export const CODIGO_MOMENTO = ["A", "B", "C"] as const;

/**
 * COLUNAS DO FAROL — uma por ROTINA, não uma por momento do checklist.
 *
 * O farol nasceu com três colunas, os três momentos do FM09. Aí o Lucas
 * perguntou o óbvio: "no farol tá conforme no início, no setup e no pós-setup,
 * mas nas limpezas tem vários não realizados — como a gente enxerga isso?".
 *
 * Não enxergava. O dado do dia 11/08 é o exemplo perfeito: checklist com zero
 * não conformidades nos três momentos, e a limpeza do mesmo turno com o
 * dispenser de sabão e o acúmulo de líquidos em aberto. Farol todo verde, dois
 * itens abertos.
 *
 * A limpeza é o FM28: outro formulário, 21 itens próprios, que não pertence a
 * nenhum momento do FM09. Empurrá-la para a coluna "Pós-setup" — que foi o que
 * eu fiz antes — só fazia a coluna mentir sobre o que ela mede.
 *
 * Então cada rotina ganha coluna. É o que o escopo do v2 já dizia (checklist,
 * PTP, limpeza e relatório) e o que faltava aparecer no quadro.
 */
export type TipoRotina = "checklist" | "limpeza" | "ptp";

export interface ColunaFarol {
  id: string;
  /** Rótulo curto do cabeçalho: A, B, C, L, P. */
  codigo: string;
  titulo: string;
  tipo: TipoRotina;
  /** Só para as colunas de checklist. */
  momento?: MomentoChecklist;
}

/** Janelas de 2h que o PTP espera num dia completo (J01..J12). */
export const JANELAS_PTP_DIA = 12;

export const COLUNAS_FAROL: ReadonlyArray<ColunaFarol> = [
  ...MOMENTOS_CHECKLIST.map((m, i) => ({
    id: m,
    codigo: CODIGO_MOMENTO[i],
    titulo: m,
    tipo: "checklist" as const,
    momento: m,
  })),
  { id: "limpeza", codigo: "L", titulo: "Limpeza da sala de envase", tipo: "limpeza" },
  { id: "ptp", codigo: "P", titulo: "PTP · janelas de 2h", tipo: "ptp" },
];

export interface MaquinaFarol {
  id: string;
  nome: string;
  detalhe: string;
  /** false = ainda não implantada; a linha aparece cinza. */
  ativa: boolean;
}

export interface CelulaFarol {
  maquinaId: string;
  coluna: ColunaFarol;
  estado: EstadoFarol;
  /** Itens fora do padrão nesta rotina, no dia mostrado. */
  totalNc: number;
  /**
   * Frase curta com o número que explica a cor: "2 itens não realizados",
   * "5 de 12 janelas". Sem isso a célula obriga a clicar para saber o porquê.
   */
  detalhe: string | null;
  /** Checklists encontrados para a célula (pode ser mais de um por turno). */
  checklists: Checklist[];
  /**
   * Pendências AINDA ABERTAS que caem nesta célula, de qualquer data.
   * Ordenadas da mais velha para a mais nova.
   *
   * NÃO decidem a cor da célula. A cor responde "como foi a execução do dia
   * mostrado"; o passivo responde "o que ficou para trás". Misturar as duas
   * fazia um turno impecável aparecer vermelho por causa de uma NC de maio —
   * e o operador via um vermelho que não era dele, o que é a maneira mais
   * rápida de um farol perder a confiança de quem trabalha embaixo dele.
   *
   * Nada some: o passivo aparece do lado, com a idade, e continua pintando o
   * status da máquina.
   */
  pendencias: Pendencia[];
  /**
   * Quantas dessas vieram de dias ANTERIORES ao mostrado. É o número do
   * marcador de passivo, e por isso não conta o que nasceu hoje — isso a cor
   * da célula já está dizendo.
   */
  passivoAnterior: number;
  /** Idade da pendência mais velha, em dias. 0 quando não há. */
  idadeMaxDias: number;
}

export interface LinhaFarol {
  maquina: MaquinaFarol;
  celulas: CelulaFarol[];
  /** Pior estado da EXECUÇÃO DO DIA mostrado — usado para ordenar/destacar. */
  pior: EstadoFarol;
  /** Pendências herdadas de dias anteriores, somadas na linha inteira. */
  passivoTotal: number;
  /** Idade da pendência mais velha da linha, em dias. */
  passivoIdadeMaxDias: number;
}

export interface ResumoFarol {
  /** Quantas VERIFICAÇÕES (células) estão vermelhas no dia. */
  nc: number;
  /** Quantos ITENS fora do padrão somam essas verificações. */
  ncItens: number;
  nr: number;
  pendenteValidacao: number;
  conforme: number;
  na: number;
  /** Momentos que ainda não venceram — ficam fora do denominador. */
  aguardando: number;
  /** Denominador: células de máquinas ativas cuja janela já passou. */
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
  return c.respostas.length > 0 && c.respostas.every((r) => r.resposta === "Não aplicável");
}

export interface EntradaFarol {
  checklists: Checklist[];
  /** Limpezas — alimentam a coluna Limpeza (FM28). */
  limpezas?: LimpezaTurno[];
  /** Janelas de PTP — alimentam a coluna PTP. */
  ptp?: PtpJanela[];
  /** Data operacional (YYYY-MM-DD) que o farol representa. */
  data: string;
  /** Quando informado, considera só este turno. */
  turno?: string | null;
  maquinas?: ReadonlyArray<MaquinaFarol>;
  /**
   * Pendências abertas de QUALQUER data (ver pendencias.ts). São elas que
   * mantêm a célula acesa depois que o dia vira.
   */
  pendencias?: Pendencia[];
  /**
   * Data operacional corrente. Se for igual a `data`, o dia ainda está
   * correndo: momento sem checklist vira "aguardando", não "NR".
   *
   * Indicador que acusa falha antes da hora perde credibilidade, e um farol
   * em que ninguém confia deixa de ser olhado. Só se mede contra o padrão
   * depois que a janela do padrão passou.
   */
  hoje?: string;
}

/**
 * Monta o farol.
 *
 * A cor de cada célula descreve SOMENTE a execução do dia pedido, e cada
 * rotina tem a sua regra:
 *
 *   CHECKLIST (A, B, C)
 *     sem checklist no momento     → nr, ou aguardando se o dia é hoje
 *     tem item não conforme        → nc
 *     tudo "não aplicável"         → na
 *     resto                        → conforme
 *
 *   LIMPEZA (FM28)
 *     nenhum registro no dia       → nr, ou aguardando se o dia é hoje
 *     tem item não realizado       → NC, MESMO validada pelo líder
 *     falta a assinatura do líder  → pendente_validacao
 *     resto                        → conforme
 *
 *   PTP
 *     nenhuma janela               → nr, ou aguardando se o dia é hoje
 *     alguma janela com ocorrência → nc
 *     menos de 12 janelas          → nr, ou aguardando se o dia é hoje
 *     resto                        → conforme
 *
 * A regra da limpeza é a que o Lucas decidiu, e é a mais importante: no dia
 * 11/08 a limpeza estava `validado` com dois itens em aberto. Assinatura fecha
 * o turno, não resolve o item. Tratar validado como verde seria o farol dizendo
 * que está tudo certo enquanto o dispenser de sabão segue quebrado — que é
 * literalmente o "Farol Sim/Não" do papel do gerente.
 *
 * O passivo de outros dias vem separado em `passivoAnterior`/`idadeMaxDias`.
 * Ver o comentário de `CelulaFarol`.
 */
export function montarFarol(entrada: EntradaFarol): LinhaFarol[] {
  const maquinas = entrada.maquinas ?? MAQUINAS_FAROL;
  const diaEmAndamento = !!entrada.hoje && entrada.hoje === entrada.data;

  const doDia = entrada.checklists.filter((c) => {
    if (c.contexto.data !== entrada.data) return false;
    if (entrada.turno && c.contexto.turno !== entrada.turno) return false;
    return true;
  });

  const limpezasDoDia = (entrada.limpezas ?? []).filter(
    (l) => l.dataOperacao === entrada.data && (!entrada.turno || l.turno === entrada.turno),
  );

  const ptpDoDia = (entrada.ptp ?? []).filter((p) => p.dataOperacao === entrada.data);

  return maquinas.map((maquina) => {
    const celulas: CelulaFarol[] = COLUNAS_FAROL.map((coluna) => {
      const vazia = {
        maquinaId: maquina.id,
        coluna,
        totalNc: 0,
        detalhe: null,
        checklists: [] as Checklist[],
        pendencias: [] as Pendencia[],
        passivoAnterior: 0,
        idadeMaxDias: 0,
      };

      if (!maquina.ativa) {
        return { ...vazia, estado: "sem_escopo" as EstadoFarol };
      }

      // Pendências abertas desta rotina, de qualquer data. Cada uma agora tem
      // coluna própria: as da limpeza param na coluna Limpeza em vez de serem
      // empurradas para o Pós-setup, que era o que fazia a coluna mentir.
      const pendencias = (entrada.pendencias ?? []).filter((p) => {
        if (p.maquina !== maquina.id) return false;
        if (coluna.tipo === "checklist") {
          return p.origemTipo === "checklist" && p.momento === coluna.momento;
        }
        if (coluna.tipo === "limpeza") return p.origemTipo === "limpeza";
        return false; // PTP ainda não gera pendência
      });
      const idadeMaxDias = pendencias.reduce((m, p) => Math.max(m, p.idadeDias), 0);
      const passivoAnterior = pendencias.filter((p) => p.dataOrigem < entrada.data).length;
      const base = { ...vazia, pendencias, idadeMaxDias, passivoAnterior };

      // ── LIMPEZA ────────────────────────────────────────────────────────
      if (coluna.tipo === "limpeza") {
        const doDiaMaquina = limpezasDoDia.filter(
          (l) => (l.maquina ?? "Enchedora 3") === maquina.id,
        );
        if (doDiaMaquina.length === 0) {
          return { ...base, estado: diaEmAndamento ? "aguardando" : "nr" };
        }

        const naoRealizados = doDiaMaquina.reduce(
          (s, l) => s + (l.itens ?? []).filter((i) => i.status === "nao_realizado").length,
          0,
        );
        const semValidacao = doDiaMaquina.filter((l) => l.status === "aguardando_validacao").length;

        if (naoRealizados > 0) {
          // Vermelha mesmo validada. Assinatura fecha o turno, não resolve o item.
          return {
            ...base,
            estado: "nc" as EstadoFarol,
            totalNc: naoRealizados,
            detalhe:
              `${naoRealizados} ${naoRealizados === 1 ? "item não realizado" : "itens não realizados"}` +
              (semValidacao > 0 ? " · sem validação" : " · já validada"),
          };
        }
        if (semValidacao > 0) {
          return {
            ...base,
            estado: "pendente_validacao" as EstadoFarol,
            detalhe: `${semValidacao} turno(s) sem assinatura do líder`,
          };
        }
        return {
          ...base,
          estado: "conforme" as EstadoFarol,
          detalhe: `${doDiaMaquina.length} turno(s) · 21 itens`,
        };
      }

      // ── PTP ────────────────────────────────────────────────────────────
      if (coluna.tipo === "ptp") {
        const doDiaMaquina = ptpDoDia.filter((p) => p.maquina === maquina.id);
        if (doDiaMaquina.length === 0) {
          return { ...base, estado: diaEmAndamento ? "aguardando" : "nr" };
        }

        const comOcorrencia = doDiaMaquina.filter(
          (p) => p.statusJanela === "houve_ocorrencia",
        ).length;
        const preenchidas = new Set(doDiaMaquina.map((p) => p.janelaCodigo)).size;
        const detalhe = `${preenchidas} de ${JANELAS_PTP_DIA} janelas`;

        if (comOcorrencia > 0) {
          return {
            ...base,
            estado: "nc" as EstadoFarol,
            totalNc: comOcorrencia,
            detalhe: `${comOcorrencia} com ocorrência · ${detalhe}`,
          };
        }
        if (preenchidas < JANELAS_PTP_DIA) {
          return { ...base, estado: diaEmAndamento ? "aguardando" : "nr", detalhe };
        }
        return { ...base, estado: "conforme" as EstadoFarol, detalhe };
      }

      // ── CHECKLIST (A, B, C) ────────────────────────────────────────────
      const daCelula = doDia.filter(
        (c) => c.contexto.maquina === maquina.id && c.momento === coluna.momento,
      );
      const totalNc = daCelula.reduce((s, c) => s + contarNcDoChecklist(c), 0);

      // A cor descreve o DIA MOSTRADO, e só ele.
      //
      // A versão anterior deixava o passivo mandar na célula: uma NC de maio
      // pintava de vermelho o checklist de hoje, ainda que o turno de hoje
      // estivesse impecável. Isso resolvia um problema real (o farol de evento
      // escondia 108 dias de pendência) criando outro: cobrar do turno de hoje
      // uma falha que não é dele.
      //
      // O passivo não sumiu — sai em `passivoAnterior`/`idadeMaxDias`, aparece
      // do lado da célula com a idade e pinta o status da máquina.
      //
      // A limpeza saiu daqui de vez: ela tem coluna própria agora, e o estado
      // dela não contamina mais a coluna do checklist.
      let estado: EstadoFarol;
      if (daCelula.length === 0) {
        estado = diaEmAndamento ? "aguardando" : "nr";
      } else if (totalNc > 0) {
        estado = "nc";
      } else if (daCelula.every(todoNaoAplicavel)) {
        estado = "na";
      } else {
        estado = "conforme";
      }

      return {
        ...base,
        estado,
        totalNc,
        detalhe: totalNc > 0 ? `${totalNc} ${totalNc === 1 ? "item" : "itens"}` : null,
        checklists: daCelula,
        pendencias,
        passivoAnterior,
        idadeMaxDias,
      };
    });

    const pior = celulas.reduce<EstadoFarol>(
      (acc, c) => (GRAVIDADE[c.estado] < GRAVIDADE[acc] ? c.estado : acc),
      "sem_escopo",
    );

    // Agora toda pendência tem coluna: a da limpeza mora na coluna Limpeza.
    // O `pendenciasSemMomento` da versão anterior deixou de existir — era o
    // remendo de quando a limpeza não tinha onde aparecer.
    const passivoTotal = celulas.reduce((s, c) => s + c.passivoAnterior, 0);
    const passivoIdadeMaxDias = celulas.reduce((m, c) => Math.max(m, c.idadeMaxDias), 0);

    return { maquina, celulas, pior, passivoTotal, passivoIdadeMaxDias };
  });
}

export function resumirFarol(linhas: LinhaFarol[]): ResumoFarol {
  const r: ResumoFarol = {
    nc: 0,
    nr: 0,
    pendenteValidacao: 0,
    conforme: 0,
    na: 0,
    aguardando: 0,
    totalAvaliado: 0,
  };
  for (const linha of linhas) {
    for (const c of linha.celulas) {
      if (c.estado === "sem_escopo") continue;
      // Momento que ainda não venceu não entra na conta: não é acerto nem erro.
      if (c.estado === "aguardando") {
        r.aguardando += 1;
        continue;
      }
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

// ---------------------------------------------------------------------------
// Cumprimento da rotina ao longo do tempo — a visão do Sup/Coord
//
// O líder olha o turno. O Sup/Coord olha a série: "Análise cumprimento
// Rotina Op/Líder" do 2º papel. Não é sobre a NC de hoje, é sobre a rotina
// estar sendo cumprida todo dia, por todo turno.
// ---------------------------------------------------------------------------

/**
 * A rotina que a máquina DEVERIA cumprir — o denominador.
 *
 * Precisa ser configuração, não dedução. A versão anterior derivava o esperado
 * dos registros que apareceram: para cada dia, cada turno que deu sinal de vida
 * deveria ter os 3 momentos. Parecia justo (não punia dia de máquina parada) e
 * tinha um buraco fatal — um turno que não registrou NADA simplesmente sumia do
 * denominador. O indicador era, por construção, incapaz de enxergar turno
 * esquecido, que é justamente a falha que ele existe para pegar.
 *
 * O dado real da Enchedora 3 fecha a discussão. Em 108 dias houve 23 dias com
 * um turno só. Cruzando com as janelas de PTP para saber se a máquina rodava no
 * turno que faltou:
 *
 *   - 1 dia   → o turno RODOU e não fez checklist (PTP preenchido nas horas dele)
 *   - 22 dias → nenhum registro de nada: nem checklist, nem PTP
 *
 * Ou seja: em 22 dias o banco não sabe dizer se a máquina rodou. Não dá para
 * chutar "rodou" (culpa quem estava parado) nem "não rodou" (absolve quem
 * esqueceu). Então nem se chuta: vira SEM INFORMAÇÃO, uma terceira coluna, que
 * é o número honesto e o que o gerente precisa ver para cobrar.
 *
 * Só sai do denominador o que tiver parada justificada e registrada.
 */
export interface RotinaEsperada {
  /** Turnos que a máquina está programada para rodar, todo dia. */
  turnos: ReadonlyArray<string>;
  /**
   * Data em que o v2 entrou no ar. Antes disso não se cobra cumprimento: o
   * passivo histórico existe e aparece em tela própria, mas não faz sentido
   * medir contra uma regra que ainda não valia. Sem isto o v2 nasce com 4
   * meses de vermelho que ninguém tem como responder.
   */
  vigenteDesde: string;
}

/**
 * Parada com motivo registrado e validada — o único jeito de um turno sair do
 * denominador. Enquanto o Relatório Operacional não estiver em uso (a tabela
 * producao_horaria está zerada hoje), esta lista chega vazia e todo turno
 * esperado sem registro cai em "sem informação". É o comportamento correto:
 * ausência de dado é ausência de dado, não é máquina parada.
 */
export interface ParadaJustificada {
  data: string;
  turno: string;
  motivo: string;
}

/**
 * A rotina programada da Enchedora 3 no piloto.
 *
 * ATENÇÃO — os dois valores abaixo são decisão do gerente, não do código:
 *
 *   `turnos`        Assume que a Enchedora 3 é programada para os dois turnos
 *                   todo dia. É o que o histórico sugere (70 dos 108 dias têm
 *                   os dois), mas não há no banco nada que DIGA a programação.
 *                   Se houver dia de um turno só por escala, isto tem que
 *                   virar uma agenda por data em vez de uma lista fixa.
 *
 *   `vigenteDesde`  Data de entrada do v2. Enquanto não for definida, está no
 *                   dia em que o farol novo foi montado, para o indicador não
 *                   nascer cobrando 4 meses de uma regra que não valia.
 *                   O passivo histórico não é apagado: ele vive nas pendências,
 *                   com idade, em tela própria.
 */
export const ROTINA_ENCHEDORA_3: RotinaEsperada = {
  turnos: ["12x36 Dia", "12x36 Noite"],
  vigenteDesde: "2026-08-10",
};

export interface DiaCumprimento {
  data: string;
  /** Momentos esperados no dia, já descontada parada justificada. */
  esperado: number;
  realizado: number;
  /** Momentos esperados sem nenhum registro e sem justificativa. */
  semInformacao: number;
  /** Momentos que saíram da conta por parada justificada. */
  justificado: number;
  /** Limpezas do dia que o líder nunca validou. */
  limpezasSemValidacao: number;
  percentual: number;
}

export interface CumprimentoPeriodo {
  dias: DiaCumprimento[];
  totalEsperado: number;
  totalRealizado: number;
  percentualGeral: number;
  /**
   * Momentos esperados sobre os quais o sistema não sabe nada. Não são acerto
   * nem erro — são buraco, e é o primeiro número que a liderança tem que
   * atacar. Fica separado justamente para não ser confundido com cumprimento.
   */
  totalSemInformacao: number;
  totalJustificado: number;
  /** O dia corrente ficou de fora por ainda estar em andamento. */
  excluiuDiaEmAndamento: boolean;
  /** Dias no período sem nenhum checklist. */
  diasSemNada: number;
  limpezasSemValidacao: number;
  /** Por turno: quanto do esperado foi cumprido. */
  porTurno: Array<{ turno: string; esperado: number; realizado: number; percentual: number }>;
}

function listarDias(de: string, ate: string): string[] {
  const out: string[] = [];
  const d = new Date(`${de}T12:00:00Z`);
  const fim = new Date(`${ate}T12:00:00Z`);
  while (d <= fim) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Calcula o cumprimento no período.
 *
 * O esperado vem da `rotina` (configuração), nunca dos registros encontrados.
 * Cada turno programado no dia vale 3 momentos. Desse total saem apenas as
 * paradas justificadas; o resto se divide em REALIZADO e SEM INFORMAÇÃO.
 *
 * O percentual é realizado ÷ (esperado − justificado). "Sem informação" fica
 * dentro do denominador de propósito: turno esquecido tem que doer no número,
 * senão esquecer vira a estratégia ótima.
 *
 * Dias anteriores a `rotina.vigenteDesde` não entram — ver RotinaEsperada.
 */
export function calcularCumprimentoPeriodo(
  checklists: Checklist[],
  limpezas: LimpezaTurno[],
  de: string,
  ate: string,
  rotina: RotinaEsperada,
  maquina = "Enchedora 3",
  paradas: ParadaJustificada[] = [],
  /**
   * Dia operacional ainda em andamento. Fica FORA da conta.
   *
   * Sem isto, o turno que ainda nem começou já entra como "sem informação":
   * às 8h da manhã o turno da noite daquele dia apareceria como buraco, e o
   * painel cobraria uma rotina cuja janela não passou. É o mesmo cuidado que
   * `montarFarol` toma com o estado `aguardando` — indicador que acusa falha
   * antes da hora perde a credibilidade, e farol em que ninguém confia deixa
   * de ser olhado.
   *
   * Cumprimento é medido sobre dia FECHADO. O dia de hoje quem mostra é o
   * farol, que existe exatamente para isso.
   */
  diaEmAndamento: string | null = null,
): CumprimentoPeriodo {
  const dias = listarDias(de, ate).filter((d) => d >= rotina.vigenteDesde && d !== diaEmAndamento);
  const porTurnoAcc = new Map<string, { esperado: number; realizado: number }>();

  const justificadas = new Set(paradas.map((p) => `${p.data}|${p.turno}`));

  const detalhe: DiaCumprimento[] = dias.map((dia) => {
    const cs = checklists.filter((c) => c.contexto.data === dia && c.contexto.maquina === maquina);
    const ls = limpezas.filter((l) => l.dataOperacao === dia);

    let esperado = 0;
    let realizado = 0;
    let semInformacao = 0;
    let justificado = 0;

    // Itera sobre os turnos PROGRAMADOS, não sobre os que apareceram. É esta
    // linha que faz o turno esquecido existir na conta.
    for (const turno of rotina.turnos) {
      if (justificadas.has(`${dia}|${turno}`)) {
        justificado += MOMENTOS_CHECKLIST.length;
        continue;
      }

      const feitos = new Set(cs.filter((c) => c.contexto.turno === turno).map((c) => c.momento))
        .size;
      const temAlgumSinal = feitos > 0 || ls.some((l) => l.turno === turno);

      esperado += MOMENTOS_CHECKLIST.length;
      realizado += feitos;
      // Turno sem nenhum sinal de vida: o sistema não sabe se rodou. Não é
      // acerto nem erro — é buraco, e vai contado como tal.
      if (!temAlgumSinal) semInformacao += MOMENTOS_CHECKLIST.length;

      const acc = porTurnoAcc.get(turno) ?? { esperado: 0, realizado: 0 };
      acc.esperado += MOMENTOS_CHECKLIST.length;
      acc.realizado += feitos;
      porTurnoAcc.set(turno, acc);
    }

    const semValidacao = ls.filter((l) => l.status === "aguardando_validacao").length;

    return {
      data: dia,
      esperado,
      realizado,
      semInformacao,
      justificado,
      limpezasSemValidacao: semValidacao,
      percentual: esperado === 0 ? 0 : Math.round((realizado / esperado) * 100),
    };
  });

  const totalEsperado = detalhe.reduce((s, d) => s + d.esperado, 0);
  const totalRealizado = detalhe.reduce((s, d) => s + d.realizado, 0);

  return {
    dias: detalhe,
    totalEsperado,
    totalRealizado,
    percentualGeral: totalEsperado === 0 ? 0 : Math.round((totalRealizado / totalEsperado) * 100),
    totalSemInformacao: detalhe.reduce((s, d) => s + d.semInformacao, 0),
    totalJustificado: detalhe.reduce((s, d) => s + d.justificado, 0),
    excluiuDiaEmAndamento: !!diaEmAndamento && diaEmAndamento >= de && diaEmAndamento <= ate,
    diasSemNada: detalhe.filter((d) => d.realizado === 0 && d.esperado > 0).length,
    limpezasSemValidacao: detalhe.reduce((s, d) => s + d.limpezasSemValidacao, 0),
    porTurno: [...porTurnoAcc.entries()]
      .map(([turno, v]) => ({
        turno,
        ...v,
        percentual: v.esperado === 0 ? 0 : Math.round((v.realizado / v.esperado) * 100),
      }))
      .sort((a, b) => a.percentual - b.percentual),
  };
}
