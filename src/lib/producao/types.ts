import type { AssinaturaDigital, Turno } from "@/lib/checklist/types";

/** Motivo do reinício da quantidade acumulada. */
export type MotivoReinicio = "troca_sabor" | "troca_tamanho" | "cip";

/**
 * SETUP não é um evento ao lado dos outros: setup É uma destas três coisas.
 *
 * Foi o Lucas quem corrigiu — eu tinha modelado "setup" como um item irmão de
 * "troca de sabor", o que criaria a pergunta idiota "teve setup? e foi troca
 * de sabor?" para a mesma informação. Na Enchedora, houve setup exatamente
 * quando houve uma destas.
 *
 * É também o que o FM09 já dizia e eu não tinha lido direito: o momento B é
 * "Setup / longas paradas / PCM" e o C é "Pós-setup".
 */
export type TipoSetup = "troca_sabor" | "troca_tamanho" | "cip_assepsia";

/** O que ocupa a janela sem ser setup. */
export type OutroEventoHora = "pcm" | "refeicao" | "rendendo_linha";

/**
 * O que ocupou a janela de uma hora.
 *
 * Sem isto, uma hora com produção baixa é indistinguível de uma hora em que
 * a equipe estava almoçando — e é essa distinção que separa "rotina não
 * cumprida" de "parada justificada" no farol.
 *
 * Multivalorado de propósito: a refeição cai no meio de um CIP, e uma troca
 * de sabor pode vir junto com troca de tamanho. Um valor só obrigaria o
 * operador a escolher qual verdade contar.
 */
export type EventoHora = TipoSetup | OutroEventoHora;

/**
 * Uma linha horária do Relatório Operacional Horário da Enchedora
 * (FM08 PSGQ07 — frente).
 *
 * `quantidadeAcumulada` NÃO existe aqui: é sempre calculada em
 * `acumulado.ts` a partir da sequência das horas do dia.
 */
export interface ProducaoHora {
  id: string;
  folhaDiaKey: string;
  dataOperacao: string; // YYYY-MM-DD
  linha: string;
  area: string;
  maquina: string;
  equipamento: string;
  turno: Turno;
  horaCodigo: string; // H01..H24
  horaInicio: string; // "06:00"
  horaFim: string; // "07:00"
  meta: number | null;
  quantidade: number | null;
  naoRodou: boolean;
  tempoParadaMin: number | null;
  /** Marca o início de um novo bloco de acumulado. */
  reiniciaAcumulado: boolean;
  motivoReinicio: MotivoReinicio | null;
  /** O que ocupou a janela. Vazio = hora de produção normal. */
  eventos: EventoHora[];
  produtoSabor: string | null;
  produtoTamanho: string | null;
  observacao: string | null;
  operadorLogin?: string | null;
  operadorNome?: string | null;
  operadorUserId?: string | null;
  liderNome?: string | null;
  assinaturaLider?: AssinaturaDigital | null;
  liderAssinouEm?: string | null;
  ultimaEdicaoPorLogin?: string | null;
  ultimaEdicaoPorNome?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProducaoHoraEdicaoPayload {
  producaoHorariaId: string;
  folhaDiaKey: string;
  horaCodigo: string;
  editadoPorLogin: string;
  editadoPorNome: string;
  motivoEdicao?: string | null;
  antesJson: unknown;
  depoisJson: unknown;
}

/** Uma hora já com o acumulado resolvido (uso só de leitura/UI). */
export interface ProducaoHoraCalculada extends ProducaoHora {
  quantidadeAcumulada: number | null;
  /** Produto vigente no bloco (herdado do último reinício). */
  produtoVigente: string | null;
}
