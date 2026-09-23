import { supabase } from "@/integrations/supabase/client";
import type {
  BobinaFilmeEmpacotadora,
  ConsolidacaoProdutoEmpacotadora,
  EmpacotadoraVersoBase,
} from "./empacotadora-verso";

interface BaseRow {
  id: string;
  folha_dia_key: string;
  data_operacao: string;
  maquina: "Empacotadora 2" | "Empacotadora 3";
  linha: "Linha 2" | "Linha 3";
  codigo_equipamento: "LE-02" | "LE-03";
  turno: BobinaFilmeEmpacotadora["turno"];
  ordem: number;
  operador_user_id: string;
  operador_login: string | null;
  operador_nome: string | null;
  created_at: string;
  updated_at: string;
}

interface BobinaRow extends BaseRow {
  produto: string | null;
  especificacao_filme: string | null;
  fabricante: string | null;
  numero_lote: string | null;
  peso_liquido_inicial_kg: number | string | null;
  peso_bruto_final_kg: number | string | null;
  hora_inicio: string | null;
  hora_termino: string | null;
  data_termino_operacao: string | null;
}

interface ConsolidacaoRow extends BaseRow {
  sabor: string | null;
  tamanho: string | null;
  hora_inicio: string | null;
  hora_final: string | null;
  quantidade_paletes: number | null;
  quebra_pacotes: number | null;
  total_pacotes: number | null;
  pacotes_por_palete: number | null;
}

export type ConsolidacaoPersistida = ConsolidacaoProdutoEmpacotadora & {
  pacotesPorPalete: number | null;
};

