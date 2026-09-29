import { describe, expect, it } from "vitest";
import { fimDaHoraEpoch, horaEstaNoPrazo, horaTerminou, prazoDaHoraEpoch } from "./horario";

describe("fechamento da faixa horária em Manaus", () => {
  it("abre o lançamento de 08–09 somente às 09:00 locais", () => {
    const fim = Date.parse("2026-09-22T09:00:00-04:00");
    expect(fimDaHoraEpoch("2026-09-22", "H03")).toBe(fim);
    expect(horaTerminou("2026-09-22", "H03", fim - 1)).toBe(false);
    expect(horaTerminou("2026-09-22", "H03", fim)).toBe(true);
  });

  it("mantém a folha operacional ao atravessar a meia-noite", () => {
    expect(fimDaHoraEpoch("2026-09-22", "H18")).toBe(Date.parse("2026-09-23T00:00:00-04:00"));
    expect(fimDaHoraEpoch("2026-09-22", "H24")).toBe(Date.parse("2026-09-23T06:00:00-04:00"));
  });

  it("permite salvar somente entre o fim da hora e o corte HH:20", () => {
    const fim = Date.parse("2026-09-22T09:00:00-04:00");
    expect(prazoDaHoraEpoch("2026-09-22", "H03")).toBe(fim + 20 * 60 * 1000);
    expect(horaEstaNoPrazo("2026-09-22", "H03", fim - 1)).toBe(false);
    expect(horaEstaNoPrazo("2026-09-22", "H03", fim)).toBe(true);
    expect(horaEstaNoPrazo("2026-09-22", "H03", fim + 20 * 60 * 1000 - 1)).toBe(true);
    expect(horaEstaNoPrazo("2026-09-22", "H03", fim + 20 * 60 * 1000)).toBe(false);
  });

  it("aplica o corte de H24 às 06:20 do dia seguinte", () => {
    expect(prazoDaHoraEpoch("2026-09-22", "H24")).toBe(Date.parse("2026-09-23T06:20:00-04:00"));
  });
});
