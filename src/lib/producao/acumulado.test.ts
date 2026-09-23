import { describe, expect, it } from "vitest";
import { calcularAcumulado, calcularResumoHoraXHora, produtoAnteriorDoTurno } from "./acumulado";
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

  it("nao mistura minutos equivalentes, historicos e horas sem calculo", () => {
    const horas = [
      { horaCodigo: "H01", quantidade: 100, naoRodou: false, meta: 1000, tempoParadaMin: 54, tempoParadaMetodo: "cadencia_equivalente" },
      { horaCodigo: "H02", quantidade: 0, naoRodou: true, meta: null, tempoParadaMin: null },
      { horaCodigo: "H03", quantidade: 100, naoRodou: false, meta: 1000, tempoParadaMin: 10 },
    ] as ProducaoHora[];
    const resumo = calcularResumoHoraXHora(horas, ["H01", "H02", "H03"]);
    expect(resumo.totalPerdaEquivalenteMin).toBe(54);
    expect(resumo.totalParadaInformadaMin).toBe(10);
    expect(resumo.horasSemCalculo).toBe(1);
  });

  it("reinicia o acumulado na primeira hora de um produto novo", () => {
    const horas = [
      { horaCodigo: "H04", quantidade: 100, naoRodou: false, produtoSabor: "Uva", produtoTamanho: "2L", reiniciaAcumulado: false },
      { horaCodigo: "H05", quantidade: 50, naoRodou: false, produtoSabor: "Cola", produtoTamanho: "2L", reiniciaAcumulado: true },
      { horaCodigo: "H06", quantidade: 80, naoRodou: false, produtoSabor: "Cola", produtoTamanho: "2L", reiniciaAcumulado: false },
    ] as ProducaoHora[];
    const acumulado = calcularAcumulado(horas);
    expect(acumulado.map((hora) => hora.quantidadeAcumulada)).toEqual([100, 50, 130]);
    expect(acumulado[1].produtoVigente).toBe("Cola 2L");
  });

  it("tambem reinicia quando o setup ocupa uma hora sem producao", () => {
    const horas = [
      { horaCodigo: "H04", quantidade: 100, naoRodou: false, produtoSabor: "Uva", produtoTamanho: "2L", reiniciaAcumulado: false },
      { horaCodigo: "H05", quantidade: 0, naoRodou: true, produtoSabor: null, produtoTamanho: null, reiniciaAcumulado: true },
      { horaCodigo: "H06", quantidade: 80, naoRodou: false, produtoSabor: "Cola", produtoTamanho: "2L", reiniciaAcumulado: false },
    ] as ProducaoHora[];
    expect(calcularAcumulado(horas).map((hora) => hora.quantidadeAcumulada)).toEqual([100, 0, 80]);
  });

  it("usa o setup ja registrado quando o novo produto comeca na hora seguinte", () => {
    const horas = [
      { horaCodigo: "H04", quantidade: 100, naoRodou: false, produtoSabor: "Uva", produtoTamanho: "2L", finalizadoEm: "2026-09-23T13:00:00Z" },
      { horaCodigo: "H05", quantidade: 0, naoRodou: true, produtoSabor: null, produtoTamanho: null, reiniciaAcumulado: true, finalizadoEm: "2026-09-23T14:00:00Z" },
      { horaCodigo: "H06", quantidade: 80, naoRodou: false, produtoSabor: "Cola", produtoTamanho: "2L", finalizadoEm: "2026-09-23T15:00:00Z" },
    ] as ProducaoHora[];
    const turno = ["H04", "H05", "H06", "H07"];
    expect(produtoAnteriorDoTurno(horas, turno, "H06")).toEqual({
      sabor: "Uva", tamanho: "2L", setupSemProduto: true,
    });
    expect(produtoAnteriorDoTurno(horas, turno, "H07")).toEqual({
      sabor: "Cola", tamanho: "2L", setupSemProduto: false,
    });
  });
});
