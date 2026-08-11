import { describe, expect, it } from "vitest";
import {
  calcularCumprimentoPeriodo,
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

describe("calcularCumprimentoPeriodo", () => {
  function noDia(dia: string, turno: string, momentos: MomentoChecklist[]): Checklist[] {
    return momentos.map((m) => {
      const c = checklist(m, ["Conforme"]);
      c.contexto.data = dia;
      c.contexto.turno = turno as never;
      return c;
    });
  }

  const ROTINA = { turnos: ["12x36 Dia", "12x36 Noite"], vigenteDesde: "2026-01-01" };

  it("o esperado vem da rotina programada, nao dos registros encontrados", () => {
    // Um turno so preencheu. O outro estava programado e nao deu sinal: os 3
    // momentos dele CONTAM, como sem informacao.
    const r = calcularCumprimentoPeriodo(
      noDia("2026-08-09", "12x36 Dia", [MOM_A, MOM_B]),
      [],
      "2026-08-09",
      "2026-08-09",
      ROTINA,
    );
    expect(r.totalEsperado).toBe(6); // 2 turnos x 3, nao 3
    expect(r.totalRealizado).toBe(2);
    expect(r.totalSemInformacao).toBe(3); // o turno da noite inteiro
    expect(r.percentualGeral).toBe(33);
  });

  it("turno esquecido NAO some do denominador", () => {
    // Este e o furo que o denominador antigo tinha. Ele derivava o esperado
    // dos turnos que apareceram, entao um turno que nao registrou nada saia
    // da conta e o dia fechava em 100%. Era um indicador incapaz, por
    // construcao, de enxergar a falha que existe para pegar.
    const r = calcularCumprimentoPeriodo(
      noDia("2026-08-09", "12x36 Dia", [MOM_A, MOM_B, MOM_C]),
      [],
      "2026-08-09",
      "2026-08-09",
      ROTINA,
    );
    expect(r.percentualGeral).toBe(50); // e nao 100
    expect(r.totalSemInformacao).toBe(3);
  });

  it("dia inteiro sem registro conta como sem informacao, nao como parada", () => {
    // "Nao veio dado" nunca pode virar "a maquina nao rodou". Dos 23 dias com
    // um turno so no historico real, 22 nao tinham prova de nada.
    const r = calcularCumprimentoPeriodo(
      noDia("2026-08-09", "12x36 Dia", [MOM_A, MOM_B, MOM_C]),
      [],
      "2026-08-08",
      "2026-08-09",
      ROTINA,
    );
    expect(r.totalEsperado).toBe(12); // 2 dias x 2 turnos x 3
    expect(r.totalRealizado).toBe(3);
    expect(r.totalSemInformacao).toBe(9);
    expect(r.percentualGeral).toBe(25);
  });

  it("parada justificada SAI do denominador", () => {
    // O unico jeito de um turno sair da conta: motivo registrado.
    const r = calcularCumprimentoPeriodo(
      noDia("2026-08-09", "12x36 Dia", [MOM_A, MOM_B, MOM_C]),
      [],
      "2026-08-09",
      "2026-08-09",
      ROTINA,
      "Enchedora 3",
      [{ data: "2026-08-09", turno: "12x36 Noite", motivo: "sem programação" }],
    );
    expect(r.totalEsperado).toBe(3);
    expect(r.totalJustificado).toBe(3);
    expect(r.totalSemInformacao).toBe(0);
    expect(r.percentualGeral).toBe(100);
  });

  it("dia em andamento fica fora da conta", () => {
    // Senao, as 8h da manha o turno da noite daquele dia — que nem comecou —
    // ja aparece como "sem informacao", e o painel cobra rotina cuja janela
    // nao passou. Cumprimento e de dia FECHADO; o dia de hoje quem mostra e
    // o farol.
    const r = calcularCumprimentoPeriodo(
      noDia("2026-08-08", "12x36 Dia", [MOM_A, MOM_B, MOM_C]),
      [],
      "2026-08-08",
      "2026-08-09",
      ROTINA,
      "Enchedora 3",
      [],
      "2026-08-09", // hoje, ainda correndo
    );
    expect(r.dias).toHaveLength(1);
    expect(r.dias[0].data).toBe("2026-08-08");
    expect(r.excluiuDiaEmAndamento).toBe(true);
    expect(r.totalEsperado).toBe(6); // so o dia fechado
    expect(r.totalSemInformacao).toBe(3); // o turno da noite de 08, esse sim
  });

  it("nao cobra periodo anterior a entrada do v2", () => {
    // Senao o app nasce com 4 meses de vermelho que ninguem tem como responder.
    const r = calcularCumprimentoPeriodo(
      noDia("2026-08-09", "12x36 Dia", [MOM_A, MOM_B, MOM_C]),
      [],
      "2026-08-01",
      "2026-08-09",
      { turnos: ["12x36 Dia", "12x36 Noite"], vigenteDesde: "2026-08-09" },
    );
    expect(r.dias).toHaveLength(1);
    expect(r.totalEsperado).toBe(6);
  });

  it("limpeza conta como sinal de vida do turno", () => {
    // O turno da noite nao fez checklist nenhum, mas assinou limpeza: entao
    // ele rodou e falhou na rotina — e NAO "sem informacao".
    const r = calcularCumprimentoPeriodo(
      noDia("2026-08-09", "12x36 Dia", [MOM_A, MOM_B, MOM_C]),
      [
        { dataOperacao: "2026-08-09", turno: "12x36 Dia", status: "aguardando_validacao" } as never,
        { dataOperacao: "2026-08-09", turno: "12x36 Noite", status: "validado" } as never,
      ],
      "2026-08-09",
      "2026-08-09",
      ROTINA,
    );
    expect(r.limpezasSemValidacao).toBe(1);
    expect(r.totalEsperado).toBe(6);
    expect(r.totalSemInformacao).toBe(0); // deu sinal de vida
    expect(r.porTurno[0].turno).toBe("12x36 Noite"); // pior turno primeiro
    expect(r.porTurno[0].percentual).toBe(0);
  });
});

describe("dia em andamento nao vira cobranca", () => {
  it("hoje sem checklist fica aguardando, nao NR", () => {
    const [linha] = montarFarol({
      checklists: [],
      data: DATA,
      hoje: DATA, // mesmo dia = turno ainda correndo
      maquinas: MAQ,
    });
    expect(linha.celulas.map((c) => c.estado)).toEqual(["aguardando", "aguardando", "aguardando"]);
  });

  it("dia passado sem checklist continua NR", () => {
    const [linha] = montarFarol({
      checklists: [],
      data: "2026-08-09",
      hoje: DATA, // hoje e outro dia = 09/08 ja fechou
      maquinas: MAQ,
    });
    expect(linha.celulas.every((c) => c.estado === "nr")).toBe(true);
  });

  it("aguardando fica fora do denominador do cumprimento", () => {
    const linhas = montarFarol({
      checklists: [checklist(MOM_A, ["Conforme"])],
      data: DATA,
      hoje: DATA,
      maquinas: MAQ,
    });
    const resumo = resumirFarol(linhas);
    expect(resumo.aguardando).toBe(2);
    expect(resumo.totalAvaliado).toBe(1); // so o momento ja feito conta
    expect(percentualCumprimento(resumo)).toBe(100);
  });

  it("NC no dia corrente continua vermelho na hora", () => {
    // Alarme falso e ruim; esconder problema real e pior.
    const [linha] = montarFarol({
      checklists: [checklist(MOM_A, ["Nao conforme" as never])],
      data: DATA,
      hoje: DATA,
      maquinas: MAQ,
    });
    expect(linha.celulas[0].estado).not.toBe("aguardando");
  });
});
