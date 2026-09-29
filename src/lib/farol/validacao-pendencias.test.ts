import { describe, expect, it } from "vitest";
import { MAQUINAS_ORDENADAS, type MaquinaOperacional } from "@/lib/maquinas/catalogo";
import type { Checklist } from "@/lib/checklist/types";
import { checklistPosSetupParaValidar } from "./validacao-pendencias";

const ativo = { data: "2026-09-27", turno: "12x36 Dia" as const, equipe: "Nilson" as const };

function checklist(maquina: MaquinaOperacional, overrides: Partial<Checklist> = {}): Checklist {
  return {
    id: maquina.id,
    contexto: { ...ativo, linha: maquina.linha, maquina: maquina.nome },
    momento: "Pós-setup",
    respostas: [],
    status: "concluido",
    criadoEm: "2026-09-27T18:00:00Z",
    operador: "Operador",
    ...overrides,
  };
}

describe("checklist da validação no tablet do operador", () => {
  it("seleciona o Pós-setup de cada uma das quatro máquinas sem pegar o da vizinha", () => {
    const registros = MAQUINAS_ORDENADAS.map((maquina) => checklist(maquina));
    for (const maquina of MAQUINAS_ORDENADAS) {
      expect(checklistPosSetupParaValidar(registros, ativo, maquina)?.id).toBe(maquina.id);
    }
  });

  it("não aceita outro dia, turno, equipe ou checklist em rascunho", () => {
    const maquina = MAQUINAS_ORDENADAS[1];
    const registro = checklist(maquina);
    expect(checklistPosSetupParaValidar([registro], { ...ativo, data: "2026-09-26" }, maquina)).toBeNull();
    expect(checklistPosSetupParaValidar([registro], { ...ativo, turno: "12x36 Noite" }, maquina)).toBeNull();
    expect(checklistPosSetupParaValidar([registro], { ...ativo, equipe: "Bruno" }, maquina)).toBeNull();
    expect(checklistPosSetupParaValidar([checklist(maquina, { status: "rascunho" })], ativo, maquina)).toBeNull();
  });
});
