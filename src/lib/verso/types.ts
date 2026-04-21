import type { AssinaturaDigital, Turno } from "@/lib/checklist/types";

// ─── PTP ─────────────────────────────────────────────────────────────
export type PtpItemCodigo =
  | "TAMPA_ALTA"
  | "ESTOURANDO"
  | "FINISH_QUEBRANDO"
  | "NIVEL_BAIXO"
  | "SEM_TAMPA";

export type PtpItemStatus = "sem_ocorrencia" | "houve_ocorrencia";

export interface PtpItem {
  codigo: PtpItemCodigo;
  nome: string;
  quantidade: number;
  status: PtpItemStatus;
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
