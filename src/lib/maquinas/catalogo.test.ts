import { describe, expect, it } from "vitest";
import { buildFolhaDiaKey } from "@/lib/operacao/data-operacional";
import { createPtpJanelasPadrao, createLimpezaTurnoPadrao } from "@/lib/verso/supabase-storage";
import { genVersoId } from "@/lib/verso/storage";
import { createProducaoHorasPadrao } from "@/lib/producao/supabase-storage";
import { MAQUINAS, MAQUINAS_ORDENADAS } from "./catalogo";

const data = "2026-09-22";
const operador = "operador-teste";
const e3 = MAQUINAS["enchedora-3"];
const e2 = MAQUINAS["enchedora-2"];

describe("catálogo das máquinas", () => {
  it("mantém limpeza apenas nas enchedoras", () => {
    expect(MAQUINAS_ORDENADAS.map((m) => [m.nome, m.formularios.limpeza])).toEqual([
      ["Enchedora 2", true],
      ["Empacotadora 2", false],
      ["Enchedora 3", true],
      ["Empacotadora 3", false],
    ]);
  });

  it("preserva IDs históricos da Enchedora 3 e separa a mesma hora em outra máquina", () => {
    const folhaE3 = buildFolhaDiaKey(data, e3.linha, e3.nome);
    const folhaE2 = buildFolhaDiaKey(data, e2.linha, e2.nome);
    const horaE3 = createProducaoHorasPadrao(folhaE3, data, "12x36 Dia", operador, e3)[0];
    const horaE2 = createProducaoHorasPadrao(folhaE2, data, "12x36 Dia", operador, e2)[0];

    expect(horaE3.id).toBe(genVersoId(`prod-${data}-H01-op:${operador}`));
    expect(horaE2.id).not.toBe(horaE3.id);
    expect(horaE2.maquina).toBe("Enchedora 2");
    expect(horaE2.folhaDiaKey).toBe(folhaE2);
  });

  it("não deixa PTP e limpeza de outra máquina sobrescreverem os da Enchedora 3", () => {
    const folhaE3 = buildFolhaDiaKey(data, e3.linha, e3.nome);
    const folhaE2 = buildFolhaDiaKey(data, e2.linha, e2.nome);
    const ptpE3 = createPtpJanelasPadrao(folhaE3, data, operador, e3)[0];
    const ptpE2 = createPtpJanelasPadrao(folhaE2, data, operador, e2)[0];
    const limpezaE3 = createLimpezaTurnoPadrao(folhaE3, data, "12x36 Dia", operador, e3);
    const limpezaE2 = createLimpezaTurnoPadrao(folhaE2, data, "12x36 Dia", operador, e2);

    expect(ptpE3.id).toBe(genVersoId(`ptp-${data}-J01-op:${operador}`));
    expect(ptpE2.id).not.toBe(ptpE3.id);
    expect(limpezaE3.id).toBe(genVersoId(`limp-${data}-12x36_Dia-op:${operador}`));
    expect(limpezaE2.id).not.toBe(limpezaE3.id);
    expect(() =>
      createLimpezaTurnoPadrao(folhaE2, data, "12x36 Dia", operador, MAQUINAS["empacotadora-2"]),
    ).toThrow(/não possui checklist de limpeza/);
  });
});
