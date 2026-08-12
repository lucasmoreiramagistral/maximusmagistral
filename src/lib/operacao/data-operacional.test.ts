import { describe, expect, it } from "vitest";
import { calcularDataOperacional } from "./data-operacional";

describe("calcularDataOperacional", () => {
  it("mantem a data de Manaus depois das 20h, sem avancar para o dia UTC", () => {
    const agora = new Date("2026-08-12T01:30:00Z");
    expect(calcularDataOperacional(null, null, agora)).toBe("2026-08-11");
  });

  it("mantem a folha da noite no dia anterior ate o fim do turno", () => {
    const agora = new Date("2026-08-12T09:00:00Z");
    expect(calcularDataOperacional("Valderlan", "12x36 Noite", agora)).toBe("2026-08-11");
  });

  it("vira a folha exatamente as 06:10 de Manaus", () => {
    expect(
      calcularDataOperacional("Valderlan", "12x36 Noite", new Date("2026-08-12T10:09:00Z")),
    ).toBe("2026-08-11");
    expect(
      calcularDataOperacional("Valderlan", "12x36 Noite", new Date("2026-08-12T10:10:00Z")),
    ).toBe("2026-08-12");
  });

  it("faz a virada de ano pela data de Manaus", () => {
    expect(
      calcularDataOperacional("Valderlan", "12x36 Noite", new Date("2027-01-01T09:00:00Z")),
    ).toBe("2026-12-31");
  });
});
