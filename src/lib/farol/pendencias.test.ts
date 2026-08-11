import { describe, expect, it } from "vitest";
import {
  levantarPendencias,
  planoAprovado,
  planoEncerraOcorrencia,
  faixaIdade,
} from "./pendencias";
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
      planos: [
        plano({
          status: "cumprido",
          checagemCumprido: true,
          checagemSaiuNc: true,
          checadoEm: "2026-06-01T10:00:00Z",
        }),
      ],
      hoje: HOJE,
    });
    expect(p).toHaveLength(0);
  });

  it("plano cumprido SEM data de checagem nao encerra nada", () => {
    // Dado malformado. checarPlano sempre grava checado_em; um "cumprido" sem
    // ela nao passou por checagem nenhuma e nao pode apagar o passivo.
    const p = levantarPendencias({
      checklists: [checklistComNc("c-antigo", "2026-05-20")],
      limpezas: [],
      planos: [
        plano({
          status: "cumprido",
          checagemCumprido: true,
          checagemSaiuNc: true,
          checadoEm: null,
        }),
      ],
      hoje: HOJE,
    });
    expect(p).toHaveLength(1);
  });

  it("ocorrencia POSTERIOR a checagem nao e apagada pelo plano", () => {
    // Reincidencia. Antes, o plano casava por item e encerrava tudo do item —
    // entao aprovar um plano em junho apagaria a falha de agosto, e o problema
    // sumia da tela sem ter parado na fabrica.
    const p = levantarPendencias({
      checklists: [
        checklistComNc("c-antes", "2026-05-20"),
        checklistComNc("c-depois", "2026-08-01"),
      ],
      limpezas: [],
      planos: [
        plano({
          status: "cumprido",
          checagemCumprido: true,
          checagemSaiuNc: true,
          checadoEm: "2026-06-01T10:00:00Z",
        }),
      ],
      hoje: HOJE,
    });
    expect(p).toHaveLength(1);
    expect(p[0].dataOrigem).toBe("2026-08-01");
  });

  it("plano casa por item+maquina, nao pela ocorrencia em que nasceu", () => {
    // O plano nasceu de "c-antigo" mas vale para o item 5 da Enchedora 3.
    // Pedir um plano por ocorrencia daria 151 planos para trocar um dispenser.
    const p = levantarPendencias({
      checklists: [checklistComNc("c-outro-turno", "2026-05-21")],
      limpezas: [],
      planos: [
        plano({
          origemId: "c-antigo",
          status: "cumprido",
          checagemCumprido: true,
          checagemSaiuNc: true,
          checadoEm: "2026-06-01T10:00:00Z",
        }),
      ],
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
      checklists: [checklistComNc("c-novo", "2026-08-09"), checklistComNc("c-velho", "2026-05-20")],
      limpezas: [],
      planos: [],
      hoje: HOJE,
    });
    expect(p.map((x) => x.idadeDias)).toEqual([82, 1]);
  });

  it("planoAprovado so aceita cumprido + saiu da NC", () => {
    expect(planoAprovado(null)).toBe(false);
    expect(planoAprovado(plano({ status: "aberto" }))).toBe(false);
    expect(planoAprovado(plano({ status: "cumprido", checagemSaiuNc: false }))).toBe(false);
    expect(planoAprovado(plano({ status: "cumprido", checagemSaiuNc: true }))).toBe(true);
  });

  it("planoEncerraOcorrencia corta na data da checagem", () => {
    const aprovado = plano({
      status: "cumprido",
      checagemSaiuNc: true,
      checadoEm: "2026-06-01T10:00:00Z",
    });
    expect(planoEncerraOcorrencia(aprovado, "2026-05-20")).toBe(true);
    expect(planoEncerraOcorrencia(aprovado, "2026-06-01")).toBe(true); // o proprio dia conta
    expect(planoEncerraOcorrencia(aprovado, "2026-06-02")).toBe(false); // reincidiu
    expect(planoEncerraOcorrencia(null, "2026-05-20")).toBe(false);
  });

  it("incluirEncerradas devolve o que o plano ja fechou", () => {
    // Sem isto, "avaliar melhorias" nao consegue provar melhoria nenhuma: o
    // problema eliminado sai da lista levando junto as ocorrencias que
    // formam o "antes" da comparacao, e todo ganho aparece como zero.
    const entrada = {
      checklists: [checklistComNc("c-antigo", "2026-05-20")],
      limpezas: [],
      planos: [
        plano({
          status: "cumprido",
          checagemCumprido: true,
          checagemSaiuNc: true,
          checadoEm: "2026-06-01T10:00:00Z",
        }),
      ],
      hoje: HOJE,
    };

    expect(levantarPendencias(entrada)).toHaveLength(0);
    const historico = levantarPendencias({ ...entrada, incluirEncerradas: true });
    expect(historico).toHaveLength(1);
    expect(historico[0].plano?.status).toBe("cumprido");
  });

  it("faixa de aging", () => {
    expect(faixaIdade(0)).toBe("hoje");
    expect(faixaIdade(7)).toBe("ate7");
    expect(faixaIdade(30)).toBe("ate30");
    expect(faixaIdade(108)).toBe("acima30");
  });
});

