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
  /** A estrutura de auditoria ainda não foi aplicada. */
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

interface LinhaFechamento {
  id: string;
  data_operacao: string;
  turno: string;
  registrado_por_nome: string;
  registrado_em: string;
  contingencia_autorizou: string | null;
  contingencia_motivo: string | null;
}

function mapearLinhaLegada(l: LinhaContingencia): Contingencia {
  return {
    id: l.id,
    alvoTipo: l.alvo_tipo,
    dataOperacao: l.data_operacao,
    turno: l.turno,
    registradoPorNome: l.validado_por_nome,
    registradoEm: l.validado_em,
    autorizou: l.contingencia_autorizou,
    motivo: l.contingencia_motivo,
  };
}

function estruturaAusente(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42703" ||
    error.code === "42P01" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /relation .* does not exist|column .* does not exist/i.test(error.message ?? "")
  );
}

export async function buscarContingencias(
  de: string,
  ate: string,
): Promise<ResultadoContingencias> {
  // A migration 09 grava um cabecalho por turno. Consultar esta tabela evita
  // contar checklist + limpeza como duas contingencias do mesmo fechamento.
  const { data: cabecalhos, error: erroCabecalhos } = await supabase
    .from("fechamentos_validacao" as never)
    .select(
      "id, data_operacao, turno, registrado_por_nome, registrado_em, contingencia_autorizou, contingencia_motivo",
    )
    .eq("contingencia", true)
    .gte("data_operacao", de)
    .lte("data_operacao", ate)
    .order("data_operacao", { ascending: false });

  if (!erroCabecalhos) {
    const linhas = (cabecalhos ?? []) as unknown as LinhaFechamento[];
    const { data: legadas, error: erroLegadas } = await supabase
      .from("validacoes_lider" as never)
      .select(
        "id, alvo_tipo, data_operacao, turno, validado_por_nome, validado_em, contingencia_autorizou, contingencia_motivo",
      )
      .eq("contingencia", true)
      .is("fechamento_id", null)
      .gte("data_operacao", de)
      .lte("data_operacao", ate)
      .order("data_operacao", { ascending: false });

    if (erroLegadas) {
      console.error("[buscarContingencias:legado]", erroLegadas);
      return {
        ok: false,
        erro: erroLegadas.message ?? "Falha ao carregar o historico de contingencias.",
      };
    }

    return {
      ok: true,
      itens: [
        ...linhas.map((l) => ({
          id: l.id,
          alvoTipo: "turno",
          dataOperacao: l.data_operacao,
          turno: l.turno,
          registradoPorNome: l.registrado_por_nome,
          registradoEm: l.registrado_em,
          autorizou: l.contingencia_autorizou,
          motivo: l.contingencia_motivo,
        })),
        ...((legadas ?? []) as unknown as LinhaContingencia[]).map(mapearLinhaLegada),
      ],
    };
  }

  if (!estruturaAusente(erroCabecalhos)) {
    console.error("[buscarContingencias:fechamentos]", erroCabecalhos);
    return {
      ok: false,
      erro: erroCabecalhos.message ?? "Falha ao carregar fechamentos em contingencia.",
    };
  }

  // Compatibilidade com os registros da migration 08, anteriores ao cabecalho
  // transacional. Eles ainda sao agrupados no painel pela chave do turno.
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
    const indisponivel = estruturaAusente(error);
    if (indisponivel) return { ok: false, indisponivel: true };
    console.error("[buscarContingencias]", error);
    return { ok: false, erro: error.message ?? "Falha ao carregar contingências." };
  }

  const linhas = (data ?? []) as unknown as LinhaContingencia[];
  return {
    ok: true,
    itens: linhas.map(mapearLinhaLegada),
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

/**
 * A migration 08 grava uma linha por alvo. Checklist + limpeza do mesmo turno
 * são um único fechamento, não dois turnos. Como as linhas de um INSERT em
 * lote recebem o mesmo `now()` no PostgreSQL, esta chave corrige o histórico
 * anterior à coluna `fechamento_id` sem inventar números.
 */
export function agruparFechamentos(itens: Contingencia[]): Contingencia[] {
  const unicos = new Map<string, Contingencia>();
  for (const item of itens) {
    const chave = [
      item.dataOperacao,
      item.turno,
      item.registradoPorNome,
      item.registradoEm,
      item.autorizou ?? "",
      item.motivo ?? "",
    ].join("|");
    if (!unicos.has(chave)) unicos.set(chave, item);
  }
  return [...unicos.values()];
}
