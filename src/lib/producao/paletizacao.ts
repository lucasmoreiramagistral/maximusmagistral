/** Formação de paletes informada no IT 009-004 PET L3 (foto enviada pelo usuário). */
export const PALETIZACAO_EMPACOTADORA = [
  { tamanho: "2L", unidadesPorPacote: 9, pacotesPorPalete: 48 },
  { tamanho: "1,5L", unidadesPorPacote: 9, pacotesPorPalete: 48 },
  { tamanho: "1L", unidadesPorPacote: 9, pacotesPorPalete: 100 },
  { tamanho: "600ml", unidadesPorPacote: 12, pacotesPorPalete: 120 },
  { tamanho: "350ml", unidadesPorPacote: 12, pacotesPorPalete: 200 },
  { tamanho: "200ml", unidadesPorPacote: 15, pacotesPorPalete: 240 },
] as const;

export type TamanhoProdutoEmpacotadora = (typeof PALETIZACAO_EMPACOTADORA)[number]["tamanho"];

export interface CalculoPaletizacao {
  pacotesPorPalete: number;
  pacotesPaletesCompletos: number;
  quebraPacotes: number;
  totalPacotes: number;
}

export function formacaoPorTamanho(tamanho: TamanhoProdutoEmpacotadora) {
  return PALETIZACAO_EMPACOTADORA.find((produto) => produto.tamanho === tamanho)!;
}

/**
 * Quebra = pacotes do palete incompleto, não porcentagem nem perda de produto.
 * Um valor igual à capacidade já constitui outro palete completo.
 */
export function calcularPacotesEmpacotadora(
  tamanho: TamanhoProdutoEmpacotadora,
  paletesCompletos: number,
  quebraPacotes: number,
): CalculoPaletizacao {
  const formacao = formacaoPorTamanho(tamanho);
  if (!formacao) throw new Error("Tamanho de produto desconhecido.");
  if (!Number.isSafeInteger(paletesCompletos) || paletesCompletos < 0) {
    throw new Error("Informe um número inteiro de paletes completos.");
  }
  if (!Number.isSafeInteger(quebraPacotes) || quebraPacotes < 0) {
    throw new Error("Informe um número inteiro de pacotes de quebra.");
  }
  if (quebraPacotes >= formacao.pacotesPorPalete) {
    throw new Error(
      `A quebra deve ter menos de ${formacao.pacotesPorPalete} pacotes; conte mais um palete completo.`,
    );
  }
  const pacotesPaletesCompletos = paletesCompletos * formacao.pacotesPorPalete;
  const totalPacotes = pacotesPaletesCompletos + quebraPacotes;
  if (!Number.isSafeInteger(totalPacotes)) {
    throw new Error("A quantidade calculada ultrapassa o limite permitido.");
  }
  return {
    pacotesPorPalete: formacao.pacotesPorPalete,
    pacotesPaletesCompletos,
    quebraPacotes,
    totalPacotes,
  };
}
