import { describe, expect, it } from "vitest";
import {
  avaliarMelhorias,
  avaliarRotinaLideranca,
  resumirMelhorias,
  DIAS_PARA_ELIMINADO,
} from "./eficacia";
import type { GrupoPendencia } from "./grupos";
import type { PlanoAcao } from "./planos-types";
import type { Pendencia } from "./pendencias";

const HOJE = "2026-08-10";

function ocorrencia(data: string): Pendencia {
  return {
    chave: `o-${data}-${Math.random()}`,
    tipo: "nc",
    maquina: "Enchedora 3",
    momento: null,
    turno: "12x36 Dia",
    dataOrigem: data,
    idadeDias: 0,
    titulo: "Limpeza · item 2 — dispenser de sabão",
    contexto: "Antessala",
    detalhe: "Sem o recipiente",
    plano: null,
    origemTipo: "limpeza",
    origemId: "l1",
    itemNumero: 2,
  };
}

function plano(over: Partial<PlanoAcao> = {}): PlanoAcao {
  return {
    id: "p1",
    origemTipo: "limpeza",
    origemId: "l1",
    itemNumero: 2,
    dataOperacao: "2026-05-01",
    linha: "Linha 3",
    maquina: "Enchedora 3",
    momento: null,
    turno: "12x36 Dia",
    equipe: null,
    acaoImediata: null,
    oQue: "Instalar recipiente",
    quem: "Manutenção",
    quando: "2026-05-10",
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
    criadoEm: "2026-05-05T10:00:00Z",
    substituiPlanoId: null,
    ...over,
  };
}

function grupo(datas: string[], p: PlanoAcao | null): GrupoPendencia {
  const ocorrencias = datas.map(ocorrencia);
  return {
    chave: "g1",
    tipo: "nc",
    titulo: "Limpeza · item 2 — dispenser de sabão",
    contexto: "Antessala",
    maquina: "Enchedora 3",
    origemTipo: "limpeza",
    itemNumero: 2,
    ocorrencias,
    qtd: ocorrencias.length,
    idadeMaxDias: 100,
    faixa: "acima30",
    primeiraData: datas[0],
    ultimaData: datas[datas.length - 1],
    turnos: ["12x36 Dia"],
    plano: p,
    reincidiuAposPlano: false,
  };
}

