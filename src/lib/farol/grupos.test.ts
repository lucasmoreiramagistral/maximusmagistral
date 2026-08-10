import { describe, expect, it } from "vitest";
import { agruparPendencias, ocorrenciaRepresentante } from "./grupos";
import type { Pendencia } from "./pendencias";
import type { PlanoAcao } from "./planos-types";

function ocorrencia(over: Partial<Pendencia> = {}): Pendencia {
  return {
    chave: `nr:${Math.random()}`,
    tipo: "nc",
    maquina: "Enchedora 3",
    momento: null,
    turno: "12x36 Dia",
    dataOrigem: "2026-05-01",
    idadeDias: 101,
    titulo: "Limpeza · item 2 — dispenser de sabão",
    contexto: "Antessala de envase · Abastecimento",
    detalhe: "Sem o recipiente",
    plano: null,
    origemTipo: "limpeza",
    origemId: `l-${Math.random()}`,
    itemNumero: 2,
    ...over,
  };
}

function plano(over: Partial<PlanoAcao> = {}): PlanoAcao {
  return {
    id: "p1",
    origemTipo: "limpeza",
    origemId: "l-qualquer",
    itemNumero: 2,
    dataOperacao: "2026-05-01",
    linha: "Linha 3",
    maquina: "Enchedora 3",
    momento: null,
    turno: "12x36 Dia",
    equipe: null,
    acaoImediata: null,
    oQue: "Instalar recipiente novo",
    quem: "Manutenção",
    quando: "2026-05-05",
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
    criadoEm: "2026-05-02T10:00:00Z",
    substituiPlanoId: null,
    ...over,
  };
}

describe("agruparPendencias", () => {
  it("47 ocorrencias do mesmo item viram UM grupo", () => {
    // O caso real: 426 linhas na tela, quase todas repetindo o mesmo item.
    const ocorrencias = Array.from({ length: 47 }, (_, i) =>
      ocorrencia({ dataOrigem: `2026-05-${String((i % 28) + 1).padStart(2, "0")}` }),
    );
    const g = agruparPendencias(ocorrencias, []);
    expect(g).toHaveLength(1);
    expect(g[0].qtd).toBe(47);
    expect(g[0].titulo).toContain("dispenser de sabão");
  });

  it("itens diferentes continuam separados", () => {
    const g = agruparPendencias(
      [ocorrencia({ itemNumero: 2 }), ocorrencia({ itemNumero: 7 })],
      [],
    );
    expect(g).toHaveLength(2);
  });

  it("mesmo numero de item em maquinas diferentes sao problemas diferentes", () => {
    const g = agruparPendencias(
      [ocorrencia({ maquina: "Enchedora 3" }), ocorrencia({ maquina: "Rotuladora 3" })],
      [],
    );
    expect(g).toHaveLength(2);
  });

  it("validacao nao se mistura com item fora do padrao", () => {
    const g = agruparPendencias(
      [ocorrencia({ tipo: "nc" }), ocorrencia({ tipo: "validacao", itemNumero: null })],
      [],
    );
    expect(g).toHaveLength(2);
    expect(g.map((x) => x.tipo).sort()).toEqual(["nc", "validacao"]);
  });

  it("um plano do item cobre o grupo inteiro", () => {
    // O plano nasceu de UMA ocorrencia mas vale para o item.
    const g = agruparPendencias(
      [ocorrencia({ origemId: "l-1" }), ocorrencia({ origemId: "l-2" })],
      [plano({ origemId: "l-1" })],
    );
    expect(g[0].qtd).toBe(2);
    expect(g[0].plano?.id).toBe("p1");
  });

  it("reincidencia depois do plano aprovado e sinalizada", () => {
    // Cumpriu, aprovou, e o problema voltou: a causa nao foi eliminada.
    const aprovado = plano({
      status: "cumprido",
      checagemCumprido: true,
      checagemSaiuNc: true,
      checadoEm: "2026-06-01T10:00:00Z",
    });
    const g = agruparPendencias(
      [ocorrencia({ dataOrigem: "2026-05-01" }), ocorrencia({ dataOrigem: "2026-07-15" })],
      [aprovado],
    );
    expect(g[0].reincidiuAposPlano).toBe(true);
  });

  it("sem ocorrencia posterior ao plano, nao e reincidencia", () => {
    const aprovado = plano({
      status: "cumprido",
      checagemCumprido: true,
      checagemSaiuNc: true,
      checadoEm: "2026-08-01T10:00:00Z",
    });
    const g = agruparPendencias([ocorrencia({ dataOrigem: "2026-05-01" })], [aprovado]);
    expect(g[0].reincidiuAposPlano).toBe(false);
  });

  it("ordem da pauta: reincidente primeiro, depois o mais frequente", () => {
    const reincidente = ocorrencia({ itemNumero: 9, dataOrigem: "2026-07-20" });
    const aprovado = plano({
      itemNumero: 9,
      status: "cumprido",
      checagemCumprido: true,
      checagemSaiuNc: true,
      checadoEm: "2026-06-01T10:00:00Z",
    });
    const frequentes = Array.from({ length: 5 }, () => ocorrencia({ itemNumero: 2 }));

    const g = agruparPendencias([...frequentes, reincidente], [aprovado]);
    expect(g[0].itemNumero).toBe(9); // reincidente vem antes
    expect(g[1].qtd).toBe(5);
  });

  it("guarda os turnos distintos e o intervalo de datas", () => {
    const g = agruparPendencias(
      [
        ocorrencia({ dataOrigem: "2026-05-01", turno: "12x36 Dia" }),
        ocorrencia({ dataOrigem: "2026-07-01", turno: "12x36 Noite" }),
        ocorrencia({ dataOrigem: "2026-06-01", turno: "12x36 Dia" }),
      ],
      [],
    );
    expect(g[0].primeiraData).toBe("2026-05-01");
    expect(g[0].ultimaData).toBe("2026-07-01");
    expect(g[0].turnos.sort()).toEqual(["12x36 Dia", "12x36 Noite"]);
  });

  it("representante do grupo e a ocorrencia mais recente", () => {
    const g = agruparPendencias(
      [ocorrencia({ dataOrigem: "2026-05-01" }), ocorrencia({ dataOrigem: "2026-08-01" })],
      [],
    );
    expect(ocorrenciaRepresentante(g[0]).dataOrigem).toBe("2026-08-01");
  });
});
