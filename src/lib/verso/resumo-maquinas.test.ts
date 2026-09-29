import { describe, expect, it } from "vitest";
import type { FolhaChecklistDia } from "@/lib/checklist/types";
import type { PtpJanela } from "@/lib/verso/types";
import { temVerso } from "./aplicabilidade";
import { calcularResumoVerso } from "./resumo";

function folha(maquina: string, linha: string): FolhaChecklistDia {
  return { contexto: { maquina, linha } } as FolhaChecklistDia;
}

function janela(codigo: string): PtpJanela {
  return {
    janelaCodigo: codigo,
    statusJanela: "sem_ocorrencia",
    assinaturaOperador: { dataUrl: "data:image/png;base64,AA" },
  } as PtpJanela;
}

describe("resumo do verso por máquina", () => {
  it("reconhece o PTP nas quatro máquinas, mas rejeita contexto trocado", () => {
    expect(temVerso(folha("Enchedora 2", "Linha 2"))).toBe(true);
    expect(temVerso(folha("Enchedora 3", "Linha 3"))).toBe(true);
    expect(temVerso(folha("Empacotadora 2", "Linha 2"))).toBe(true);
    expect(temVerso(folha("Empacotadora 3", "Linha 3"))).toBe(true);
    expect(temVerso(folha("Empacotadora 2", "Linha 3"))).toBe(false);
  });

  it("considera o PTP completo da empacotadora sem exigir limpeza", () => {
    const resumo = calcularResumoVerso({
      maquina: "Empacotadora 2",
      escopo: { turno: "1º Turno", equipe: "1º Turno" },
      janelas: ["J01", "J02", "J03", "J04"].map(janela),
      turnos: [],
    });
    expect(resumo.ptp.totalJanelasTurno).toBe(4);
    expect(resumo.ptp.finalizadas).toBe(4);
    expect(resumo.limpezaAplicavel).toBe(false);
    expect(resumo.tituloPtp).toBe("PTP Pacotes");
    expect(resumo.saude).toBe("completo");
  });

  it("mantém limpeza como requisito da enchedora e janelas legadas da E3", () => {
    const entrada = {
      escopo: { turno: "1º Turno", equipe: "1º Turno" } as const,
      janelas: ["J01", "J02", "J03", "J04"].map(janela),
      turnos: [],
    };
    expect(calcularResumoVerso({ ...entrada, maquina: "Enchedora 2" }).saude).toBe("parcial");
    expect(calcularResumoVerso({ ...entrada, maquina: "Enchedora 3" }).ptp.totalJanelasTurno).toBe(5);
  });
});
