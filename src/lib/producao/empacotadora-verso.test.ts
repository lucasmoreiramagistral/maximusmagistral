import { describe, expect, it } from "vitest";
import {
  conferirTotalPacotes,
  duracaoNoDiaOperacional,
  minutoNoDiaOperacional,
  validarBobinaFilme,
  validarBobinaParaFechamento,
  validarConsolidacaoParaFechamento,
  validarConsolidacaoProduto,
  type BobinaFilmeEmpacotadora,
  type ConsolidacaoProdutoEmpacotadora,
} from "./empacotadora-verso";

const base = {
  id: "linha-sintetica-1",
  folhaDiaKey: "folha-sintetica-linha-2",
  dataOperacao: "2026-09-21",
  maquina: "Empacotadora 2",
  linha: "Linha 2",
  codigoEquipamento: "LE-02",
  turno: "12x36 Noite",
  ordem: 1,
} as const;

const bobina: BobinaFilmeEmpacotadora = {
  ...base,
  produto: "Produto teste",
  especificacaoFilme: "Filme teste",
  fabricante: "Fabricante teste",
  numeroLote: "L-123",
  pesoLiquidoInicialKg: 32,
  pesoBrutoFinalKg: null,
  horaInicio: "22:40",
  horaTermino: "01:10",
  dataTerminoOperacao: "2026-09-21",
};

const consolidacao: ConsolidacaoProdutoEmpacotadora = {
  ...base,
  sabor: "Sabor teste",
  tamanho: "350 ml",
  horaInicio: "23:00",
  horaFinal: "04:00",
  quantidadePaletes: 2,
  quebraPacotes: 4,
  totalPacotes: 100,
};

describe("horários do verso da empacotadora", () => {
  it("mede intervalo que atravessa meia-noite dentro da mesma folha", () => {
    expect(minutoNoDiaOperacional("23:00")).toBe(1020);
    expect(minutoNoDiaOperacional("01:00")).toBe(1140);
    expect(duracaoNoDiaOperacional("22:40", "01:10")).toBe(150);
  });

  it("distingue 06:00 de abertura e fechamento e rejeita relógio inválido", () => {
    expect(minutoNoDiaOperacional("06:00", "inicio")).toBe(0);
    expect(minutoNoDiaOperacional("06:00", "fim")).toBe(1440);
    expect(duracaoNoDiaOperacional("05:59", "06:00")).toBe(1);
    expect(duracaoNoDiaOperacional("23:00", "06:01")).toBeNull();
    expect(minutoNoDiaOperacional("24:00")).toBeNull();
  });
});

describe("registro das bobinas", () => {
  it("aceita bobina aberta sem inventar peso ou horário final", () => {
    const aberta = { ...bobina, pesoBrutoFinalKg: null, horaTermino: null };
    expect(validarBobinaFilme(aberta)).toEqual([]);
    expect(validarBobinaParaFechamento(aberta)).toContainEqual(
      expect.objectContaining({ campo: "horaTermino", codigo: "obrigatorio" }),
    );
  });

  it("fecha bobina mesmo quando o peso bruto final não foi medido", () => {
    expect(validarBobinaParaFechamento(bobina)).toEqual([]);
    expect(validarBobinaParaFechamento({ ...bobina, pesoBrutoFinalKg: 0 })).toEqual([]);
  });

  it("permite encerrar no dia operacional seguinte e rejeita término anterior", () => {
    expect(validarBobinaParaFechamento({
      ...bobina,
      horaInicio: "05:30",
      horaTermino: "07:10",
      dataTerminoOperacao: "2026-09-22",
    })).toEqual([]);
    expect(validarBobinaParaFechamento({
      ...bobina,
      horaInicio: "05:30",
      horaTermino: "07:10",
      dataTerminoOperacao: "2026-09-21",
    })).toContainEqual(expect.objectContaining({ campo: "horaTermino", codigo: "intervalo_invalido" }));
  });

  it("rejeita peso negativo, data inexistente e contexto de linha trocado", () => {
    const erros = validarBobinaFilme({
      ...bobina,
      dataOperacao: "2026-02-30",
      linha: "Linha 3",
      pesoLiquidoInicialKg: -1,
    } as unknown as BobinaFilmeEmpacotadora); // simula registro inconsistente vindo da persistência
    expect(erros.map((erro) => erro.campo)).toEqual(
      expect.arrayContaining(["dataOperacao", "maquina", "pesoLiquidoInicialKg"]),
    );
  });
});

describe("consolidação de produto acabado", () => {
  it("aceita zero explícito, mas exige totais ainda em branco no fechamento", () => {
    expect(
      validarConsolidacaoParaFechamento({
        ...consolidacao,
        quantidadePaletes: 0,
        quebraPacotes: 0,
        totalPacotes: 0,
      }),
    ).toEqual([]);
    expect(validarConsolidacaoProduto({ ...consolidacao, totalPacotes: null })).toEqual([]);
    expect(
      validarConsolidacaoParaFechamento({ ...consolidacao, totalPacotes: null }),
    ).toContainEqual(expect.objectContaining({ campo: "totalPacotes", codigo: "obrigatorio" }));
  });

  it("confere o total somente quando a capacidade do palete foi informada", () => {
    expect(conferirTotalPacotes(consolidacao, 48)).toEqual([]);
    expect(conferirTotalPacotes(consolidacao, 200)).toContainEqual(
      expect.objectContaining({ campo: "totalPacotes", codigo: "total_divergente" }),
    );
    expect(conferirTotalPacotes({ ...consolidacao, totalPacotes: null }, 48)).toEqual([]);
  });

  it("rejeita contagens fracionárias e fim anterior ao início", () => {
    const erros = validarConsolidacaoProduto({
      ...consolidacao,
      quantidadePaletes: 1.5,
      horaInicio: "02:00",
      horaFinal: "01:00",
    });
    expect(erros.map((erro) => erro.campo)).toEqual(
      expect.arrayContaining(["quantidadePaletes", "horaFinal"]),
    );
  });
});
