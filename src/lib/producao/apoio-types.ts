import type { AssinaturaDigital, Turno } from "@/lib/checklist/types";

/** Marcação do Checklist de Apoio (uma por atividade, no turno do operador). */
export interface ApoioMarcacao {
  codigo: number;
  feito: boolean;
  marcadoEm: string | null;
}

/** Controle de Assepsia — troca de sabor p/ sabor (até 5 no dia). */
export interface AssepsiaTroca {
  ordem: number;
  sabor: string | null;
  inicio: string | null;
  fim: string | null;
}

export type CipEtapaCodigo =
  | "PRE_LAVAGEM"
  | "FIXAR_CANECAS"
  | "SODA"
  | "ENXAGUE_SODA"
  | "PERACETICO"
  | "ENXAGUE_PERACETICO"
  | "RETIRAR_CANECAS";

/** Etapa do CIP. Etapas sem horário usam apenas `feito`. */
export interface CipEtapa {
  codigo: CipEtapaCodigo;
  feito: boolean;
  inicio: string | null;
  fim: string | null;
}

/**
 * Bloco de apoio da FRENTE do relatório operacional horário:
 * Checklist de Apoio + Assepsia + CIP. Um registro por turno/operador.
 */
export interface ProducaoApoio {
  id: string;
  folhaDiaKey: string;
  dataOperacao: string;
  linha: string;
  area: string;
  maquina: string;
  equipamento: string;
  turno: Turno;
  checklist: ApoioMarcacao[];
  assepsia: AssepsiaTroca[];
  cip: CipEtapa[];
  cipObservacao: string | null;
  assinaturaOperadorCip: AssinaturaDigital | null;
  assinaturaCq: AssinaturaDigital | null;
  cqHorario: string | null;
  operadorLogin?: string | null;
  operadorNome?: string | null;
  operadorUserId?: string | null;
  ultimaEdicaoPorLogin?: string | null;
  ultimaEdicaoPorNome?: string | null;
  updatedAt?: string;
}
