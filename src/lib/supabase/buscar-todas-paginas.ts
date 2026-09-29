const TAMANHO_PAGINA = 500;

/** Lê todo o conjunto em páginas para não aceitar um histórico truncado como completo. */
export async function buscarTodasPaginas<T>(
  buscarPagina: (
    inicio: number,
    fim: number,
  ) => Promise<{ data: T[] | null; error: unknown; count: number | null }>,
): Promise<T[]> {
  const registros: T[] = [];
  for (let inicio = 0; ;) {
    const { data, error, count } = await buscarPagina(inicio, inicio + TAMANHO_PAGINA - 1);
    if (error) throw error;
    if (count === null) throw new Error("Contagem do histórico indisponível.");
    const pagina = data ?? [];
    registros.push(...pagina);
    if (registros.length >= count) return registros;
    if (pagina.length === 0) throw new Error("Paginação do histórico interrompida antes do fim.");
    inicio += pagina.length;
  }
}
