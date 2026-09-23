import { describe, expect, it } from "vitest";
import { calcularPerdaCadenciaMin } from "./perda-cadencia";

describe("perda equivalente pela cadencia dos lideres", () => {
  it("reproduz a regra do acompanhamento de agosto", () => {
    expect(calcularPerdaCadenciaMin(1000, 100)).toBe(54);
    expect(calcularPerdaCadenciaMin(864, 300)).toBe(39);
    expect(calcularPerdaCadenciaMin(1000, 0)).toBe(60);
    expect(calcularPerdaCadenciaMin(1000, 1000)).toBe(0);
  });

  it("nao inventa perda quando nao ha cadencia nem aponta perda negativa", () => {
    expect(calcularPerdaCadenciaMin(null, 0)).toBeNull();
    expect(calcularPerdaCadenciaMin(0, 0)).toBeNull();
    expect(calcularPerdaCadenciaMin(1000, 1100)).toBe(0);
    expect(calcularPerdaCadenciaMin(1000, null)).toBeNull();
    expect(calcularPerdaCadenciaMin(1000, -1)).toBeNull();
  });
});
