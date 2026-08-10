import { describe, expect, it } from "vitest";
import {
  montarFarol,
  resumirFarol,
  percentualCumprimento,
  type MaquinaFarol,
} from "./farol";
import type { Checklist, MomentoChecklist, Resposta } from "@/lib/checklist/types";
import { MOMENTOS_CHECKLIST } from "@/lib/checklist/types";

const DATA = "2026-08-10";

const MAQ: ReadonlyArray<MaquinaFarol> = [
  { id: "Enchedora 3", nome: "Enchedora 3", detalhe: "", ativa: true },
  { id: "Rotuladora 3", nome: "Rotuladora 3", detalhe: "", ativa: false },
];

function checklist(
  momento: MomentoChecklist,
  respostas: Resposta[],
  status: "rascunho" | "concluido" = "concluido",
): Checklist {
  return {
    id: `${momento}-${Math.random()}`,
    contexto: {
      data: DATA,
      turno: "12x36 Dia",
      equipe: "Nilson",
      linha: "Linha 3",
      maquina: "Enchedora 3",
    },
    momento,
    respostas: respostas.map((resposta, i) => ({
      itemNumero: i + 1,
      descricao: `item ${i + 1}`,
      resposta,
      observacao: "",
      valorNumerico: "",
      valorTexto: "",
      horarioVerificacao: `${DATA}T08:00:00Z`,
      momentoChecklist: momento,
    })),
    status,
    criadoEm: `${DATA}T08:00:00Z`,
    operador: "Teste",
  };
}

const [MOM_A, MOM_B, MOM_C] = MOMENTOS_CHECKLIST;

describe("montarFarol", () => {
  it("marca NR quando o checklist do momento não existe", () => {
    const [linha] = montarFarol({ checklists: [], data: DATA, maquinas: MAQ });
    expect(linha.celulas.map((c) => c.estado)).toEqual(["nr", "nr", "nr"]);
  });

  it("NC vence conforme na mesma célula", () => {
    const [linha] = montarFarol({
      checklists: [checklist(MOM_A, ["Conforme", "Não conforme", "Conforme"])],
      data: DATA,
      maquinas: MAQ,
    });
    expect(linha.celulas[0].estado).toBe("nc");
    expect(linha.celulas[0].totalNc).toBe(1);
  });

  it("tudo não aplicável vira NA, não conforme", () => {
    // É o caso do pós-setup: em 71% dos turnos não houve setup.
    const [linha] = montarFarol({
      checklists: [checklist(MOM_C, ["Não aplicável", "Não aplicável"])],
      data: DATA,
      maquinas: MAQ,
    });
    expect(linha.celulas[2].estado).toBe("na");
  });

  it("conforme quando tem resposta boa e nenhuma NC", () => {
    const [linha] = montarFarol({
      checklists: [checklist(MOM_B, ["Conforme", "Não aplicável"])],
      data: DATA,
      maquinas: MAQ,
    });
    expect(linha.celulas[1].estado).toBe("conforme");
  });

  it("limpeza aguardando validação deixa a célula pendente do líder", () => {
    const [linha] = montarFarol({
      checklists: [checklist(MOM_A, ["Conforme"])],
      limpezas: [
        { dataOperacao: DATA, turno: "12x36 Dia", status: "aguardando_validacao" } as never,
      ],
      data: DATA,
      maquinas: MAQ,
    });
    expect(linha.celulas[0].estado).toBe("pendente_validacao");
  });

  it("máquina não implantada fica fora da conta", () => {
    const linhas = montarFarol({ checklists: [], data: DATA, maquinas: MAQ });
    expect(linhas[1].celulas.every((c) => c.estado === "sem_escopo")).toBe(true);
    // 1 máquina ativa x 3 momentos = 3 células avaliadas
    expect(resumirFarol(linhas).totalAvaliado).toBe(3);
  });

  it("ignora checklist de outro dia e de outro turno", () => {
    const outroDia = checklist(MOM_A, ["Conforme"]);
    outroDia.contexto.data = "2026-08-09";
    const outroTurno = checklist(MOM_B, ["Conforme"]);
    outroTurno.contexto.turno = "12x36 Noite";

    const [linha] = montarFarol({
      checklists: [outroDia, outroTurno],
      data: DATA,
      turno: "12x36 Dia",
      maquinas: MAQ,
    });
    expect(linha.celulas[0].estado).toBe("nr");
    expect(linha.celulas[1].estado).toBe("nr");
  });

  it("percentual de cumprimento conta o que não foi realizado", () => {
    const linhas = montarFarol({
      checklists: [checklist(MOM_A, ["Conforme"]), checklist(MOM_B, ["Conforme"])],
      data: DATA,
      maquinas: MAQ,
    });
    const resumo = resumirFarol(linhas);
    expect(resumo.nr).toBe(1); // só o pós-setup ficou sem
    expect(percentualCumprimento(resumo)).toBe(67); // 2 de 3
  });
});
