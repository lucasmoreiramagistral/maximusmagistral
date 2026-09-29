const TAMANHO_PAGINA = 500;
const CHAVES_POR_CONSULTA = 20;

/** Lê todas as linhas mesmo quando o PostgREST impõe um limite menor por resposta. */
export async function paginarPorChaves<T>(
  keys: string[],
  buscarPagina: (
    lote: string[], de: number, ate: number,
  ) => Promise<{ data: T[]; count: number | null }>,
): Promise<T[]> {
  const todas: T[] = [];
  for (let inicio = 0; inicio < keys.length; inicio += CHAVES_POR_CONSULTA) {
    const lote = keys.slice(inicio, inicio + CHAVES_POR_CONSULTA);
    let offset = 0;
    for (;;) {
      const { data, count } = await buscarPagina(lote, offset, offset + TAMANHO_PAGINA - 1);
      if (count === null) throw new Error("Contagem das linhas do verso indisponível.");
      todas.push(...data);
      offset += data.length;
      if (offset >= count) break;
      if (data.length === 0) throw new Error("Paginação do verso interrompida antes do fim.");
    }
  }
  return todas;
}
