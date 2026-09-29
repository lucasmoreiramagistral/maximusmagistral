import { describe, expect, it } from "vitest";
import { paginarPorChaves } from "./paginacao";

describe("paginação dos resumos de verso", () => {
  it("lê mais de mil janelas sem perder linhas pelo limite do servidor", async () => {
    const keys = Array.from({ length: 25 }, (_, i) => `folha-${i}`);
    const linhas = keys.flatMap((key) => Array.from({ length: 60 }, (_, i) => `${key}:${i}`));
    const chamadas: Array<{ lote: string[]; de: number }> = [];
    const recebidas = await paginarPorChaves(keys, async (lote, de) => {
      chamadas.push({ lote, de });
      const selecionadas = linhas.filter((linha) => lote.some((key) => linha.startsWith(`${key}:`)));
      return { data: selecionadas.slice(de, de + 100), count: selecionadas.length };
    });
    expect(recebidas).toHaveLength(1500);
    expect(new Set(recebidas).size).toBe(1500);
    expect(chamadas.some((chamada) => chamada.de >= 1000)).toBe(true);
    expect(chamadas.some((chamada) => chamada.lote.length === 5)).toBe(true);
  });

  it("falha em vez de aceitar uma resposta incompleta", async () => {
    await expect(paginarPorChaves(["folha"], async (_lote, de) => ({
      data: de === 0 ? ["primeira"] : [], count: 2,
    }))).rejects.toThrow(/interrompida/);
  });
});
