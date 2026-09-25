import { describe, expect, it } from "vitest";
import { mesclarHorasComPadrao } from "./mesclar-horas";
import { createProducaoHorasPadrao } from "./supabase-storage";

const folha = "2026-09-25-Linha 3-Enchedora 3";
const padrao = createProducaoHorasPadrao(
  folha, "2026-09-25", "12x36 Dia", "operador-atual",
);
const hora = padrao[0];

describe("seleção de horas da folha", () => {
  it("ignora linha em branco de outro operador e cria um novo lançamento", () => {
    const antiga = { ...hora, id: "antiga", operadorUserId: "operador-anterior",
      createdAt: "2026-09-25T10:00:00Z" };
    expect(mesclarHorasComPadrao(padrao, [antiga], "operador-atual")[0].id)
      .toBe(hora.id);
  });

  it("mantém linha em branco do próprio operador para concluí-la", () => {
    const propria = { ...hora, id: "propria", operadorUserId: "operador-atual",
      createdAt: "2026-09-25T10:00:00Z" };
    expect(mesclarHorasComPadrao(padrao, [propria], "operador-atual")[0].id)
      .toBe("propria");
  });

  it("mostra uma hora preenchida por outro operador, sem substituí-la", () => {
    const preenchida = { ...hora, id: "confirmada", operadorUserId: "operador-anterior",
      quantidade: 100, finalizadoEm: "2026-09-25T11:00:00Z" };
    const branco = { ...hora, id: "branco", operadorUserId: "operador-atual" };
    expect(mesclarHorasComPadrao(padrao, [branco, preenchida], "operador-atual")[0].id)
      .toBe("confirmada");
  });
});
