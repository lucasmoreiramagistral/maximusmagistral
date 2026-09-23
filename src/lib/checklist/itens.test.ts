import { describe, expect, it } from "vitest";
import {
  ITENS_CHECKLIST,
  itensChecklistPorMaquina,
  itensPorMomento,
} from "./itens";

describe("catálogos de checklist por máquina", () => {
  it.each([
    ["Enchedora 2", [6, 6, 8]],
    ["Enchedora 3", [6, 6, 8]],
    ["Empacotadora 2", [10, 5, 5]],
    ["Empacotadora 3", [10, 5, 5]],
  ] as const)("preserva a numeração e os momentos de %s", (maquina, contagens) => {
    const itens = itensChecklistPorMaquina(maquina);
    expect(itens.map((item) => item.numero)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(
      [
        "Início / retomada de processo",
        "Setup / longas paradas / PCM",
        "Pós-setup",
      ].map((momento) => itensPorMomento(momento, maquina).length),
    ).toEqual(contagens);
  });

  it("mantém o catálogo legado da Enchedora 3 e replica seus itens na Enchedora 2", () => {
    expect(itensChecklistPorMaquina("Enchedora 3")).toBe(ITENS_CHECKLIST);
    expect(itensChecklistPorMaquina("Enchedora 2")).toEqual(ITENS_CHECKLIST);
    expect(itensPorMomento("Pós-setup")).toEqual(
      itensPorMomento("Pós-setup", "Enchedora 3"),
    );
  });

  it("preserva as diferenças físicas entre as empacotadoras", () => {
    const linha2 = itensChecklistPorMaquina("Empacotadora 2");
    const linha3 = itensChecklistPorMaquina("Empacotadora 3");

    expect(linha2[0].unidade).toBe("MPa");
    expect(linha3[0].unidade).toBe("MPa");
    expect(linha3[0].referencia).toContain("0,6 a 1,0 MPa");
    expect(linha2[2].referencia).toContain("215,0");
    expect(linha3[2].referencia).toContain("210,0");
    expect(linha2[7].descricao).toContain("pistão");
    expect(linha3[7].descricao).toContain("prensa");
    expect(linha2[8].descricao).toContain("bandeirolas");
    expect(linha3[8].descricao).toContain("prensas");
  });

  it("rejeita uma máquina sem catálogo em vez de mostrar o formulário errado", () => {
    expect(() => itensChecklistPorMaquina("Rotuladora 2")).toThrow(
      "Máquina sem checklist cadastrado: Rotuladora 2",
    );
  });
});
