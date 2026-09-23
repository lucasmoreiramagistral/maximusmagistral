import { describe, expect, it } from "vitest";
import { calcularPacotesEmpacotadora, PALETIZACAO_EMPACOTADORA } from "./paletizacao";

describe("paletização das empacotadoras 2 e 3", () => {
  it.each(PALETIZACAO_EMPACOTADORA)(
    "$tamanho: usa $pacotesPorPalete pacotes por palete e $unidadesPorPacote unidades por pacote",
    ({ tamanho, pacotesPorPalete }) => {
      expect(calcularPacotesEmpacotadora(tamanho, 2, 7)).toEqual({
        pacotesPorPalete,
        pacotesPaletesCompletos: 2 * pacotesPorPalete,
        quebraPacotes: 7,
        totalPacotes: 2 * pacotesPorPalete + 7,
      });
    },
  );

  it("aceita hora sem produção, preservando zero como valor explícito", () => {
    expect(calcularPacotesEmpacotadora("1L", 0, 0).totalPacotes).toBe(0);
  });

  it("impede que a quebra esconda um palete completo", () => {
    expect(() => calcularPacotesEmpacotadora("2L", 1, 48)).toThrow(/mais um palete completo/);
  });

  it("rejeita frações, negativos e números que perdem precisão", () => {
    expect(() => calcularPacotesEmpacotadora("600ml", 1.5, 0)).toThrow();
    expect(() => calcularPacotesEmpacotadora("600ml", 1, -1)).toThrow();
    expect(() => calcularPacotesEmpacotadora("200ml", Number.MAX_SAFE_INTEGER, 0)).toThrow();
  });
});
