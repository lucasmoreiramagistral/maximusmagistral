/** Payload mínimo do verso para um link público restrito ao dia da publicação. */
export interface BobinaRowPublica {
  maquina: string;
  turno: string;
  ordem: number;
  data_operacao: string;
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

export interface ConsolidacaoRowPublica {
  maquina: string;
  turno: string;
  ordem: number;
  data_operacao: string;
  sabor: string | null;
  tamanho: string | null;
  hora_inicio: string | null;
  hora_final: string | null;
  quantidade_paletes: number | null;
  quebra_pacotes: number | null;
  pacotes_por_palete: number | null;
  total_pacotes: number | null;
}

const EMPACOTADORAS = ["Empacotadora 2", "Empacotadora 3"] as const;

export function dataOperacionalAnterior(dataOperacao: string): string {
  const data = new Date(`${dataOperacao}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() - 1);
  return data.toISOString().slice(0, 10);
}

function numeroOuNulo(valor: number | string | null): number | null {
  if (valor === null || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

export function versoPublico(
  dataOperacao: string,
  bobinas: readonly BobinaRowPublica[],
  consolidacoes: readonly ConsolidacaoRowPublica[],
) {
  const dataAnterior = dataOperacionalAnterior(dataOperacao);
  return EMPACOTADORAS.map((maquina) => ({
    maquina,
    bobinas: bobinas
      .filter((linha) => linha.maquina === maquina && (
        linha.data_operacao === dataOperacao ||
        (linha.data_operacao === dataAnterior && (
          linha.data_termino_operacao === dataOperacao ||
          (linha.data_termino_operacao === null && linha.hora_inicio !== null)
        ))
      ))
      .sort((a, b) => a.data_operacao.localeCompare(b.data_operacao) || a.ordem - b.ordem)
      .map((linha) => ({
        maquina: linha.maquina,
        turno: linha.turno,
        ordem: linha.ordem,
        dataOperacao: linha.data_operacao,
        produto: linha.produto,
        especificacaoFilme: linha.especificacao_filme,
        fabricante: linha.fabricante,
        numeroLote: linha.numero_lote,
        pesoLiquidoInicialKg: numeroOuNulo(linha.peso_liquido_inicial_kg),
        pesoBrutoFinalKg: numeroOuNulo(linha.peso_bruto_final_kg),
        horaInicio: linha.hora_inicio,
        horaTermino: linha.hora_termino,
        dataTerminoOperacao: linha.data_termino_operacao,
      })),
    consolidacoes: consolidacoes
      .filter((linha) => linha.maquina === maquina && linha.data_operacao === dataOperacao)
      .sort((a, b) => a.ordem - b.ordem)
      .map((linha) => ({
        maquina: linha.maquina,
        turno: linha.turno,
        ordem: linha.ordem,
        sabor: linha.sabor,
        tamanho: linha.tamanho,
        horaInicio: linha.hora_inicio,
        horaFinal: linha.hora_final,
        quantidadePaletes: linha.quantidade_paletes,
        quebraPacotes: linha.quebra_pacotes,
        pacotesPorPalete: linha.pacotes_por_palete,
        totalPacotes: linha.total_pacotes,
      })),
  }));
}
