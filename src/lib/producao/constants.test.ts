import { describe, expect, it } from "vitest";
import { checagensLiderDoTurno, ehHoraDeChecagemLider } from "./constants";

describe("assinatura do líder no fim do turno", () => {
  it("exige somente H12 no turno diurno e H24 no noturno", () => {
    const dia = Array.from({ length: 12 }, (_, i) => `H${String(i + 1).padStart(2, "0")}`);
    const noite = Array.from({ length: 12 }, (_, i) => `H${String(i + 13).padStart(2, "0")}`);

    expect(checagensLiderDoTurno(dia)).toEqual(["H12"]);
    expect(checagensLiderDoTurno(noite)).toEqual(["H24"]);
    expect(checagensLiderDoTurno([...dia, ...noite])).toEqual(["H12", "H24"]);
    expect(ehHoraDeChecagemLider("H06")).toBe(false);
    expect(ehHoraDeChecagemLider("H18")).toBe(false);
  });
});
