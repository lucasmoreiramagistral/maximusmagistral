import { describe, expect, it } from "vitest";
import {
  dataOperacionalAnterior,
  versoPublico,
  type BobinaRowPublica,
  type ConsolidacaoRowPublica,
} from "../../../supabase/functions/hora-x-hora-publico/verso";

const bobina: BobinaRowPublica = {
  maquina: "Empacotadora 2", turno: "12x36 Dia", ordem: 1,
  data_operacao: "2026-09-27", produto: "Cola 2L",
  especificacao_filme: "Filme A", fabricante: "Fábrica A", numero_lote: "L1",
  peso_liquido_inicial_kg: "12.500", peso_bruto_final_kg: null,
  hora_inicio: "07:10", hora_termino: null, data_termino_operacao: null,
};

const consolidacao: ConsolidacaoRowPublica = {
  maquina: "Empacotadora 2", turno: "12x36 Dia", ordem: 2,
  data_operacao: "2026-09-27", sabor: "Cola", tamanho: "2L",
  hora_inicio: "08:00", hora_final: "09:00", quantidade_paletes: 2,
  quebra_pacotes: 10, pacotes_por_palete: 48, total_pacotes: 106,
};

describe("verso público do Hora x Hora", () => {
  it("calcula a véspera inclusive na virada de mês", () => {
    expect(dataOperacionalAnterior("2026-10-01")).toBe("2026-09-30");
  });
  it("limita aos dados operacionais das empacotadoras no dia do token", () => {
    const comDadosPrivados = { ...bobina, operador_user_id: "privado", assinatura_lider: "privada" };
    const fechamentoComDadosPrivados = { ...consolidacao, operador_login: "privado" };
    const dados = versoPublico(
      "2026-09-27",
      [
        comDadosPrivados,
        { ...bobina, data_operacao: "2026-09-26", hora_inicio: null },
        { ...bobina, maquina: "Enchedora 2" },
      ],
      [
        fechamentoComDadosPrivados,
        { ...consolidacao, data_operacao: "2026-09-26" },
      ],
    );
    expect(dados.map((m) => [m.maquina, m.bobinas.length, m.consolidacoes.length])).toEqual([
      ["Empacotadora 2", 1, 1], ["Empacotadora 3", 0, 0],
    ]);
    expect(dados[0].bobinas[0].pesoLiquidoInicialKg).toBe(12.5);
    expect(dados[0].consolidacoes[0].totalPacotes).toBe(106);
    expect(JSON.stringify(dados)).not.toMatch(/operador_user_id|operador_login|assinatura_lider|privado/);
  });

  it("inclui bobina aberta iniciada antes e encerrada neste dia", () => {
    const dados = versoPublico("2026-09-27", [
      { ...bobina, data_operacao: "2026-09-26" },
      { ...bobina, data_operacao: "2026-09-26", hora_termino: "08:00", data_termino_operacao: "2026-09-27" },
      { ...bobina, data_operacao: "2026-08-10" },
      { ...bobina, data_operacao: "2026-08-10", hora_termino: "08:00", data_termino_operacao: "2026-09-27" },
    ], []);
    expect(dados[0].bobinas).toHaveLength(2);
  });
});
