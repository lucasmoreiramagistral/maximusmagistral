import type { AssinaturaDigital, Turno } from "@/lib/checklist/types";

/** Bloco de passagem de turno do verso (1T / 2T / 3T). */
export type PassagemBloco = "1T" | "2T" | "3T";

/**
 * Uma linha do controle de tanques de xarope (verso do FM08 PSGQ07).
 * O formulário em papel tem 18 linhas fixas.
 */
export interface ProducaoTanque {
  id: string;
  folhaDiaKey: string;
  dataOperacao: string;
  linha: string;
  area: string;
  maquina: string;
  equipamento: string;
  turno: Turno;
  ordem: number; // 1..18
  sabor: string | null;
  tamanho: string | null;
  numeroTanque: string | null;
  lote: string | null;
  qtdInicialLitros: number | null;
  qtdFinalLitros: number | null;
  horaInicio: string | null;
  horaTermino: string | null;
  observacao: string | null;
  operadorLogin?: string | null;
  operadorNome?: string | null;
  operadorUserId?: string | null;
  ultimaEdicaoPorLogin?: string | null;
  ultimaEdicaoPorNome?: string | null;
  updatedAt?: string;
}

/** Passagem de turno: ocorrências + assinatura do operador e do líder. */
export interface ProducaoPassagem {
  id: string;
  folhaDiaKey: string;
  dataOperacao: string;
  linha: string;
  area: string;
  maquina: string;
  equipamento: string;
  turno: Turno;
  bloco: PassagemBloco;
  ocorrencias: string | null;
  assinaturaOperador: AssinaturaDigital | null;
  liderNome: string | null;
  assinaturaLider: AssinaturaDigital | null;
  operadorLogin?: string | null;
  operadorNome?: string | null;
  operadorUserId?: string | null;
  ultimaEdicaoPorLogin?: string | null;
  ultimaEdicaoPorNome?: string | null;
  updatedAt?: string;
}
