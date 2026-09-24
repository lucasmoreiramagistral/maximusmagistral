import { describe, expect, it } from "vitest";
import { registrosPublicos } from "../../../supabase/functions/hora-x-hora-publico/dados";

describe("dados do painel publico", () => {
  it("mostra somente os campos operacionais de quatro maquinas", () => {
    const registros = registrosPublicos([
      {
        maquina: "Enchedora 2", hora_codigo: "H04", quantidade: 15200,
        tempo_parada_min: 12, motivo_parada_codigo: "parada_empacotadora",
        operador_nome: "João Silva", produto_sabor: "Cola", produto_tamanho: "2L",
        meta: 16000, nao_rodou: false, observacao: "Texto privado",
      },
      {
        maquina: "Outra maquina", hora_codigo: "H04", quantidade: 200,
        tempo_parada_min: 0, motivo_parada_codigo: null,
      },
    ]);
    expect(registros).toEqual([{
      maquina: "Enchedora 2", horaCodigo: "H04", quantidade: 15200,
      perdaMin: 12, motivoCodigo: "parada_empacotadora",
      operadorNome: "João Silva", produtoSabor: "Cola", produtoTamanho: "2L",
      cadencia: 16000, naoRodou: false,
    }]);
    expect(JSON.stringify(registros)).toContain("João Silva");
    expect(JSON.stringify(registros)).not.toContain("Texto privado");
  });

  it("nao transforma hora sem quantidade em zero e usa a confirmacao mais recente", () => {
    expect(registrosPublicos([
      { maquina: "Enchedora 3", hora_codigo: "H24", quantidade: null,
        tempo_parada_min: null, motivo_parada_codigo: null },
      { maquina: "Enchedora 3", hora_codigo: "H24", quantidade: 100,
        tempo_parada_min: 50, motivo_parada_codigo: null },
      { maquina: "Enchedora 3", hora_codigo: "H24", quantidade: 80,
        tempo_parada_min: 55, motivo_parada_codigo: null },
    ])).toEqual([{ maquina: "Enchedora 3", horaCodigo: "H24", quantidade: 100,
      perdaMin: 50, motivoCodigo: null, operadorNome: null, produtoSabor: null,
      produtoTamanho: null, cadencia: null, naoRodou: false }]);
  });
});
