/**
 * Validação do líder.
 *
 * Hoje, no app publicado, o líder valida dentro da sessão do OPERADOR
 * digitando o próprio nome num campo de texto livre
 * (routes/operador.validacao-lider.tsx). Qualquer pessoa digita qualquer
 * nome — assinatura sem prova de quem assinou.
 *
 * Aqui o nome vem da sessão autenticada. É a razão de existir o login do
 * líder, e é o que transforma as 56 validações em aberto num número que
 * significa alguma coisa.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Usuario } from "@/lib/checklist/types";

export async function validarLimpeza(
  limpezaId: string,
  usuario: Usuario,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const agora = new Date().toISOString();

  // folha_dia_key e turno são NOT NULL na tabela de auditoria; busca antes
  // de escrever para não gravar registro de auditoria pela metade.
  const { data: atual, error: errLer } = await supabase
    .from("limpeza_turnos" as never)
    .select("folha_dia_key, turno, status")
    .eq("id", limpezaId)
    .maybeSingle<{ folha_dia_key: string; turno: string; status: string }>();

  if (errLer || !atual) {
    return { ok: false, erro: errLer?.message ?? "Limpeza não encontrada" };
  }
  if (atual.status === "validado") {
    return { ok: false, erro: "Esta limpeza já foi validada." };
  }

  const { error } = await supabase
    .from("limpeza_turnos" as never)
    .update({
      status: "validado",
      lider_nome: usuario.nome,
      lider_assinou_em: agora,
      ultima_edicao_por_login: usuario.usuario,
      ultima_edicao_por_nome: usuario.nome,
    } as never)
    .eq("id", limpezaId);

  if (error) {
    console.error("[validacao] limpeza:", error);
    return { ok: false, erro: error.message };
  }

  // Auditoria no mesmo padrão das outras tabelas do projeto.
  const { error: errAud } = await supabase
    .from("limpeza_turnos_edicoes" as never)
    .insert({
      limpeza_turno_id: limpezaId,
      folha_dia_key: atual.folha_dia_key,
      turno: atual.turno,
      editado_por_login: usuario.usuario,
      editado_por_nome: usuario.nome,
      motivo_edicao: "Validação do líder pela área da liderança",
      antes_json: { status: "aguardando_validacao" },
      depois_json: { status: "validado", lider_nome: usuario.nome, lider_assinou_em: agora },
    } as never);
  if (errAud) console.error("[validacao] auditoria:", errAud);

  return { ok: true };
}
