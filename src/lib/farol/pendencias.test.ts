import { describe, expect, it } from "vitest";
import { levantarPendencias, planoEncerraPendencia, faixaIdade } from "./pendencias";
import { montarFarol } from "./farol";
import type { PlanoAcao } from "./planos-types";
import type { Checklist } from "@/lib/checklist/types";
import { MOMENTOS_CHECKLIST } from "@/lib/checklist/types";

const HOJE = "2026-08-10";
const [MOM_A] = MOMENTOS_CHECKLIST;

function checklistComNc(id: string, data: string): Checklist {
  return {
    id,
    contexto: {
      data,
      turno: "12x36 Dia",
      equipe: "Nilson",
      linha: "Linha 3",
      maquina: "Enchedora 3",
    },
    momento: MOM_A,
    respostas: [
      {
        itemNumero: 5,
        descricao: "Detector de metal",
        resposta: "Não conforme",
        observacao: "Reduzida a velocidade",
        valorNumerico: "",
        valorTexto: "",
        horarioVerificacao: `${data}T08:00:00Z`,
        momentoChecklist: MOM_A,
      },
    ],
    status: "concluido",
    criadoEm: `${data}T08:00:00Z`,
    operador: "Teste",
  };
}

function plano(over: Partial<PlanoAcao> = {}): PlanoAcao {
  return {
    id: "p1",
    origemTipo: "checklist",
    origemId: "c-antigo",
    itemNumero: 5,
    dataOperacao: "2026-05-20",
    linha: "Linha 3",
    maquina: "Enchedora 3",
    momento: MOM_A,
    turno: "12x36 Dia",
    equipe: null,
    acaoImediata: null,
    oQue: "Trocar sensor",
    quem: "Jonas",
    quando: "2026-05-22",
    como: null,
    status: "aberto",
    checagemCumprido: null,
    checagemSaiuNc: null,
    checagemEvidencia: null,
    checadoPorNome: null,
    checadoEm: null,
    padronizacaoAnalise: null,
    padronizacaoDecisao: null,
    padraoRef: null,
    padronizadoPorNome: null,
    padronizadoEm: null,
    recursoSolicitado: false,
    recursoObservacao: null,
    recursoLiberadoPor: null,
    recursoLiberadoEm: null,
    criadoPorLogin: "lider",
    criadoPorNome: "Líder",
    criadoEm: "2026-05-20T10:00:00Z",
    substituiPlanoId: null,
    ...over,
  };
}

describe("levantarPendencias", () => {
  it("NC de maio continua aberta hoje, com a idade certa", () => {
    // O furo que o farol de evento tinha: a NC sumia quando virava o dia.
    const p = levantarPendencias({
      checklists: [checklistComNc("c-antigo", "2026-05-20")],
      limpezas: [],
      planos: [],
      hoje: HOJE,
    });
    expect(p).toHaveLength(1);
    expect(p[0].tipo).toBe("nc");
    expect(p[0].idadeDias).toBe(82);
  });

  it("plano cumprido E saiu da NC encerra a pendência", () => {
    const p = levantarPendencias({
      checklists: [checklistComNc("c-antigo", "2026-05-20")],
      limpezas: [],
      planos: [plano({ status: "cumprido", checagemCumprido: true, checagemSaiuNc: true })],
      hoje: HOJE,
    });
    expect(p).toHaveLength(0);
  });

  it("plano cumprido mas que NAO saiu da NC continua aberto", () => {
    // É o "Farol Sim/Não" do papel: fez o combinado mas o problema seguiu.
    const p = levantarPendencias({
      checklists: [checklistComNc("c-antigo", "2026-05-20")],
      limpezas: [],
      planos: [plano({ status: "cumprido", checagemCumprido: true, checagemSaiuNc: false })],
      hoje: HOJE,
    });
    expect(p).toHaveLength(1);
  });

  it("plano reprovado nao encerra", () => {
    const p = levantarPendencias({
      checklists: [checklistComNc("c-antigo", "2026-05-20")],
      limpezas: [],
      planos: [plano({ status: "nao_cumprido", checagemCumprido: false })],
      hoje: HOJE,
    });
    expect(p).toHaveLength(1);
    expect(p[0].plano?.status).toBe("nao_cumprido");
  });

  it("limpeza sem validacao vira pendencia com idade", () => {
    const p = levantarPendencias({
      checklists: [],
      limpezas: [
        {
          id: "l1",
          dataOperacao: "2026-04-24",
          turno: "12x36 Dia",
          status: "aguardando_validacao",
          maquina: "Enchedora 3",
        } as never,
      ],
      planos: [],
      hoje: HOJE,
    });
    expect(p[0].tipo).toBe("validacao");
    expect(p[0].idadeDias).toBe(108); // a real do banco
  });

  it("ordena da mais velha para a mais nova", () => {
    const p = levantarPendencias({
      checklists: [
        checklistComNc("c-novo", "2026-08-09"),
        checklistComNc("c-velho", "2026-05-20"),
      ],
      limpezas: [],
      planos: [],
      hoje: HOJE,
    });
    expect(p.map((x) => x.idadeDias)).toEqual([82, 1]);
  });

  it("planoEncerraPendencia so aceita cumprido + saiu da NC", () => {
    expect(planoEncerraPendencia(null)).toBe(false);
    expect(planoEncerraPendencia(plano({ status: "aberto" }))).toBe(false);
    expect(
      planoEncerraPendencia(plano({ status: "cumprido", checagemSaiuNc: true })),
    ).toBe(true);
  });

  it("faixa de aging", () => {
    expect(faixaIdade(0)).toBe("hoje");
    expect(faixaIdade(7)).toBe("ate7");
    expect(faixaIdade(30)).toBe("ate30");
    expect(faixaIdade(108)).toBe("acima30");
  });
});

