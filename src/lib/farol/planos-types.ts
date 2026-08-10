/**
 * Plano de ação — o "D" da liderança e o "C" da checagem.
 *
 * Espelha a tabela `planos_acao` (migration 04). O replanejamento NÃO
 * sobrescreve o plano anterior: cria um novo apontando para ele em
 * `substituiPlanoId`, para o histórico ficar auditável.
 */

export type StatusPlano = "aberto" | "cumprido" | "nao_cumprido" | "cancelado";

export interface PlanoAcao {
  id: string;

  origemTipo: "checklist" | "limpeza";
  origemId: string;
  itemNumero: number | null;

  dataOperacao: string;
  linha: string;
  maquina: string;
  momento: string | null;
  turno: string;
  equipe: string | null;

  /** O que o operador já fez na hora — a "ação tomada" do papel. */
  acaoImediata: string | null;

  oQue: string;
  quem: string;
  quando: string;
  como: string | null;

  status: StatusPlano;

  checagemCumprido: boolean | null;
  checagemSaiuNc: boolean | null;
  checagemEvidencia: string | null;
  checadoPorNome: string | null;
  checadoEm: string | null;

  padronizacaoAnalise: string | null;
  padronizacaoDecisao: string | null;
  padraoRef: string | null;
  padronizadoPorNome: string | null;
  padronizadoEm: string | null;

  recursoSolicitado: boolean;
  recursoObservacao: string | null;
  recursoLiberadoPor: string | null;
  recursoLiberadoEm: string | null;

  criadoPorLogin: string;
  criadoPorNome: string;
  criadoEm: string;
  substituiPlanoId: string | null;
}

/** Linha crua da tabela, para o mapper. */
export interface PlanoAcaoRow {
  id: string;
  origem_tipo: "checklist" | "limpeza";
  origem_id: string;
  item_numero: number | null;
  data_operacao: string;
  linha: string;
  maquina: string;
  momento: string | null;
  turno: string;
  equipe: string | null;
  acao_imediata: string | null;
  o_que: string;
  quem: string;
  quando: string;
  como: string | null;
  status: StatusPlano;
  checagem_cumprido: boolean | null;
  checagem_saiu_nc: boolean | null;
  checagem_evidencia: string | null;
  checado_por_nome: string | null;
  checado_em: string | null;
  padronizacao_analise: string | null;
  padronizacao_decisao: string | null;
  padrao_ref: string | null;
  padronizado_por_nome: string | null;
  padronizado_em: string | null;
  recurso_solicitado: boolean;
  recurso_observacao: string | null;
  recurso_liberado_por: string | null;
  recurso_liberado_em: string | null;
  criado_por_login: string;
  criado_por_nome: string;
  criado_em: string;
  substitui_plano_id: string | null;
}

export function planoFromRow(r: PlanoAcaoRow): PlanoAcao {
  return {
    id: r.id,
    origemTipo: r.origem_tipo,
    origemId: r.origem_id,
    itemNumero: r.item_numero,
    dataOperacao: r.data_operacao,
    linha: r.linha,
    maquina: r.maquina,
    momento: r.momento,
    turno: r.turno,
    equipe: r.equipe,
    acaoImediata: r.acao_imediata,
    oQue: r.o_que,
    quem: r.quem,
    quando: r.quando,
    como: r.como,
    status: r.status,
    checagemCumprido: r.checagem_cumprido,
    checagemSaiuNc: r.checagem_saiu_nc,
    checagemEvidencia: r.checagem_evidencia,
    checadoPorNome: r.checado_por_nome,
    checadoEm: r.checado_em,
    padronizacaoAnalise: r.padronizacao_analise,
    padronizacaoDecisao: r.padronizacao_decisao,
    padraoRef: r.padrao_ref,
    padronizadoPorNome: r.padronizado_por_nome,
    padronizadoEm: r.padronizado_em,
    recursoSolicitado: r.recurso_solicitado,
    recursoObservacao: r.recurso_observacao,
    recursoLiberadoPor: r.recurso_liberado_por,
    recursoLiberadoEm: r.recurso_liberado_em,
    criadoPorLogin: r.criado_por_login,
    criadoPorNome: r.criado_por_nome,
    criadoEm: r.criado_em,
    substituiPlanoId: r.substitui_plano_id,
  };
}

/**
 * Etapa do PDCA em que o plano está parado. É o que a célula do farol e a
 * fila da liderança usam para dizer quem tem que agir agora.
 */
export function etapaDoPlano(p: PlanoAcao | null): "P" | "D" | "C" | "A" {
  if (!p) return "P"; // NC identificada, ninguém assumiu ainda
  if (p.status === "nao_cumprido") return "P"; // reprovado: volta pro começo
  if (p.status === "aberto") return "D";
  if (p.status === "cumprido" && !p.padronizadoEm) return "C";
  return "A";
}
