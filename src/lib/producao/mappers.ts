import type { AssinaturaDigital, Turno } from "@/lib/checklist/types";
import type { EventoHora, MotivoReinicio, ProducaoHora } from "./types";
import type { MotivoParadaCodigo } from "./motivos-parada";

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
  paletes_completos?: number | null;
  quebra_pacotes?: number | null;
  pacotes_por_palete?: number | null;
  nao_rodou: boolean;
  tempo_parada_min: number | null;
  tempo_parada_metodo?: "cadencia_equivalente" | null;
  motivo_parada_codigo?: MotivoParadaCodigo | null;
  reinicia_acumulado: boolean;
  motivo_reinicio: MotivoReinicio | null;
  eventos?: string[] | null;
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
  finalizado_em?: string | null;
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
    paletesCompletos: r.paletes_completos ?? null,
    quebraPacotes: r.quebra_pacotes ?? null,
    pacotesPorPalete: r.pacotes_por_palete ?? null,
    naoRodou: Boolean(r.nao_rodou),
    tempoParadaMin: r.tempo_parada_min,
    tempoParadaMetodo: r.tempo_parada_metodo ?? null,
    motivoParadaCodigo: r.motivo_parada_codigo ?? null,
    reiniciaAcumulado: Boolean(r.reinicia_acumulado),
    motivoReinicio: r.motivo_reinicio,
    // Linhas gravadas antes da migration 10 não têm a coluna; `?? []` evita
    // que uma hora antiga apareça como se tivesse eventos desconhecidos.
    eventos: (r.eventos ?? []) as EventoHora[],
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
    finalizadoEm: r.finalizado_em ?? null,
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
    quantidade: h.naoRodou ? 0 : (h.quantidade ?? null),
    paletes_completos: h.paletesCompletos ?? null,
    quebra_pacotes: h.quebraPacotes ?? null,
    pacotes_por_palete: h.pacotesPorPalete ?? null,
    nao_rodou: h.naoRodou,
    tempo_parada_min: h.tempoParadaMin ?? null,
    tempo_parada_metodo: h.tempoParadaMetodo ?? null,
    motivo_parada_codigo: h.motivoParadaCodigo ?? null,
    reinicia_acumulado: h.reiniciaAcumulado,
    motivo_reinicio: h.reiniciaAcumulado ? h.motivoReinicio : null,
    eventos: h.eventos ?? [],
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