describe("farol com passivo", () => {
  it("celula fica vermelha hoje por causa de NC antiga, mesmo sem checklist hoje", () => {
    // Este é o caso que o farol antigo mostrava como "Ciclo em dia".
    const pendencias = levantarPendencias({
      checklists: [checklistComNc("c-antigo", "2026-05-20")],
      limpezas: [],
      planos: [],
      hoje: HOJE,
    });

    const [linha] = montarFarol({
      checklists: [],
      data: HOJE,
      hoje: HOJE,
      pendencias,
      maquinas: [{ id: "Enchedora 3", nome: "Enchedora 3", detalhe: "", ativa: true }],
    });

    expect(linha.celulas[0].estado).toBe("nc");
    expect(linha.celulas[0].idadeMaxDias).toBe(82);
    // os outros momentos seguem só com o estado do dia
    expect(linha.celulas[1].estado).toBe("aguardando");
  });

  it("sem pendencia aberta, o dia corrente volta a mandar", () => {
    const [linha] = montarFarol({
      checklists: [],
      data: HOJE,
      hoje: HOJE,
      pendencias: [],
      maquinas: [{ id: "Enchedora 3", nome: "Enchedora 3", detalhe: "", ativa: true }],
    });
    expect(linha.celulas.every((c) => c.estado === "aguardando")).toBe(true);
  });
});

describe("passivo vence o estado do dia", () => {
  it("validacao antiga nao pode aparecer como 'turno em andamento'", () => {
    // Bug pego no navegador: a celula mostrava "· Turno em andamento" com
    // "ha 108 dias" embaixo. Contraditorio.
    const pendencias = levantarPendencias({
      checklists: [],
      limpezas: [
        {
          id: "l-velha",
          dataOperacao: "2026-04-24",
          turno: "12x36 Dia",
          status: "aguardando_validacao",
          maquina: "Enchedora 3",
        } as never,
      ],
      planos: [],
      hoje: HOJE,
    });

    const [linha] = montarFarol({
      checklists: [],
      data: HOJE,
      hoje: HOJE,
      pendencias,
      maquinas: [{ id: "Enchedora 3", nome: "Enchedora 3", detalhe: "", ativa: true }],
    });

    // validacao (sem momento) cai no ultimo momento
    const ultima = linha.celulas[linha.celulas.length - 1];
    expect(ultima.estado).toBe("pendente_validacao");
    expect(ultima.idadeMaxDias).toBe(108);
    // as outras seguem neutras, porque o dia corre
    expect(linha.celulas[0].estado).toBe("aguardando");
  });
});
