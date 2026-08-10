/**
 * Acesso à tabela `planos_acao` (migration 04).
 *
 * Toda escrita grava também um evento em `planos_acao_eventos`. É o mesmo
 * padrão dos `*_edicoes` que o projeto já usa: nada muda de estado sem
 * deixar rastro de quem, quando e o que havia antes.
 *
 * Replanejamento NÃO sobrescreve: cria plano novo apontando para o anterior
 * em `substitui_plano_id`, e marca o antigo como `nao_cumprido`.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Usuario } from "@/lib/checklist/types";
import type { Pendencia } from "./pendencias";
import { planoFromRow, type PlanoAcao, type PlanoAcaoRow } from "./planos-types";

const TABELA = "planos_acao";
const TABELA_EVENTOS = "planos_acao_eventos";

type AcaoEvento =
  | "criou"
  | "editou"
  | "checou"
  | "reprovou"
  | "replanejou"
  | "padronizou"
  | "solicitou_recurso"
  | "liberou_recurso"
  | "cancelou";

async function registrarEvento(
  planoId: string,
  acao: AcaoEvento,
  usuario: Usuario,
  depois: unknown,
  observacao?: string,
): Promise<void> {
  const { error } = await supabase.from(TABELA_EVENTOS as never).insert({
    plano_id: planoId,
    acao,
    por_login: usuario.usuario,
    por_nome: usuario.nome,
    por_perfil: usuario.perfil,
    depois_json: depois as never,
    observacao: observacao ?? null,
  } as never);
  // Falha de auditoria não derruba a ação principal, mas tem que aparecer.
  if (error) console.error("[planos] evento:", acao, error);
}

export async function buscarPlanos(): Promise<PlanoAcao[]> {
  const { data, error } = await supabase
    .from(TABELA as never)
    .select("*")
    .order("criado_em", { ascending: false });
  if (error) {
    console.error("[planos] buscar:", error);
    return [];
  }
  return ((data ?? []) as unknown as PlanoAcaoRow[]).map(planoFromRow);
}

export interface NovoPlano {
  oQue: string;
  quem: string;
  quando: string;
  como?: string;
}

/**
 * Abre o plano de ação para uma pendência.
 *
 * Quando existe um plano anterior reprovado, este vira o substituto: o
 * antigo é preservado e o novo aponta para ele.
 */
export async function abrirPlano(
  pendencia: Pendencia,
  dados: NovoPlano,
  usuario: Usuario,
): Promise<{ ok: true; plano: PlanoAcao } | { ok: false; erro: string }> {
  const anterior = pendencia.plano;

  const payload = {
    origem_tipo: pendencia.origemTipo,
    origem_id: pendencia.origemId,
    item_numero: pendencia.itemNumero,
    data_operacao: pendencia.dataOrigem,
    linha: "Linha 3",
    maquina: pendencia.maquina,
    momento: pendencia.momento,
    turno: pendencia.turno,
    acao_imediata: pendencia.detalhe,
    o_que: dados.oQue,
    quem: dados.quem,
    quando: dados.quando,
    como: dados.como ?? null,
    status: "aberto",
    criado_por_user_id: usuario.userId ?? null,
    criado_por_login: usuario.usuario,
    criado_por_nome: usuario.nome,
    substitui_plano_id: anterior && anterior.status === "nao_cumprido" ? anterior.id : null,
  };

  const { data, error } = await supabase
    .from(TABELA as never)
    .insert(payload as never)
    .select("*")
    .single();

  if (error) {
    console.error("[planos] abrir:", error);
    return { ok: false, erro: error.message };
  }

  const plano = planoFromRow(data as unknown as PlanoAcaoRow);
  await registrarEvento(
    plano.id,
    payload.substitui_plano_id ? "replanejou" : "criou",
    usuario,
    payload,
  );
  return { ok: true, plano };
}

export interface Checagem {
  cumprido: boolean;
  saiuNc: boolean;
  evidencia?: string;
}

