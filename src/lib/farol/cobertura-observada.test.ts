import { describe, expect, it } from "vitest";
import type { Checklist } from "@/lib/checklist/types";
import type { LimpezaTurno, PtpJanela } from "@/lib/verso/types";
import { inicioCoberturaObservada } from "./cobertura-observada";

describe("início observável da cobertura por máquina", () => {
  it("usa o primeiro registro concluído, inclusive PTP, sem puxar outra máquina ou rascunho", () => {
    const checklists = [
      { contexto: { data: "2026-09-23", maquina: "Empacotadora 3" }, status: "concluido" },
      { contexto: { data: "2026-09-21", maquina: "Empacotadora 2" }, status: "rascunho" },
    ] as Checklist[];
    const limpezas = [
      { dataOperacao: "2026-09-20", maquina: "Enchedora 3", status: "validado" },
    ] as LimpezaTurno[];
    const ptp = [
      { dataOperacao: "2026-09-22", maquina: "Empacotadora 2", statusJanela: "sem_ocorrencia" },
      { dataOperacao: "2026-09-19", maquina: "Empacotadora 2", statusJanela: "rascunho" },
      { dataOperacao: "2026-09-18", maquina: "Empacotadora 2", statusJanela: "nao_rodou" },
    ] as PtpJanela[];

    expect(inicioCoberturaObservada("Empacotadora 2", checklists, limpezas, ptp)).toBe(
      "2026-09-22",
    );
    expect(inicioCoberturaObservada("Empacotadora 3", checklists, limpezas, ptp)).toBe(
      "2026-09-23",
    );
  });

  it("retorna sem dados enquanto não existe lançamento confirmado da máquina", () => {
    expect(inicioCoberturaObservada("Enchedora 2", [], [], [])).toBeNull();
  });
});
