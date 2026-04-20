import type { Anomalia, AnomaliaAtualizacao, Checklist, ContextoChecklist, Equipe, MomentoChecklist, RespostaItem, StatusAnomalia, Turno } from "./types";

// ─────────── Checklist row (snake_case do banco) ───────────
export interface ChecklistRow {
  id: string;
  user_id: string;
  operador_login: string;
  operador_responsavel: string;
  contexto: ContextoChecklist;
  respostas: RespostaItem[];
  momento: string;
  status: "rascunho" | "concluido";
  data_operacao: string;
  turno: Turno;
  equipe: Equipe;
  linha: string;
  area: string;
  maquina: string;
  equipamento: string;
  folha_key: string;
  verificacao_numero: 1 | 2 | 3;
  total_conformes: number;
  total_nao_conformes: number;
  total_na: number;
  total_anomalias: number;
  criado_em: string;
  concluido_em: string | null;
  updated_at: string;
}

export interface AnomaliaRow {
  id: string;
  user_id: string;
  operador_login: string;
  operador_responsavel: string;
  checklist_id: string | null;
  item_origem: { numero: number; descricao: string } | null;
  linha: string;
  area: string;
  maquina: string;
  equipamento: string;
  data_operacao: string;
  turno: Turno;
  equipe: Equipe;
  folha_key: string | null;
  momento: string | null;
  categoria: string;
  criticidade: string;
  descricao: string;
  status: StatusAnomalia;
  criado_em: string;
  updated_at: string;
  responsavel_manutencao: string | null;
  o_que_foi_feito: string | null;
  resolvido_em: string | null;
  ultima_atualizacao_em: string | null;
  ultima_atualizacao_por_login: string | null;
  ultima_atualizacao_por_perfil: string | null;
  origem_horario_resolucao: string | null;
  origem_anomalia: string | null;
  aberto_por_login: string | null;
  aberto_por_perfil: string | null;
  tecnico_responsavel: string | null;
  em_andamento_em: string | null;
  equipamento_afetado: string | null;
}

export interface AnomaliaAtualizacaoRow {
  id: number;
  anomalia_id: string;
  status_anterior: string;
  status_novo: string;
  responsavel_manutencao: string;
  o_que_foi_feito: string;
  atualizado_em: string;
  resolvido_em_informado: string | null;
  atualizado_por_user_id: string | null;
  atualizado_por_login: string;
  atualizado_por_perfil: string;
  origem_horario: string;
}

export function anomaliaAtualizacaoFromRow(row: AnomaliaAtualizacaoRow): AnomaliaAtualizacao {
  return {
    id: row.id,
    anomaliaId: row.anomalia_id,
    statusAnterior: row.status_anterior as StatusAnomalia,
    statusNovo: row.status_novo as StatusAnomalia,
    responsavelManutencao: row.responsavel_manutencao,
    oQueFoiFeito: row.o_que_foi_feito,
    atualizadoEm: row.atualizado_em,
    resolvidoEmInformado: row.resolvido_em_informado ?? undefined,
    atualizadoPorLogin: row.atualizado_por_login,
    atualizadoPorPerfil: row.atualizado_por_perfil,
    origemHorario: (row.origem_horario as AnomaliaAtualizacao["origemHorario"]) ?? "manual_gestao",
  };
}

export function checklistFromRow(row: ChecklistRow): Checklist {
  return {
    id: row.id,
    contexto: row.contexto,
    momento: row.momento as MomentoChecklist,
    respostas: row.respostas ?? [],
    status: row.status,
    criadoEm: row.criado_em,
    concluidoEm: row.concluido_em ?? undefined,
    operador: row.operador_responsavel,
    operadorLogin: row.operador_login,
    operadorResponsavel: row.operador_responsavel,
    folhaKey: row.folha_key,
    verificacaoNumero: row.verificacao_numero,
  };
}

export function checklistToRow(
  c: Checklist,
  userId: string,
): Omit<ChecklistRow, "updated_at"> {
  const conformes = c.respostas.filter((r) => r?.resposta === "Conforme").length;
  const naoConformes = c.respostas.filter((r) => r?.resposta === "Não conforme").length;
  const naoAplicaveis = c.respostas.filter((r) => r?.resposta === "Não aplicável").length;
  const anomalias = c.respostas.filter((r) => !!r?.anomaliaId).length;

  return {
    id: c.id,
    user_id: userId,
    operador_login: c.operadorLogin ?? c.operador,
    operador_responsavel: c.operadorResponsavel ?? c.contexto.operadorResponsavel ?? c.operador,
    contexto: c.contexto,
    respostas: c.respostas,
    momento: c.momento,
    status: c.status,
    data_operacao: c.contexto.data,
    turno: c.contexto.turno,
    equipe: c.contexto.equipe,
    linha: c.contexto.linha,
    area: c.contexto.area ?? "Envase",
    maquina: c.contexto.maquina,
    equipamento: c.contexto.equipamento ?? "Enchedora Zegla 50V",
    folha_key: c.folhaKey ?? "",
    verificacao_numero: (c.verificacaoNumero ?? 1) as 1 | 2 | 3,
    total_conformes: conformes,
    total_nao_conformes: naoConformes,
    total_na: naoAplicaveis,
    total_anomalias: anomalias,
    criado_em: c.criadoEm,
    concluido_em: c.concluidoEm ?? null,
  };
}

