import { describe, expect, it } from "vitest";
import { MAQUINAS } from "@/lib/maquinas/catalogo";
import type { Anomalia, Checklist } from "./types";
import { anomaliaFromRow, anomaliaToRow, checklistToRow } from "./mappers";

const data = "2026-09-27";

describe("identificação da máquina nas linhas do checklist e anomalia", () => {
  it("grava o equipamento da Enchedora 2 quando o contexto do checklist omite o detalhe", () => {
    const maquina = MAQUINAS["enchedora-2"];
    const checklist: Checklist = {
      id: "checklist-e2",
      contexto: {
        data,
        turno: "12x36 Dia",
        equipe: "Nilson",
        linha: maquina.linha,
        maquina: maquina.nome,
      },
      momento: "Pós-setup",
      respostas: [],
      status: "concluido",
      criadoEm: `${data}T08:00:00Z`,
      operador: "Operador",
    };
    expect(checklistToRow(checklist, "user-id").equipamento).toBe(maquina.equipamento);
  });

  it("mantém a Empacotadora 3 como equipamento de anomalia na ida e volta ao banco", () => {
    const maquina = MAQUINAS["empacotadora-3"];
    const anomalia: Anomalia = {
      id: "anomalia-ep3",
      criadoEm: `${data}T08:00:00Z`,
      linha: maquina.linha,
      area: "Envase",
      maquina: maquina.nome,
      categoria: "Processo",
      criticidade: "Média",
      descricao: "Falha no pacote",
      status: "Aberta",
      equipe: "Nilson",
      turno: "12x36 Dia",
      operador: "Operador",
    };
    const row = anomaliaToRow(anomalia, "user-id", { dataOperacao: data });
    expect(row.equipamento).toBe(maquina.equipamento);
    expect(row.equipamento_afetado).toBe(maquina.nome);
    expect(anomaliaFromRow({ ...row, updated_at: `${data}T08:00:00Z` }).equipamentoAfetado).toBe(maquina.nome);
    expect(anomaliaFromRow({ ...row, equipamento_afetado: null, updated_at: `${data}T08:00:00Z` }).equipamentoAfetado).toBe(maquina.nome);
  });
});
