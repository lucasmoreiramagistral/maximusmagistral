/**
 * FECHAMENTOS EM CONTINGÊNCIA — o número que impede o remendo de virar rotina.
 *
 * A contingência existe para a fábrica não parar quando o líder não consegue
 * autenticar. Só que remendo invisível deixa de ser remendo e vira o processo:
 * se ninguém contar, em três meses todo turno fecha "em contingência" e a
 * autenticação que criamos não terá servido para nada.
 *
 * Por isso o Sup/Coord vê o total do período e a lista. E o número tem uma
 * leitura específica: 40 contingências num mês não é indisciplina do operador,
 * é conta de líder faltando. O motivo declarado diz qual dos dois é.
 */

import { supabase } from "@/integrations/supabase/client";

export interface Contingencia {
  id: string;
  alvoTipo: string;
  dataOperacao: string;
  turno: string;
  /** Quem apertou o botão — carimbado pelo banco, não declarado. */
  registradoPorNome: string;
  registradoEm: string;
  /** Nome DECLARADO de quem autorizou. Não é identidade verificada. */
  autorizou: string | null;
  motivo: string | null;
}

export type ResultadoContingencias =
  | { ok: true; itens: Contingencia[] }
  /** A migration 08 ainda não foi aplicada. */
  | { ok: false; indisponivel: true }
  | { ok: false; indisponivel?: false; erro: string };

interface LinhaContingencia {
  id: string;
  alvo_tipo: string;
  data_operacao: string;
  turno: string;
  validado_por_nome: string;
  validado_em: string;
  contingencia_autorizou: string | null;
  contingencia_motivo: string | null;
}

export async function buscarContingencias(
  de: string,
  ate: string,
): Promise<ResultadoContingencias> {
  const { data, error } = await supabase
    .from("validacoes_lider" as never)
    .select(
      "id, alvo_tipo, data_operacao, turno, validado_por_nome, validado_em, contingencia_autorizou, contingencia_motivo",
    )
    .eq("contingencia", true)
    .gte("data_operacao", de)
    .lte("data_operacao", ate)
    .order("data_operacao", { ascending: false });

  if (error) {
    // 42703 = coluna não existe; 42P01 = tabela não existe. Acontece enquanto
    // a migration 08 não roda. A tela avisa em vez de mostrar zero, porque
    // zero aqui seria a afirmação errada: não é "nenhuma contingência", é
    // "ainda não sei contar".
    const indisponivel =
      error.code === "42703" ||
      error.code === "42P01" ||
      error.code === "PGRST204" ||
      error.code === "PGRST205" ||
      /contingencia|validacoes_lider/i.test(error.message ?? "");
    if (indisponivel) return { ok: false, indisponivel: true };
    console.error("[buscarContingencias]", error);
    return { ok: false, erro: error.message ?? "Falha ao carregar contingências." };
  }

  const linhas = (data ?? []) as unknown as LinhaContingencia[];
  return {
    ok: true,
    itens: linhas.map((l) => ({
      id: l.id,
      alvoTipo: l.alvo_tipo,
      dataOperacao: l.data_operacao,
      turno: l.turno,
      registradoPorNome: l.validado_por_nome,
      registradoEm: l.validado_em,
      autorizou: l.contingencia_autorizou,
      motivo: l.contingencia_motivo,
    })),
  };
}

/** Agrupa por motivo — é o que diz se falta conta ou falta disciplina. */
export function contarPorMotivo(itens: Contingencia[]): Array<{ motivo: string; qtd: number }> {
  const mapa = new Map<string, number>();
  for (const i of itens) {
    const m = i.motivo?.trim() || "sem motivo informado";
    mapa.set(m, (mapa.get(m) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([motivo, qtd]) => ({ motivo, qtd }))
    .sort((a, b) => b.qtd - a.qtd);
}