/**
 * A checagem do líder: "Plano de Ação cumprido? Sim/Não · Saiu NC".
 *
 * Só encerra a pendência quando as duas respostas forem SIM. Cumprir o
 * combinado sem resolver o problema não fecha nada — é o ponto do papel.
 */
export async function checarPlano(
  plano: PlanoAcao,
  c: Checagem,
  usuario: Usuario,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const aprovado = c.cumprido && c.saiuNc;

  const { error } = await supabase
    .from(TABELA as never)
    .update({
      status: aprovado ? "cumprido" : "nao_cumprido",
      checagem_cumprido: c.cumprido,
      checagem_saiu_nc: c.saiuNc,
      checagem_evidencia: c.evidencia ?? null,
      checado_por_login: usuario.usuario,
      checado_por_nome: usuario.nome,
      checado_em: new Date().toISOString(),
    } as never)
    .eq("id", plano.id);

  if (error) {
    console.error("[planos] checar:", error);
    return { ok: false, erro: error.message };
  }

  await registrarEvento(plano.id, aprovado ? "checou" : "reprovou", usuario, c, c.evidencia);
  return { ok: true };
}

/**
 * O A do PDCA — padronizar ou voltar a rodar.
 *
 * É a etapa que faltava inteira: as colunas `padronizacao_*` existiam no banco
 * desde a migration 04 e nenhuma tela as preenchia, então todo plano parava no
 * C. Checar se o problema saiu não é o fim do ciclo; o fim é decidir o que
 * fazer com o que se aprendeu.
 *
 * As três saídas são as do PDCA, e a terceira é a que costuma ser esquecida:
 *
 *   padronizar  → virou regra. Vai para o procedimento, e `padraoRef` diz
 *                 qual documento mudou — senão "padronizamos" é conversa.
 *   monitorar   → funcionou, mas ainda não se confia. Segue observando.
 *   girar       → não resolveu de fato. Volta para o P com o que se aprendeu.
 *
 * Quem decide é supervisor ou gestão, não o líder: quem executou a ação não é
 * quem julga que ela virou padrão. A migration 06 impõe isso no banco.
 */
export type DecisaoPadronizacao = "padronizar" | "monitorar" | "girar";

export interface Padronizacao {
  decisao: DecisaoPadronizacao;
  /** O que se aprendeu — a causa, não o sintoma. */
  analise: string;
  /** Documento/procedimento alterado. Obrigatório ao padronizar. */
  padraoRef?: string;
}

export async function padronizarPlano(
  plano: PlanoAcao,
  p: Padronizacao,
  usuario: Usuario,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!p.analise.trim()) {
    return { ok: false, erro: "Descreva o que foi aprendido." };
  }
  if (p.decisao === "padronizar" && !p.padraoRef?.trim()) {
    return {
      ok: false,
      erro: "Informe qual procedimento foi alterado. Padronizar sem documento não é padronizar.",
    };
  }

  const { error } = await supabase
    .from(TABELA as never)
    .update({
      padronizacao_analise: p.analise.trim(),
      padronizacao_decisao: p.decisao,
      padrao_ref: p.padraoRef?.trim() || null,
      padronizado_por_nome: usuario.nome,
      padronizado_em: new Date().toISOString(),
    } as never)
    .eq("id", plano.id);

  if (error) {
    console.error("[planos] padronizar:", error);
    return { ok: false, erro: error.message };
  }

  await registrarEvento(plano.id, "padronizou", usuario, p, p.analise);
  return { ok: true };
}

/** GI: "Disponibilizar Recursos p/ Execução PA (NC)". */
export async function liberarRecurso(
  plano: PlanoAcao,
  observacao: string,
  usuario: Usuario,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { error } = await supabase
    .from(TABELA as never)
    .update({
      recurso_solicitado: true,
      recurso_observacao: observacao,
      recurso_liberado_por: usuario.nome,
      recurso_liberado_em: new Date().toISOString(),
    } as never)
    .eq("id", plano.id);

  if (error) return { ok: false, erro: error.message };
  await registrarEvento(plano.id, "liberou_recurso", usuario, { observacao });
  return { ok: true };
}
