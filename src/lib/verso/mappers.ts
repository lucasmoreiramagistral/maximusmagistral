import type { AssinaturaDigital, Turno } from "@/lib/checklist/types";
import type {
  LimpezaItem,
  LimpezaTurno,
  LimpezaTurnoStatus,
  PtpItem,
  PtpJanela,
  PtpJanelaStatus,
} from "./types";

// ─── PTP ─────────────────────────────────────────────────────────────
export interface PtpJanelaRow {
  id: string;
  folha_dia_key: string;
  data_operacao: string;
  linha: string;
  area: string;
  maquina: string;
  equipamento: string;
  janela_codigo: string;
  janela_inicio: string;
  janela_fim: string;
  status_janela: PtpJanelaStatus;
  itens_json: PtpItem[];
  observacao: string | null;
  operador_login: string | null;
  operador_nome: string | null;
  operador_user_id: string | null;
  assinatura_operador: AssinaturaDigital | null;
  assinado_em: string | null;
  ultima_edicao_por_login: string | null;
  ultima_edicao_por_nome: string | null;
  created_at?: string;
  updated_at?: string;
}

export function ptpJanelaFromRow(r: PtpJanelaRow): PtpJanela {
  return {
    id: r.id,
    folhaDiaKey: r.folha_dia_key,
    dataOperacao: r.data_operacao,
    linha: r.linha,
    area: r.area,
    maquina: r.maquina,
    equipamento: r.equipamento,
    janelaCodigo: r.janela_codigo,
    janelaInicio: r.janela_inicio,
    janelaFim: r.janela_fim,
    statusJanela: r.status_janela,
    itens: Array.isArray(r.itens_json) ? r.itens_json : [],
    observacao: r.observacao,
    operadorLogin: r.operador_login,
    operadorNome: r.operador_nome,
    operadorUserId: r.operador_user_id,
    assinaturaOperador: r.assinatura_operador,
    assinadoEm: r.assinado_em,
    ultimaEdicaoPorLogin: r.ultima_edicao_por_login,
    ultimaEdicaoPorNome: r.ultima_edicao_por_nome,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function ptpJanelaToRow(j: PtpJanela, userId: string | null): PtpJanelaRow {
  return {
    id: j.id,
    folha_dia_key: j.folhaDiaKey,
    data_operacao: j.dataOperacao,
    linha: j.linha,
    area: j.area,
    maquina: j.maquina,
    equipamento: j.equipamento,
    janela_codigo: j.janelaCodigo,
    janela_inicio: j.janelaInicio,
    janela_fim: j.janelaFim,
    status_janela: j.statusJanela,
    itens_json: j.itens,
    observacao: j.observacao ?? null,
    operador_login: j.operadorLogin ?? null,
    operador_nome: j.operadorNome ?? null,
    operador_user_id: j.operadorUserId ?? userId,
    assinatura_operador: j.assinaturaOperador ?? null,
    assinado_em: j.assinadoEm ?? null,
    ultima_edicao_por_login: j.ultimaEdicaoPorLogin ?? null,
    ultima_edicao_por_nome: j.ultimaEdicaoPorNome ?? null,
  };
}

// ─── Limpeza ─────────────────────────────────────────────────────────
export interface LimpezaTurnoRow {
  id: string;
  folha_dia_key: string;
  data_operacao: string;
  linha: string;
  area: string;
  maquina: string;
  equipamento: string;
  turno: Turno;
  status: LimpezaTurnoStatus;
  itens_json: LimpezaItem[];
  observacao: string | null;
  operador_login: string | null;
  operador_nome: string | null;
  operador_user_id: string | null;
  assinatura_operador: AssinaturaDigital | null;
  operador_assinou_em: string | null;
  lider_nome: string | null;
  assinatura_lider: AssinaturaDigital | null;
  lider_assinou_em: string | null;
  ultima_edicao_por_login: string | null;
  ultima_edicao_por_nome: string | null;
  created_at?: string;
  updated_at?: string;
}

export function limpezaTurnoFromRow(r: LimpezaTurnoRow): LimpezaTurno {
  return {
    id: r.id,
    folhaDiaKey: r.folha_dia_key,
    dataOperacao: r.data_operacao,
    linha: r.linha,
    area: r.area,
    maquina: r.maquina,
    equipamento: r.equipamento,
    turno: r.turno,
    status: r.status,
    itens: Array.isArray(r.itens_json) ? r.itens_json : [],
    observacao: r.observacao,
    operadorLogin: r.operador_login,
    operadorNome: r.operador_nome,
    operadorUserId: r.operador_user_id,
    assinaturaOperador: r.assinatura_operador,
    operadorAssinouEm: r.operador_assinou_em,
    liderNome: r.lider_nome,
    assinaturaLider: r.assinatura_lider,
    liderAssinouEm: r.lider_assinou_em,
    ultimaEdicaoPorLogin: r.ultima_edicao_por_login,
    ultimaEdicaoPorNome: r.ultima_edicao_por_nome,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function limpezaTurnoToRow(t: LimpezaTurno, userId: string | null): LimpezaTurnoRow {
  return {
    id: t.id,
    folha_dia_key: t.folhaDiaKey,
    data_operacao: t.dataOperacao,
    linha: t.linha,
    area: t.area,
    maquina: t.maquina,
    equipamento: t.equipamento,
    turno: t.turno,
    status: t.status,
    itens_json: t.itens,
    observacao: t.observacao ?? null,
    operador_login: t.operadorLogin ?? null,
    operador_nome: t.operadorNome ?? null,
    operador_user_id: t.operadorUserId ?? userId,
    assinatura_operador: t.assinaturaOperador ?? null,
    operador_assinou_em: t.operadorAssinouEm ?? null,
    lider_nome: t.liderNome ?? null,
    assinatura_lider: t.assinaturaLider ?? null,
    lider_assinou_em: t.liderAssinouEm ?? null,
    ultima_edicao_por_login: t.ultimaEdicaoPorLogin ?? null,
    ultima_edicao_por_nome: t.ultimaEdicaoPorNome ?? null,
  };
}
