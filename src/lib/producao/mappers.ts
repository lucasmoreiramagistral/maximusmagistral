import type { AssinaturaDigital, Turno } from "@/lib/checklist/types";
import type { MotivoReinicio, ProducaoHora } from "./types";

export interface ProducaoHoraRow {
  id: string;
  folha_dia_key: string;
  data_operacao: string;
  linha: string;
  area: string;
  maquina: string;
  equipamento: string | null;
  turno: Turno;
  hora_codigo: string;
  hora_inicio: string;
  hora_fim: string;
  meta: number | null;
  quantidade: number | null;
  nao_rodou: boolean;
  tempo_parada_min: number | null;
  reinicia_acumulado: boolean;
  motivo_reinicio: MotivoReinicio | null;
  produto_sabor: string | null;
  produto_tamanho: string | null;
  observacao: string | null;
  operador_login: string | null;
  operador_nome: string | null;
  operador_user_id: string | null;
  lider_nome: string | null;
  assinatura_lider: AssinaturaDigital | null;
  lider_assinou_em: string | null;
  ultima_edicao_por_login: string | null;
  ultima_edicao_por_nome: string | null;
  created_at?: string;
  updated_at?: string;
}

export function producaoHoraFromRow(r: ProducaoHoraRow): ProducaoHora {
  return {
    id: r.id,
    folhaDiaKey: r.folha_dia_key,
    dataOperacao: r.data_operacao,
    linha: r.linha,
    area: r.area,
    maquina: r.maquina,
    equipamento: r.equipamento ?? "",
    turno: r.turno,
    horaCodigo: r.hora_codigo,
    horaInicio: r.hora_inicio,
    horaFim: r.hora_fim,
    meta: r.meta,
    quantidade: r.quantidade,
    naoRodou: Boolean(r.nao_rodou),
    tempoParadaMin: r.tempo_parada_min,
    reiniciaAcumulado: Boolean(r.reinicia_acumulado),
    motivoReinicio: r.motivo_reinicio,
    produtoSabor: r.produto_sabor,
    produtoTamanho: r.produto_tamanho,
    observacao: r.observacao,
    operadorLogin: r.operador_login,
    operadorNome: r.operador_nome,
    operadorUserId: r.operador_user_id,
    liderNome: r.lider_nome,
    assinaturaLider: r.assinatura_lider,
    liderAssinouEm: r.lider_assinou_em,
    ultimaEdicaoPorLogin: r.ultima_edicao_por_login,
    ultimaEdicaoPorNome: r.ultima_edicao_por_nome,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function producaoHoraToRow(h: ProducaoHora, userId: string | null): ProducaoHoraRow {
  return {
    id: h.id,
    folha_dia_key: h.folhaDiaKey,
    data_operacao: h.dataOperacao,
    linha: h.linha,
    area: h.area,
    maquina: h.maquina,
    equipamento: h.equipamento || null,
    turno: h.turno,
    hora_codigo: h.horaCodigo,
    hora_inicio: h.horaInicio,
    hora_fim: h.horaFim,
    meta: h.meta ?? null,
    // "Não rodou" força quantidade 0 — o CHECK do banco exige isso.
    quantidade: h.naoRodou ? 0 : h.quantidade ?? null,
    nao_rodou: h.naoRodou,
    tempo_parada_min: h.tempoParadaMin ?? null,
    reinicia_acumulado: h.reiniciaAcumulado,
    motivo_reinicio: h.reiniciaAcumulado ? h.motivoReinicio : null,
    produto_sabor: h.produtoSabor ?? null,
    produto_tamanho: h.produtoTamanho ?? null,
    observacao: h.observacao ?? null,
    operador_login: h.operadorLogin ?? null,
    operador_nome: h.operadorNome ?? null,
    operador_user_id: h.operadorUserId ?? userId,
    lider_nome: h.liderNome ?? null,
    assinatura_lider: h.assinaturaLider ?? null,
    lider_assinou_em: h.liderAssinouEm ?? null,
    ultima_edicao_por_login: h.ultimaEdicaoPorLogin ?? null,
    ultima_edicao_por_nome: h.ultimaEdicaoPorNome ?? null,
  };
}
