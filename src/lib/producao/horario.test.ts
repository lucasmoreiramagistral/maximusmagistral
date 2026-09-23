import { describe, expect, it } from "vitest";
import { fimDaHoraEpoch, horaTerminou } from "./horario";

describe("fechamento da faixa horária em Manaus", () => {
  it("abre o lançamento de 08–09 somente às 09:00 locais", () => {
    const fim = Date.parse("2026-09-22T09:00:00-04:00");
    expect(fimDaHoraEpoch("2026-09-22", "H03")).toBe(fim);
    expect(horaTerminou("2026-09-22", "H03", fim - 1)).toBe(false);
    expect(horaTerminou("2026-09-22", "H03", fim)).toBe(true);
  });

  it("mantém a folha operacional ao atravessar a meia-noite", () => {
    expect(fimDaHoraEpoch("2026-09-22", "H18")).toBe(
      Date.parse("2026-09-23T00:00:00-04:00"),
    );
    expect(fimDaHoraEpoch("2026-09-22", "H24")).toBe(
      Date.parse("2026-09-23T06:00:00-04:00"),
    );
  });
});
