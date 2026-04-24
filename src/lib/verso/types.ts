import type { AssinaturaDigital, Turno } from "@/lib/checklist/types";

// ─── PTP ─────────────────────────────────────────────────────────────
export type PtpItemCodigo =
  | "TAMPA_ALTA"
  | "ESTOURANDO"
  | "FINISH_QUEBRANDO"
  | "NIVEL_BAIXO"
  | "SEM_TAMPA";

export type PtpItemStatus = "sem_ocorrencia" | "houve_ocorrencia";

/**
 * Lançamento individual de ocorrência PTP.
 * O total acumulado de um item é a soma de `quantidade` no histórico —
 * mas mantemos `quantidade` total no PtpItem para compatibilidade e leitura rápida.
 *
 * `tipo`:
 *  - "lancamento" → entrada normal (positiva).
 *  - "correcao_zerar" → registro do operador zerando o total; `quantidade`
 *    é o oposto do total que existia naquele momento (negativo).
 */
export interface PtpLancamento {
  quantidade: number;
  horario: string; // ISO
  tipo?: "lancamento" | "correcao_zerar";
  motivo?: string | null;
  operadorLogin?: string | null;
  operadorNome?: string | null;
  operadorUserId?: string | null;
}

export interface PtpItem {
  codigo: PtpItemCodigo;
  nome: string;
  /** Total acumulado real de ocorrências (não é mais nº de "marcações"). */
  quantidade: number;
  status: PtpItemStatus;
  /** Histórico de lançamentos. Pode estar vazio em dados antigos. */
  historico?: PtpLancamento[];
}

/**
 * Análise de ângulo da janela — verificação de aderência (não é defeito).
 * São 2 verificações de 30 min por janela. Não altera o status da janela.
 */
export interface PtpAnaliseAngulo {
  v1Realizada: boolean;
  v1Em?: string | null; // ISO
  v1PorLogin?: string | null;
  v1PorNome?: string | null;
  v1PorUserId?: string | null;
  v2Realizada: boolean;
  v2Em?: string | null;
  v2PorLogin?: string | null;
  v2PorNome?: string | null;
  v2PorUserId?: string | null;
}

export type PtpJanelaStatus =
  | "pendente"
  | "rascunho"
  | "sem_ocorrencia"
  | "houve_ocorrencia"
  | "nao_rodou";

export interface PtpJanela {
  id: string;
  folhaDiaKey: string;
  dataOperacao: string; // YYYY-MM-DD
  linha: string;
  area: string;
  maquina: string;
  equipamento: string;
  janelaCodigo: string; // J01..J12
  janelaInicio: string; // "06:00"
  janelaFim: string; // "08:00"
  statusJanela: PtpJanelaStatus;
  itens: PtpItem[];
  /** Análise de ângulo (não conta como defeito). Pode ser null em dados antigos. */
  analiseAngulo?: PtpAnaliseAngulo | null;
  observacao?: string | null;
  operadorLogin?: string | null;
  operadorNome?: string | null;
  operadorUserId?: string | null;
  assinaturaOperador?: AssinaturaDigital | null;
  assinadoEm?: string | null;
  ultimaEdicaoPorLogin?: string | null;
  ultimaEdicaoPorNome?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Limpeza ─────────────────────────────────────────────────────────
export type LimpezaItemStatus = "realizado" | "nao_realizado" | "nao_aplicavel";

export interface LimpezaItem {
  codigo: number; // 1..21
  grupo: string;
  secao: string;
  descricao: string;
  status: LimpezaItemStatus | null; // null = ainda não respondido
}

export type LimpezaTurnoStatus =
  | "pendente"
  | "rascunho"
  | "aguardando_validacao"
  | "validado";

export interface LimpezaTurno {
  id: string;
  folhaDiaKey: string;
  dataOperacao: string;
  linha: string;
  area: string;
  maquina: string;
  equipamento: string;
  turno: Turno;
  status: LimpezaTurnoStatus;
  itens: LimpezaItem[];
  /** Observação livre do turno — é propagada para o campo "Observações"
   *  oficial da frente da folha do dia. */
  observacao?: string | null;
  operadorLogin?: string | null;
  operadorNome?: string | null;
  operadorUserId?: string | null;
  assinaturaOperador?: AssinaturaDigital | null;
  operadorAssinouEm?: string | null;
  liderNome?: string | null;
  assinaturaLider?: AssinaturaDigital | null;
  liderAssinouEm?: string | null;
  ultimaEdicaoPorLogin?: string | null;
  ultimaEdicaoPorNome?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Auditoria ───────────────────────────────────────────────────────
export interface PtpEdicaoPayload {
  ptpJanelaId: string;
  folhaDiaKey: string;
  janelaCodigo: string;
  editadoPorLogin: string;
  editadoPorNome: string;
  motivoEdicao?: string | null;
  antesJson: unknown;
  depoisJson: unknown;
}

export interface LimpezaEdicaoPayload {
  limpezaTurnoId: string;
  folhaDiaKey: string;
  turno: Turno;
  editadoPorLogin: string;
  editadoPorNome: string;
  motivoEdicao?: string | null;
  antesJson: unknown;
  depoisJson: unknown;
}
