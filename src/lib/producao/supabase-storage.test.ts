import { describe, expect, it } from "vitest";
import { horaPersistidaIgual } from "./supabase-storage";
import type { ProducaoHoraRow } from "./mappers";

const lancamento = {
  id: "hora-1",
  folha_dia_key: "2026-09-23-Linha 2-Enchedora 2",
  data_operacao: "2026-09-23",
  linha: "Linha 2",
  area: "Produção",
  maquina: "Enchedora 2",
  equipamento: "Enchedora 2",
  turno: "12x36 Dia",
  hora_codigo: "H01",
  hora_inicio: "06:00",
  hora_fim: "07:00",
  meta: 10000,
  quantidade: 8000,
  paletes_completos: null,
  quebra_pacotes: null,
  pacotes_por_palete: null,
  nao_rodou: false,
  tempo_parada_min: 12,
  tempo_parada_metodo: "cadencia_equivalente",
  motivo_parada_codigo: "parada_rotuladora",
  reinicia_acumulado: false,
  motivo_reinicio: null,
  eventos: [],
  produto_sabor: null,
  produto_tamanho: null,
  observacao: null,
  operador_user_id: "operador-1",
  operador_login: "operador-1",
  operador_nome: "Operador 1",
  lider_nome: null,
  lider_assinou_em: null,
  assinatura_lider: null,
  ultima_edicao_por_login: null,
  ultima_edicao_por_nome: null,
  finalizado_em: "2026-09-23T11:01:00Z",
} satisfies ProducaoHoraRow;

describe("confirmação após resposta perdida", () => {
  it("aceita somente o mesmo lançamento confirmado no banco", () => {
    expect(horaPersistidaIgual(lancamento, { ...lancamento, finalizado_em: undefined })).toBe(true);
    expect(horaPersistidaIgual({ ...lancamento, quantidade: 7999 }, lancamento)).toBe(false);
    expect(horaPersistidaIgual({ ...lancamento, motivo_parada_codigo: "falta_tampas" }, lancamento)).toBe(false);
    expect(horaPersistidaIgual({ ...lancamento, finalizado_em: null, quantidade: null }, lancamento)).toBe(false);
  });

  it("não considera uma assinatura ausente como salva", () => {
    const assinatura = { dataUrl: "data:image/png;base64,AQ==", nome: "Líder", assinadoEm: "2026-09-23T11:02:00Z" };
    expect(horaPersistidaIgual(lancamento, { ...lancamento, assinatura_lider: assinatura })).toBe(false);
    expect(horaPersistidaIgual({ ...lancamento, assinatura_lider: assinatura }, { ...lancamento, assinatura_lider: assinatura })).toBe(true);
  });
});
