import type { AssinaturaDigital, Turno } from "@/lib/checklist/types";

/** Motivo do reinício da quantidade acumulada. */
export type MotivoReinicio = "troca_sabor" | "troca_tamanho" | "cip";

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