describe("avaliarMelhorias", () => {
  it("sem plano, ninguem assumiu", () => {
    const [m] = avaliarMelhorias([grupo(["2026-05-01", "2026-06-01"], null)], HOJE);
    expect(m.status).toBe("sem_plano");
    expect(m.antes).toBe(2);
  });

  it("plano aberto e execucao, ainda nao da para avaliar", () => {
    const [m] = avaliarMelhorias([grupo(["2026-05-01"], plano())], HOJE);
    expect(m.status).toBe("em_execucao");
  });

  it("aprovado ha mais de 30 dias sem voltar = ELIMINADO", () => {
    // É isto que "avaliar melhorias" significa: o problema parou.
    const aprovado = plano({
      status: "cumprido",
      checagemCumprido: true,
      checagemSaiuNc: true,
      checadoEm: "2026-06-01T10:00:00Z",
    });
    const [m] = avaliarMelhorias([grupo(["2026-05-01", "2026-05-20"], aprovado)], HOJE);
    expect(m.status).toBe("eliminado");
    expect(m.antes).toBe(2);
    expect(m.depois).toBe(0);
  });

  it("aprovado ha menos de 30 dias ainda e monitoramento", () => {
    const aprovado = plano({
      status: "cumprido",
      checagemCumprido: true,
      checagemSaiuNc: true,
      checadoEm: "2026-08-01T10:00:00Z",
    });
    const [m] = avaliarMelhorias([grupo(["2026-05-01"], aprovado)], HOJE);
    expect(m.status).toBe("monitorando");
  });

  it("voltou depois de aprovado = REINCIDIU, e o plano nao resolveu", () => {
    const aprovado = plano({
      status: "cumprido",
      checagemCumprido: true,
      checagemSaiuNc: true,
      checadoEm: "2026-06-01T10:00:00Z",
    });
    const [m] = avaliarMelhorias([grupo(["2026-05-01", "2026-07-15"], aprovado)], HOJE);
    expect(m.status).toBe("reincidiu");
    expect(m.antes).toBe(1);
    expect(m.depois).toBe(1);
  });

  it("reincidencia vem primeiro na lista", () => {
    const aprovado = plano({
      status: "cumprido",
      checagemSaiuNc: true,
      checadoEm: "2026-06-01T10:00:00Z",
    });
    const g1 = grupo(["2026-05-01"], null); // sem plano
    const g2 = { ...grupo(["2026-05-01", "2026-07-15"], aprovado), chave: "g2" };
    const m = avaliarMelhorias([g1, g2], HOJE);
    expect(m[0].status).toBe("reincidiu");
  });

  it("resumo conta ocorrencias evitadas", () => {
    const aprovado = plano({
      status: "cumprido",
      checagemSaiuNc: true,
      checadoEm: "2026-06-01T10:00:00Z",
    });
    const r = resumirMelhorias(
      avaliarMelhorias([grupo(["2026-05-01", "2026-05-02", "2026-05-03"], aprovado)], HOJE),
    );
    expect(r.eliminados).toBe(1);
    expect(r.ocorrenciasEvitadas).toBe(3);
  });

  it("DIAS_PARA_ELIMINADO e o criterio documentado", () => {
    expect(DIAS_PARA_ELIMINADO).toBe(30);
  });

  it("plano checado e sem decisao A fica marcado como ciclo aberto", () => {
    // O plano parava no C: "o problema saiu" e ninguem decidia se aquilo
    // virava padrao. As colunas existiam no banco desde a migration 04 e
    // nenhuma tela as preenchia.
    const checado = plano({
      status: "cumprido",
      checagemSaiuNc: true,
      checadoEm: "2026-06-01T10:00:00Z",
    });
    const [m] = avaliarMelhorias([grupo(["2026-05-01"], checado)], HOJE);
    expect(m.esperandoPadronizacao).toBe(true);
    expect(m.plano?.id).toBe("p1");
  });

  it("depois da decisao A o ciclo deixa de cobrar", () => {
    const fechado = plano({
      status: "cumprido",
      checagemSaiuNc: true,
      checadoEm: "2026-06-01T10:00:00Z",
      padronizacaoDecisao: "padronizar",
      padraoRef: "FM28 rev.3 — item 2",
      padronizadoEm: "2026-06-05T10:00:00Z",
    });
    const [m] = avaliarMelhorias([grupo(["2026-05-01"], fechado)], HOJE);
    expect(m.esperandoPadronizacao).toBe(false);
  });

  it("plano ainda nao checado nao cobra o A", () => {
    // Nao faz sentido decidir sobre padrao antes de saber se funcionou.
    const [m] = avaliarMelhorias([grupo(["2026-05-01"], plano())], HOJE);
    expect(m.esperandoPadronizacao).toBe(false);
  });
});

describe("avaliarRotinaLideranca", () => {
  it("mede quanto tempo levou para virar plano", () => {
    // Problema apareceu em 01/05, plano aberto em 05/05 = 4 dias.
    const g = grupo(["2026-05-01"], plano({ criadoEm: "2026-05-05T10:00:00Z" }));
    const r = avaliarRotinaLideranca([g], [g.plano!], HOJE);
    expect(r.tempoMedioAberturaDias).toBe(4);
    expect(r.comPlano).toBe(1);
    expect(r.pctComPlano).toBe(100);
  });

  it("conta o que nao virou plano", () => {
    const r = avaliarRotinaLideranca(
      [grupo(["2026-05-01"], null), grupo(["2026-05-01"], plano())],
      [plano()],
      HOJE,
    );
    expect(r.semPlano).toBe(1);
    expect(r.pctComPlano).toBe(50);
  });

  it("plano vencido sem recurso liberado e cobranca da GI", () => {
    const vencido = plano({ quando: "2026-06-01" });
    const r = avaliarRotinaLideranca([grupo(["2026-05-01"], vencido)], [vencido], HOJE);
    expect(r.vencidosSemRecurso).toBe(1);
  });

  it("recurso liberado tira da fila de cobranca", () => {
    const vencido = plano({ quando: "2026-06-01", recursoLiberadoEm: "2026-06-02T10:00:00Z" });
    const r = avaliarRotinaLideranca([grupo(["2026-05-01"], vencido)], [vencido], HOJE);
    expect(r.vencidosSemRecurso).toBe(0);
  });

  it("sem plano nenhum, tempo medio e nulo em vez de zero", () => {
    // Zero diria "responderam na hora", que e mentira.
    const r = avaliarRotinaLideranca([grupo(["2026-05-01"], null)], [], HOJE);
    expect(r.tempoMedioAberturaDias).toBeNull();
  });
});
