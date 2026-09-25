import { beforeEach, describe, expect, it, vi } from "vitest";
import { horaPersistidaIgual, upsertProducaoHora, ConflitoVersaoError } from "./supabase-storage";
import { producaoHoraFromRow } from "./mappers";
import type { ProducaoHoraRow } from "./mappers";

const db = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: db.getUser }, from: db.from },
}));

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

describe("escrita de Hora x Hora", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      insert: db.insert,
      update: db.update,
      eq: db.eq,
      select: db.select,
      maybeSingle: db.maybeSingle,
    };
    db.from.mockReturnValue(query);
    db.insert.mockReturnValue(query);
    db.update.mockReturnValue(query);
    db.eq.mockReturnValue(query);
    db.select.mockReturnValue(query);
    db.getUser.mockResolvedValue({ data: { user: { id: "operador-1" } } });
  });

  it("insere uma hora nova sem usar upsert", async () => {
    const hora = producaoHoraFromRow({ ...lancamento, created_at: undefined, finalizado_em: null });
    db.maybeSingle.mockResolvedValue({ data: lancamento, error: null });

    await upsertProducaoHora(hora);

    expect(db.insert).toHaveBeenCalledOnce();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("atualiza apenas a assinatura de uma hora já confirmada e confere a versão", async () => {
    const assinatura = { dataUrl: "data:image/png;base64,AQ==", nome: "Líder", assinadoEm: "2026-09-23T11:02:00Z" };
    const assinado = { ...lancamento, created_at: "2026-09-23T11:01:00Z",
      updated_at: "2026-09-23T11:01:00Z", lider_nome: "Líder",
      lider_assinou_em: assinatura.assinadoEm, assinatura_lider: assinatura };
    db.maybeSingle.mockResolvedValue({ data: assinado, error: null });

    await upsertProducaoHora(producaoHoraFromRow(assinado), {
      expectedUpdatedAt: "2026-09-23T11:01:00Z",
      somenteAssinatura: true,
    });

    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledWith({
      lider_nome: "Líder",
      assinatura_lider: assinatura,
      lider_assinou_em: assinatura.assinadoEm,
    });
    expect(db.eq).toHaveBeenCalledWith("id", "hora-1");
    expect(db.eq).toHaveBeenCalledWith("updated_at", "2026-09-23T11:01:00Z");
  });

  it("atualiza uma linha em branco existente sem executar INSERT", async () => {
    const existente = { ...lancamento, quantidade: null, finalizado_em: null,
      created_at: "2026-09-23T10:00:00Z", updated_at: "2026-09-23T10:00:00Z" };
    db.maybeSingle.mockResolvedValue({ data: lancamento, error: null });

    await upsertProducaoHora(producaoHoraFromRow(existente), {
      expectedUpdatedAt: existente.updated_at,
    });

    expect(db.update).toHaveBeenCalledOnce();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("relê uma inserção confirmada quando a resposta da rede se perde", async () => {
    const hora = producaoHoraFromRow({ ...lancamento, created_at: undefined, finalizado_em: null });
    db.maybeSingle
      .mockRejectedValueOnce(new Error("resposta perdida"))
      .mockResolvedValueOnce({ data: lancamento, error: null });

    const salva = await upsertProducaoHora(hora);

    expect(salva.quantidade).toBe(8000);
    expect(db.insert).toHaveBeenCalledOnce();
    expect(db.from).toHaveBeenCalledTimes(2);
  });

  it("identifica mudança concorrente sem sobrescrever a hora", async () => {
    const existente = { ...lancamento, created_at: "2026-09-23T11:01:00Z",
      updated_at: "2026-09-23T11:01:00Z" };
    db.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { ...existente, quantidade: 7000,
        updated_at: "2026-09-23T11:02:00Z" }, error: null });

    await expect(upsertProducaoHora(producaoHoraFromRow(existente), {
      expectedUpdatedAt: existente.updated_at,
    })).rejects.toBeInstanceOf(ConflitoVersaoError);
  });
});