export function anomaliaFromRow(row: AnomaliaRow): Anomalia {
  return {
    id: row.id,
    criadoEm: row.criado_em,
    linha: (row.linha ?? "Linha 3") as "Linha 3",
    area: (row.area ?? "Envase") as "Envase",
    maquina: (row.maquina ?? "Enchedora 3") as "Enchedora 3",
    itemOrigem: row.item_origem ?? undefined,
    checklistId: row.checklist_id ?? undefined,
    categoria: row.categoria as Anomalia["categoria"],
    criticidade: row.criticidade as Anomalia["criticidade"],
    descricao: row.descricao,
    status: row.status,
    equipe: row.equipe,
    turno: row.turno,
    operador: row.operador_responsavel,
    operadorLogin: row.operador_login,
    operadorResponsavel: row.operador_responsavel,
    folhaKey: row.folha_key ?? undefined,
    momento: (row.momento ?? undefined) as MomentoChecklist | undefined,
    responsavelManutencao: row.responsavel_manutencao ?? undefined,
    oQueFoiFeito: row.o_que_foi_feito ?? undefined,
    resolvidoEm: row.resolvido_em ?? undefined,
    ultimaAtualizacaoEm: row.ultima_atualizacao_em ?? undefined,
    ultimaAtualizacaoPorLogin: row.ultima_atualizacao_por_login ?? undefined,
    ultimaAtualizacaoPorPerfil: row.ultima_atualizacao_por_perfil ?? undefined,
    origemHorarioResolucao: (row.origem_horario_resolucao ?? undefined) as Anomalia["origemHorarioResolucao"],
    origemAnomalia: (row.origem_anomalia ?? undefined) as Anomalia["origemAnomalia"],
    abertoPorLogin: row.aberto_por_login ?? undefined,
    abertoPorPerfil: row.aberto_por_perfil ?? undefined,
    tecnicoResponsavel: row.tecnico_responsavel ?? undefined,
    emAndamentoEm: row.em_andamento_em ?? undefined,
    equipamentoAfetado: row.equipamento_afetado ?? "Enchedora 3",
  };
}

export function anomaliaToRow(
  a: Anomalia,
  userId: string,
  ctx?: { dataOperacao?: string },
): Omit<AnomaliaRow, "updated_at"> {
  const data = ctx?.dataOperacao ?? a.criadoEm.slice(0, 10);
  return {
    id: a.id,
    user_id: userId,
    operador_login: a.operadorLogin ?? a.operador,
    operador_responsavel: a.operadorResponsavel ?? a.operador,
    checklist_id: a.checklistId ?? null,
    item_origem: a.itemOrigem ?? null,
    linha: a.linha,
    area: a.area,
    maquina: a.maquina,
    equipamento: "Enchedora Zegla 50V",
    data_operacao: data,
    turno: a.turno,
    equipe: a.equipe,
    folha_key: a.folhaKey ?? null,
    momento: a.momento ?? null,
    categoria: a.categoria,
    criticidade: a.criticidade,
    descricao: a.descricao,
    status: a.status,
    criado_em: a.criadoEm,
    responsavel_manutencao: a.responsavelManutencao ?? null,
    o_que_foi_feito: a.oQueFoiFeito ?? null,
    resolvido_em: a.resolvidoEm ?? null,
    ultima_atualizacao_em: a.ultimaAtualizacaoEm ?? null,
    ultima_atualizacao_por_login: a.ultimaAtualizacaoPorLogin ?? null,
    ultima_atualizacao_por_perfil: a.ultimaAtualizacaoPorPerfil ?? null,
    origem_horario_resolucao: a.origemHorarioResolucao ?? null,
    origem_anomalia: a.origemAnomalia ?? null,
    aberto_por_login: a.abertoPorLogin ?? null,
    aberto_por_perfil: a.abertoPorPerfil ?? null,
    tecnico_responsavel: a.tecnicoResponsavel ?? null,
    em_andamento_em: a.emAndamentoEm ?? null,
    equipamento_afetado: a.equipamentoAfetado ?? "Enchedora 3",
  };
}