describe("farol com passivo", () => {
  it("NC antiga nao pinta a celula de hoje, mas continua visivel e contada", () => {
    // Duas mentiras opostas, e o farol nao pode contar nenhuma das duas:
    //
    //   1. farol de EVENTO: a NC de maio sumia quando virava o dia, e a tela
    //      dizia "Ciclo em dia" com 82 dias de pendencia escondida.
    //   2. passivo mandando na celula: o turno de hoje, que nao errou nada,
    //      aparecia vermelho por causa de uma NC de maio.
    //
    // A saida e nao empilhar os dois fatos na mesma cor: a celula responde
    // "como foi hoje", o passivo responde "o que ficou para tras".
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

    // hoje ainda esta correndo e ninguem preencheu: e isso que a cor diz
    expect(linha.celulas[0].estado).toBe("aguardando");
    // e a NC de maio NAO desapareceu
    expect(linha.celulas[0].passivoAnterior).toBe(1);
    expect(linha.celulas[0].idadeMaxDias).toBe(82);
    expect(linha.passivoTotal).toBe(1);
    expect(linha.passivoIdadeMaxDias).toBe(82);
    expect(linha.celulas[1].estado).toBe("aguardando");
  });

  it("NC de HOJE continua pintando a celula de hoje", () => {
    // O corte e por data, nao por "passivo nunca conta": o que nasceu hoje e
    // do turno de hoje e tem que aparecer na cor.
    const pendencias = levantarPendencias({
      checklists: [checklistComNc("c-hoje", HOJE)],
      limpezas: [],
      planos: [],
      hoje: HOJE,
    });

    const [linha] = montarFarol({
      checklists: [checklistComNc("c-hoje", HOJE)],
      data: HOJE,
      hoje: HOJE,
      pendencias,
      maquinas: [{ id: "Enchedora 3", nome: "Enchedora 3", detalhe: "", ativa: true }],
    });

    expect(linha.celulas[0].estado).toBe("nc");
    expect(linha.celulas[0].passivoAnterior).toBe(0); // nasceu hoje, nao e heranca
    expect(linha.passivoTotal).toBe(0);
  });

  it("limpeza e validacao nao entram em coluna do FM09", () => {
    // Com dado real isto pintava "+479 de antes" na coluna Pos-setup: 479
    // itens de limpeza FM28, que nao tem relacao nenhuma com pos-setup. Uma
    // coluna do FM09 falando de outro formulario nao informa, atrapalha.
    // Elas pertencem a maquina, nao a um momento do checklist.
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

    const doChecklist = linha.celulas.filter((c) => c.coluna.tipo === "checklist");
    const daLimpeza = linha.celulas.find((c) => c.coluna.tipo === "limpeza")!;

    // nenhuma coluna do FM09 recebeu a pendencia de limpeza
    expect(doChecklist.every((c) => c.pendencias.length === 0)).toBe(true);
    expect(doChecklist.every((c) => c.passivoAnterior === 0)).toBe(true);

    // ela esta na coluna que e dela, com a idade
    expect(daLimpeza.pendencias).toHaveLength(1);
    expect(daLimpeza.passivoAnterior).toBe(1);
    expect(daLimpeza.idadeMaxDias).toBe(108);
    expect(linha.passivoTotal).toBe(1);
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

describe("passivo aparece separado do estado do dia", () => {
  it("validacao antiga nao vira 'turno em andamento · ha 108 dias'", () => {
    // Bug pego no navegador: a celula mostrava "· Turno em andamento" com
    // "ha 108 dias" embaixo, na mesma cor. Contraditorio.
    //
    // A primeira correcao foi deixar o passivo mandar na cor. Resolveu a
    // contradicao e criou outra: dia limpo pintado de vermelho. Agora sao
    // dois campos, e a contradicao nao tem onde nascer.
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

    // Nenhuma coluna do FM09 fica contraditoria: a validacao nem entra nelas,
    // porque e do turno de limpeza, nao de um momento do checklist.
    const doChecklist = linha.celulas.filter((c) => c.coluna.tipo === "checklist");
    expect(doChecklist.every((c) => c.estado === "aguardando")).toBe(true);
    expect(doChecklist.every((c) => c.passivoAnterior === 0)).toBe(true);

    // A cor da coluna Limpeza tambem e do DIA (hoje nao teve limpeza ainda),
    // e o passivo de 108 dias aparece do lado, sem contradizer.
    const limpeza = linha.celulas.find((c) => c.coluna.tipo === "limpeza")!;
    expect(limpeza.estado).toBe("aguardando");
    expect(limpeza.passivoAnterior).toBe(1);
    expect(limpeza.idadeMaxDias).toBe(108);

    expect(linha.passivoTotal).toBe(1);
    expect(linha.passivoIdadeMaxDias).toBe(108);
  });
});
