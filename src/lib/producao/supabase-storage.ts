import { supabase } from "@/integrations/supabase/client";
import { genVersoId } from "@/lib/verso/storage";
import { ConflitoVersaoError } from "@/lib/verso/supabase-storage";
import { HORA_X_HORA_FAIXAS } from "./constants";
import { MAQUINAS, sufixoIdMaquina, type MaquinaOperacional } from "@/lib/maquinas/catalogo";
import { producaoHoraFromRow, producaoHoraToRow, type ProducaoHoraRow } from "./mappers";
import type { ProducaoHora, ProducaoHoraEdicaoPayload } from "./types";
import type { Turno } from "@/lib/checklist/types";

export { ConflitoVersaoError };

/**
 * Busca as horas lançadas de uma folha do dia.
 * Mesma regra do PTP: com `operadorUserId` filtra a folha do operador;
 * sem ele, devolve tudo (gestão/relatórios).
 */
export async function fetchProducaoHoras(
  folhaDiaKey: string,
  operadorUserId?: string | null,
): Promise<ProducaoHora[]> {
  let query = supabase
    .from("producao_horaria" as never)
    .select("*")
    .eq("folha_dia_key", folhaDiaKey)
    .order("updated_at", { ascending: false });
  if (operadorUserId) query = query.eq("operador_user_id", operadorUserId);

  const { data, error } = await query;
  if (error) {
    console.error("[fetchProducaoHoras] supabase error:", error);
    throw error;
  }
  return ((data ?? []) as unknown as ProducaoHoraRow[]).map(producaoHoraFromRow);
}

export async function upsertProducaoHora(
  h: ProducaoHora,
  opts: { expectedUpdatedAt?: string | null; somenteAssinatura?: boolean } = {},
): Promise<ProducaoHora> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  const row = producaoHoraToRow(h, userId);
  const existente = Boolean(h.createdAt);
  if (opts.somenteAssinatura && !existente) {
    throw new Error("Não é possível assinar uma hora que ainda não foi salva.");
  }

  let falha: unknown;
  try {
    const query = existente
      ? supabase.from("producao_horaria" as never).update(
          (opts.somenteAssinatura
            ? {
                lider_nome: row.lider_nome,
                assinatura_lider: row.assinatura_lider,
                lider_assinou_em: row.lider_assinou_em,
              }
            : row) as never,
        ).eq("id", row.id)
      : supabase.from("producao_horaria" as never).insert(row as never);
    const guardada = existente && opts.expectedUpdatedAt
      ? query.eq("updated_at", opts.expectedUpdatedAt)
      : query;
    const { data, error } = await guardada.select("*").maybeSingle();
    if (!error && data) return producaoHoraFromRow(data as unknown as ProducaoHoraRow);
    falha = error ?? new Error("O banco não confirmou o salvamento da hora.");
  } catch (error) {
    falha = error;
  }

  // Uma resposta pode se perder depois do commit. Só aceitamos sucesso após
  // reler exatamente o conteúdo confirmado no servidor.
  try {
    const { data, error } = await supabase
      .from("producao_horaria" as never)
      .select("*")
      .eq("id", row.id)
      .maybeSingle();
    if (!error && data && horaPersistidaIgual(data as unknown as ProducaoHoraRow, row)) {
      return producaoHoraFromRow(data as unknown as ProducaoHoraRow);
    }
    if (!error && existente && opts.expectedUpdatedAt && data) {
      const remoto = (data as { updated_at?: string }).updated_at;
      if (remoto && remoto !== opts.expectedUpdatedAt) {
        throw new ConflitoVersaoError(opts.expectedUpdatedAt, remoto);
      }
    }
  } catch (error) {
    if (error instanceof ConflitoVersaoError) throw error;
    // Sem leitura remota não há confirmação, então devolvemos o erro original.
  }
  console.error("[upsertProducaoHora] supabase error:", falha);
  throw falha;
}