function numeroOuNulo(valor: number | string | null): number | null {
  if (valor === null || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function baseDaLinha(row: BaseRow) {
  const contextoCorreto =
    row.maquina === "Empacotadora 2"
      ? row.linha === "Linha 2" && row.codigo_equipamento === "LE-02"
      : row.linha === "Linha 3" && row.codigo_equipamento === "LE-03";
  if (!contextoCorreto) throw new Error("A linha recebida pertence a outro equipamento.");
  return {
    id: row.id,
    folhaDiaKey: row.folha_dia_key,
    dataOperacao: row.data_operacao,
    maquina: row.maquina,
    linha: row.linha,
    codigoEquipamento: row.codigo_equipamento,
    turno: row.turno,
    ordem: row.ordem,
    operadorUserId: row.operador_user_id,
    operadorLogin: row.operador_login,
    operadorNome: row.operador_nome,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as EmpacotadoraVersoBase;
}

function bobinaDaLinha(row: BobinaRow): BobinaFilmeEmpacotadora {
  return {
    ...baseDaLinha(row),
    produto: row.produto,
    especificacaoFilme: row.especificacao_filme,
    fabricante: row.fabricante,
    numeroLote: row.numero_lote,
    pesoLiquidoInicialKg: numeroOuNulo(row.peso_liquido_inicial_kg),
    pesoBrutoFinalKg: numeroOuNulo(row.peso_bruto_final_kg),
    horaInicio: row.hora_inicio,
    horaTermino: row.hora_termino,
    dataTerminoOperacao: row.data_termino_operacao,
  } as BobinaFilmeEmpacotadora;
}

function consolidacaoDaLinha(row: ConsolidacaoRow): ConsolidacaoPersistida {
  return {
    ...baseDaLinha(row),
    sabor: row.sabor,
    tamanho: row.tamanho,
    horaInicio: row.hora_inicio,
    horaFinal: row.hora_final,
    quantidadePaletes: row.quantidade_paletes,
    quebraPacotes: row.quebra_pacotes,
    totalPacotes: row.total_pacotes,
    pacotesPorPalete: row.pacotes_por_palete,
  } as ConsolidacaoPersistida;
}

export async function buscarVersoEmpacotadora(
  folhaDiaKey: string,
  maquina: "Empacotadora 2" | "Empacotadora 3",
  dataOperacao: string,
): Promise<{
  bobinas: BobinaFilmeEmpacotadora[];
  consolidacoes: ConsolidacaoPersistida[];
}> {
  const [resultadoBobinas, resultadoConsolidacoes, bobinasAbertas] = await Promise.all([
    supabase
      .from("empacotadora_bobinas" as never)
      .select("*")
      .eq("folha_dia_key", folhaDiaKey)
      .eq("maquina", maquina)
      .order("ordem", { ascending: true }),
    supabase
      .from("empacotadora_consolidacoes" as never)
      .select("*")
      .eq("folha_dia_key", folhaDiaKey)
      .eq("maquina", maquina)
      .order("ordem", { ascending: true }),
    supabase
      .from("empacotadora_bobinas" as never)
      .select("*")
      .eq("maquina", maquina)
      .lt("data_operacao", dataOperacao)
      .is("hora_termino", null)
      .order("data_operacao", { ascending: false })
      .limit(20),
  ]);
  if (resultadoBobinas.error) throw resultadoBobinas.error;
  if (resultadoConsolidacoes.error) throw resultadoConsolidacoes.error;
  if (bobinasAbertas.error) throw bobinasAbertas.error;
  return {
    bobinas: ([...(bobinasAbertas.data ?? []), ...(resultadoBobinas.data ?? [])] as unknown as BobinaRow[]).map(bobinaDaLinha),
    consolidacoes: ((resultadoConsolidacoes.data ?? []) as unknown as ConsolidacaoRow[]).map(
      consolidacaoDaLinha,
    ),
  };
}

function baseParaInserir(linha: BobinaFilmeEmpacotadora | ConsolidacaoPersistida, userId: string) {
  return {
    id: linha.id,
    folha_dia_key: linha.folhaDiaKey,
    data_operacao: linha.dataOperacao,
    maquina: linha.maquina,
    linha: linha.linha,
    codigo_equipamento: linha.codigoEquipamento,
    turno: linha.turno,
    ordem: linha.ordem,
    operador_user_id: userId,
    operador_login: linha.operadorLogin ?? null,
    operador_nome: linha.operadorNome ?? null,
  };
}

function camposBobina(linha: BobinaFilmeEmpacotadora) {
  return {
    produto: linha.produto,
    especificacao_filme: linha.especificacaoFilme,
    fabricante: linha.fabricante,
    numero_lote: linha.numeroLote,
    peso_liquido_inicial_kg: linha.pesoLiquidoInicialKg,
    peso_bruto_final_kg: linha.pesoBrutoFinalKg,
    hora_inicio: linha.horaInicio,
    hora_termino: linha.horaTermino,
    data_termino_operacao: linha.dataTerminoOperacao ?? null,
  };
}

function camposConsolidacao(linha: ConsolidacaoPersistida) {
  return {
    sabor: linha.sabor,
    tamanho: linha.tamanho,
    hora_inicio: linha.horaInicio,
    hora_final: linha.horaFinal,
    quantidade_paletes: linha.quantidadePaletes,
    quebra_pacotes: linha.quebraPacotes,
    total_pacotes: linha.totalPacotes,
    pacotes_por_palete: linha.pacotesPorPalete,
  };
}

function correspondeAoEnvio(
  recebida: Record<string, unknown>,
  enviada: Record<string, unknown>,
): boolean {
  return Object.entries(enviada).every(([campo, valor]) => {
    const atual = recebida[campo];
    return typeof valor === "number"
      ? atual !== null && Number(atual) === valor
      : atual === valor;
  });
}

/**
 * A confirmação vem da resposta do servidor. Uma linha salva só é atualizada
 * quando seu updated_at ainda coincide com o que foi carregado na tela.
 */
export async function salvarBobinaEmpacotadora(
  linha: BobinaFilmeEmpacotadora,
  usuarioId: string,
): Promise<BobinaFilmeEmpacotadora> {
  const { data: sessao, error: erroSessao } = await supabase.auth.getUser();
  if (erroSessao || !sessao.user || sessao.user.id !== usuarioId) {
    throw new Error("Sua sessão mudou. Entre novamente antes de salvar a bobina.");
  }

  const enviada = { ...baseParaInserir(linha, usuarioId), ...camposBobina(linha) };
  const query = linha.createdAt
    ? supabase
        .from("empacotadora_bobinas" as never)
        .update(camposBobina(linha) as never)
        .eq("id", linha.id)
        .eq("updated_at", linha.updatedAt ?? "")
    : supabase
        .from("empacotadora_bobinas" as never)
        .insert(enviada as never);
  const { data, error } = await query.select("*").maybeSingle();
  if (error?.code === "23505" && !linha.createdAt) {
    const existente = await supabase.from("empacotadora_bobinas" as never)
      .select("*").eq("id", linha.id).maybeSingle();
    if (!existente.error && existente.data &&
        correspondeAoEnvio(existente.data as Record<string, unknown>, enviada)) {
      return bobinaDaLinha(existente.data as unknown as BobinaRow);
    }
    throw new Error("A bobina já existe com dados diferentes. Atualize a tela antes de salvar.");
  }
  if (error) throw error;
  if (!data) {
    throw new Error(
      "Esta bobina mudou em outro tablet. Atualize a tela e confira antes de salvar.",
    );
  }
  return bobinaDaLinha(data as unknown as BobinaRow);
}

export async function salvarConsolidacaoEmpacotadora(
  linha: ConsolidacaoPersistida,
  usuarioId: string,
): Promise<ConsolidacaoPersistida> {
  const { data: sessao, error: erroSessao } = await supabase.auth.getUser();
  if (erroSessao || !sessao.user || sessao.user.id !== usuarioId) {
    throw new Error("Sua sessão mudou. Entre novamente antes de salvar o fechamento.");
  }

  const enviada = { ...baseParaInserir(linha, usuarioId), ...camposConsolidacao(linha) };
  const query = linha.createdAt
    ? supabase
        .from("empacotadora_consolidacoes" as never)
        .update(camposConsolidacao(linha) as never)
        .eq("id", linha.id)
        .eq("updated_at", linha.updatedAt ?? "")
    : supabase.from("empacotadora_consolidacoes" as never).insert(enviada as never);
  const { data, error } = await query.select("*").maybeSingle();
  if (error?.code === "23505" && !linha.createdAt) {
    const existente = await supabase.from("empacotadora_consolidacoes" as never)
      .select("*").eq("id", linha.id).maybeSingle();
    if (!existente.error && existente.data &&
        correspondeAoEnvio(existente.data as Record<string, unknown>, enviada)) {
      return consolidacaoDaLinha(existente.data as unknown as ConsolidacaoRow);
    }
    throw new Error("O fechamento já existe com dados diferentes. Atualize a tela antes de salvar.");
  }
  if (error) throw error;
  if (!data) {
    throw new Error(
      "Este fechamento mudou em outro tablet. Atualize a tela e confira antes de salvar.",
    );
  }
  return consolidacaoDaLinha(data as unknown as ConsolidacaoRow);
}
