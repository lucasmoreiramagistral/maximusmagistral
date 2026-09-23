import { describe, expect, it } from "vitest";
import { calcularResumoHoraXHora } from "./acumulado";
import type { ProducaoHora } from "./types";

describe("resumo Hora x Hora", () => {
  it("calcula o percentual apenas nas horas que têm meta", () => {
    const horas = [
      { horaCodigo: "H01", quantidade: 100, naoRodou: false, meta: 100, tempoParadaMin: 0 },
      { horaCodigo: "H02", quantidade: 100, naoRodou: false, meta: null, tempoParadaMin: 0 },
    ] as ProducaoHora[];

    const resumo = calcularResumoHoraXHora(horas, ["H01", "H02"]);
    expect(resumo.totalProduzido).toBe(200);
    expect(resumo.totalMeta).toBe(100);
    expect(resumo.atingimentoPct).toBe(100);
  });
});