const CAMPOS_LANCAMENTO = [
  "id", "folha_dia_key", "data_operacao", "linha", "maquina", "turno",
  "hora_codigo", "hora_inicio", "hora_fim", "meta", "quantidade",
  "paletes_completos", "quebra_pacotes", "pacotes_por_palete",
  "nao_rodou", "tempo_parada_min", "tempo_parada_metodo", "motivo_parada_codigo",
  "reinicia_acumulado", "motivo_reinicio", "produto_sabor", "produto_tamanho",
  "observacao", "operador_user_id", "lider_nome", "lider_assinou_em",
] as const satisfies readonly (keyof ProducaoHoraRow)[];

/** Mesmo lançamento salvo pelo servidor, sem comparar timestamps ou assinatura posterior. */
export function horaPersistidaIgual(
  persistida: ProducaoHoraRow,
  enviada: ProducaoHoraRow,
): boolean {
  if (!persistida.finalizado_em && persistida.quantidade === null && !persistida.nao_rodou) return false;
  if (!CAMPOS_LANCAMENTO.every((campo) => (persistida[campo] ?? null) === (enviada[campo] ?? null))) {
    return false;
  }
  const eventosPersistidos = [...(persistida.eventos ?? [])].sort();
  const eventosEnviados = [...(enviada.eventos ?? [])].sort();
  const assinaturaPersistida = persistida.assinatura_lider;
  const assinaturaEnviada = enviada.assinatura_lider;
  return JSON.stringify(eventosPersistidos) === JSON.stringify(eventosEnviados)
    && (assinaturaPersistida?.dataUrl ?? null) === (assinaturaEnviada?.dataUrl ?? null)
    && (assinaturaPersistida?.nome ?? null) === (assinaturaEnviada?.nome ?? null)
    && (assinaturaPersistida?.assinadoEm ?? null) === (assinaturaEnviada?.assinadoEm ?? null);
}

export async function insertProducaoHoraEdicao(p: ProducaoHoraEdicaoPayload): Promise<void> {
  const { error } = await supabase.from("producao_horaria_edicoes" as never).insert({
    producao_horaria_id: p.producaoHorariaId,
    folha_dia_key: p.folhaDiaKey,
    hora_codigo: p.horaCodigo,
    editado_por_login: p.editadoPorLogin,
    editado_por_nome: p.editadoPorNome,
    motivo_edicao: p.motivoEdicao ?? null,
    antes_json: p.antesJson,
    depois_json: p.depoisJson,
  } as never);
  if (error) {
    console.error("[insertProducaoHoraEdicao] supabase error:", error);
    throw error;
  }
}

/**
 * Cria as 24 linhas horárias em branco do dia para um operador.
 * O id é determinístico (inclui o operador) para o upsert por `id` não
 * sobrescrever a folha de outro operador.
 */
export function createProducaoHorasPadrao(
  folhaDiaKey: string,
  dataOperacao: string,
  turno: Turno,
  operadorUserId?: string | null,
  maquina: MaquinaOperacional = MAQUINAS["enchedora-3"],
): ProducaoHora[] {
  const opSuffix = operadorUserId ? `-op:${operadorUserId}` : "";
  return HORA_X_HORA_FAIXAS.map((f) => ({
    id: genVersoId(`prod-${dataOperacao}-${f.codigo}${opSuffix}${sufixoIdMaquina(maquina)}`),
    folhaDiaKey,
    dataOperacao,
    linha: maquina.linha,
    area: maquina.area,
    maquina: maquina.nome,
    equipamento: maquina.equipamento,
    turno,
    horaCodigo: f.codigo,
    horaInicio: f.inicio,
    horaFim: f.fim,
    meta: null,
    quantidade: null,
    paletesCompletos: null,
    quebraPacotes: null,
    pacotesPorPalete: null,
    naoRodou: false,
    tempoParadaMin: null,
    tempoParadaMetodo: null,
    motivoParadaCodigo: null,
    reiniciaAcumulado: false,
    motivoReinicio: null,
    eventos: [],
    produtoSabor: null,
    produtoTamanho: null,
    observacao: null,
    finalizadoEm: null,
  }));
}
