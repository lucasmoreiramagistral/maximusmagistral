import { describe, expect, it } from "vitest";
import {
  calcularCumprimentoPeriodo,
  montarFarol,
  resumirFarol,
  percentualCumprimento,
  type CelulaFarol,
  type EstadoFarol,
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

/** Só as colunas do FM09 — o farol tem cinco, contando Limpeza e PTP. */
function estadosDoChecklist(linha: { celulas: CelulaFarol[] }): EstadoFarol[] {
  return linha.celulas.filter((c) => c.coluna.tipo === "checklist").map((c) => c.estado);
}

function coluna(linha: { celulas: CelulaFarol[] }, tipo: string): CelulaFarol {
  return linha.celulas.find((c) => c.coluna.tipo === tipo)!;
}

describe("montarFarol", () => {
  it("marca NR quando o checklist do momento não existe", () => {
    const [linha] = montarFarol({ checklists: [], data: DATA, maquinas: MAQ });
    expect(estadosDoChecklist(linha)).toEqual(["nr", "nr", "nr"]);
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

  it("limpeza sem validação acende a COLUNA DA LIMPEZA, não a do checklist", () => {
    // Antes o estado da limpeza vazava para a coluna do FM09. São formulários
    // diferentes: o checklist do momento A estava conforme e continua conforme.
    const [linha] = montarFarol({
      checklists: [checklist(MOM_A, ["Conforme"])],
      limpezas: [
        {
          dataOperacao: DATA,
          turno: "12x36 Dia",
          status: "aguardando_validacao",
          maquina: "Enchedora 3",
          itens: [],
        } as never,
      ],
      data: DATA,
      maquinas: MAQ,
    });
    expect(linha.celulas[0].estado).toBe("conforme");
    expect(coluna(linha, "limpeza").estado).toBe("pendente_validacao");
  });

  it("limpeza VALIDADA com item não realizado fica vermelha", () => {
    // A regra que o Lucas decidiu, e o caso real do dia 11/08: a limpeza estava
    // `validado` com o dispenser de sabão e o acúmulo de líquidos em aberto.
    // Assinatura fecha o turno, não resolve o item. Verde aqui seria o farol
    // dizendo que está tudo certo com dois itens quebrados.
    const [linha] = montarFarol({
      checklists: [],
      limpezas: [
        {
          dataOperacao: DATA,
          turno: "12x36 Noite",
          status: "validado",
          maquina: "Enchedora 3",
          itens: [
            { codigo: 2, status: "nao_realizado", descricao: "dispenser de sabão" },
            { codigo: 7, status: "nao_realizado", descricao: "acúmulo de líquidos" },
            { codigo: 3, status: "realizado", descricao: "ok" },
          ],
        } as never,
      ],
      data: DATA,
      maquinas: MAQ,
    });
    const limpeza = coluna(linha, "limpeza");
    expect(limpeza.estado).toBe("nc");
    expect(limpeza.totalNc).toBe(2);
    expect(limpeza.detalhe).toContain("2 itens não realizados");
    expect(limpeza.detalhe).toContain("já validada");
  });

  it("limpeza sem item em aberto e validada fica conforme", () => {
    const [linha] = montarFarol({
      checklists: [],
      limpezas: [
        {
          dataOperacao: DATA,
          turno: "12x36 Dia",
          status: "validado",
          maquina: "Enchedora 3",
          itens: [{ codigo: 1, status: "realizado", descricao: "ok" }],
        } as never,
      ],
      data: DATA,
      maquinas: MAQ,
    });
    expect(coluna(linha, "limpeza").estado).toBe("conforme");
  });

  it("PTP incompleto num dia fechado é NR, e completo é conforme", () => {
    const janela = (codigo: string, status = "sem_ocorrencia") =>
      ({
        dataOperacao: DATA,
        maquina: "Enchedora 3",
        janelaCodigo: codigo,
        statusJanela: status,
      }) as never;

    const parcial = montarFarol({
      checklists: [],
      ptp: [janela("J01"), janela("J02"), janela("J03")],
      data: DATA,
      maquinas: MAQ,
    })[0];
    expect(coluna(parcial, "ptp").estado).toBe("nr");
    expect(coluna(parcial, "ptp").detalhe).toBe("3 de 12 janelas");

    const completo = montarFarol({
      checklists: [],
      ptp: Array.from({ length: 12 }, (_, i) => janela(`J${String(i + 1).padStart(2, "0")}`)),
      data: DATA,
      maquinas: MAQ,
    })[0];
    expect(coluna(completo, "ptp").estado).toBe("conforme");

    const comOcorrencia = montarFarol({
      checklists: [],
      ptp: [janela("J01", "houve_ocorrencia")],
      data: DATA,
      maquinas: MAQ,
    })[0];
    expect(coluna(comOcorrencia, "ptp").estado).toBe("nc");
  });

  it("o numero e a lista de itens saem da MESMA fonte", () => {
    // O cartao do farol mostra um numero e, ao ser tocado, abre a lista.
    // Se a contagem e a lista forem calculadas por caminhos separados, elas
    // concordam por coincidencia ate alguem mexer em um so — foi assim que o
    // cartao passou a dizer "1" com a celula dizendo "2 itens" logo acima.
    //
    // Aqui totalNc e derivado de itensNc.length nas tres rotinas. Este teste
    // existe para que a divergencia nao possa voltar em silencio.
    const [linha] = montarFarol({
      checklists: [checklist(MOM_A, ["Não conforme", "Conforme", "Não conforme"])],
      limpezas: [
        {
          dataOperacao: DATA,
          turno: "12x36 Dia",
          status: "aguardando_validacao",
          maquina: "Enchedora 3",
          itens: [
            { codigo: 2, status: "nao_realizado", descricao: "dispenser", observacao: "sem sabão" },
            { codigo: 7, status: "nao_realizado", descricao: "liquidos" },
            { codigo: 3, status: "realizado", descricao: "ok" },
          ],
        } as never,
      ],
      data: DATA,
      maquinas: MAQ,
    });

    for (const c of linha.celulas) {
      expect(c.itensNc.length).toBe(c.totalNc);
    }

    // e o resumo tambem: ncItens soma os ITENS, nc soma as CELULAS
    const resumo = resumirFarol([linha]);
    expect(resumo.nc).toBe(2); // checklist A + limpeza
    expect(resumo.ncItens).toBe(4); // 2 no checklist + 2 na limpeza

    const daLimpeza = coluna(linha, "limpeza");
    expect(daLimpeza.itensNc[0].observacao).toBe("sem sabão");
    expect(daLimpeza.itensNc[0].turno).toBe("12x36 Dia");
  });

  it("máquina não implantada fica fora da conta", () => {
    const linhas = montarFarol({ checklists: [], data: DATA, maquinas: MAQ });
    expect(linhas[1].celulas.every((c) => c.estado === "sem_escopo")).toBe(true);
    // 1 máquina ativa x 5 rotinas (A, B, C, Limpeza, PTP)
    expect(resumirFarol(linhas).totalAvaliado).toBe(5);
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
    // pós-setup + limpeza + PTP ficaram sem registro nenhum
    expect(resumo.nr).toBe(3);
    expect(percentualCumprimento(resumo)).toBe(40); // 2 de 5
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
    // Vale para as cinco rotinas: nada venceu ainda hoje.
    expect(linha.celulas.every((c) => c.estado === "aguardando")).toBe(true);
    expect(estadosDoChecklist(linha)).toEqual(["aguardando", "aguardando", "aguardando"]);
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
    // B, C, Limpeza e PTP ainda nao venceram hoje
    expect(resumo.aguardando).toBe(4);
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
