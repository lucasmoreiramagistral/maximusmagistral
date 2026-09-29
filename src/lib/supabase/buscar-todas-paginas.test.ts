import { describe, expect, it, vi } from "vitest";
import { buscarTodasPaginas } from "./buscar-todas-paginas";

describe("leitura completa de histórico paginado", () => {
  it("busca todas as páginas sem perder o registro na fronteira de 500", async () => {
    const origem = Array.from({ length: 1101 }, (_, i) => i);
    const buscar = vi.fn(async (inicio: number, fim: number) => ({
      data: origem.slice(inicio, fim + 1),
      error: null,
      count: origem.length,
    }));
    expect(await buscarTodasPaginas(buscar)).toEqual(origem);
    expect(buscar.mock.calls).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
  });

  it("falha sem publicar resultado parcial se qualquer página falhar", async () => {
    const erro = new Error("falha na segunda página");
    await expect(
      buscarTodasPaginas(async (inicio) =>
        inicio === 0
          ? { data: Array(500).fill(1), error: null, count: 501 }
          : { data: null, error: erro, count: null },
      ),
    ).rejects.toBe(erro);
  });

  it("continua após resposta menor que a página quando o servidor impõe limite", async () => {
    const origem = Array.from({ length: 850 }, (_, i) => i);
    const buscar = vi.fn(async (inicio: number) => ({
      data: origem.slice(inicio, inicio + 300),
      error: null,
      count: origem.length,
    }));
    expect(await buscarTodasPaginas(buscar)).toEqual(origem);
    expect(buscar.mock.calls.map(([inicio]) => inicio)).toEqual([0, 300, 600]);
  });
});
