import { beforeEach, describe, expect, it, vi } from "vitest";
import { assinarHoraOperador } from "./assinatura-operador";
import { producaoHoraFromRow, type ProducaoHoraRow } from "./mappers";

const banco = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: banco.getUser }, rpc: banco.rpc },
}));

const uid = "d8d866e0-67ca-45bd-987d-0a344dcaa467";
const desenho = `data:image/png;base64,${"A".repeat(120)}`;
const row: ProducaoHoraRow = {
  id: "13c4273d-7253-4876-aadc-b9f74b8f985f",
  folha_dia_key: "2026-09-27__Linha 2__Empacotadora 2",
  data_operacao: "2026-09-27",
  linha: "Linha 2",
  area: "Envase",
  maquina: "Empacotadora 2",
  equipamento: "Empacotadora 2",
  turno: "12x36 Noite",
  hora_codigo: "H24",
  hora_inicio: "05:00",
  hora_fim: "06:00",
  meta: 1000,
  quantidade: 800,
  nao_rodou: false,
  tempo_parada_min: 12,
  reinicia_acumulado: false,
  motivo_reinicio: null,
  produto_sabor: "Uva",
  produto_tamanho: "2L",
  observacao: null,
  operador_login: "operador2",
  operador_nome: "Operador 2",
  operador_user_id: uid,
  assinatura_operador: null,
  operador_assinou_em: null,
  lider_nome: null,
  assinatura_lider: null,
  lider_assinou_em: null,
  ultima_edicao_por_login: null,
  ultima_edicao_por_nome: null,
  created_at: "2026-09-28T10:03:00Z",
  updated_at: "2026-09-28T10:03:00Z",
  finalizado_em: "2026-09-28T10:03:00Z",
};

describe("assinatura do operador no fechamento do turno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    banco.getUser.mockResolvedValue({ data: { user: { id: uid } }, error: null });
  });

  it("assina H24 depois do corte horário sem reabrir produção", async () => {
    const carimbo = "2026-09-28T10:21:00Z"; // 06:21 em Manaus
    banco.rpc.mockResolvedValue({
      data: {
        hora: {
          ...row,
          assinatura_operador: {
            dataUrl: desenho,
            nome: "Operador 2",
            assinadoEm: carimbo,
            userId: uid,
          },
          operador_assinou_em: carimbo,
          updated_at: carimbo,
        },
      },
      error: null,
    });

    const assinada = await assinarHoraOperador(producaoHoraFromRow(row), desenho);
    expect(banco.rpc).toHaveBeenCalledWith("rpc_assinar_hora_operador", {
      p_hora_id: row.id,
      p_updated_at: row.updated_at,
      p_assinatura_data_url: desenho,
    });
    expect(assinada.assinaturaOperador?.userId).toBe(uid);
    expect(assinada.quantidade).toBe(800);
  });

  it("não envia desenho de outra conta nem de hora não confirmada", async () => {
    banco.getUser.mockResolvedValue({ data: { user: { id: "outra-conta" } }, error: null });
    await expect(assinarHoraOperador(producaoHoraFromRow(row), desenho)).rejects.toThrow(
      "Somente o operador",
    );
    await expect(
      assinarHoraOperador(producaoHoraFromRow({ ...row, finalizado_em: null }), desenho),
    ).rejects.toThrow("Confirme a última hora");
    expect(banco.rpc).not.toHaveBeenCalled();
  });

  it("recusa resposta que não comprova a identidade carimbada pelo banco", async () => {
    banco.rpc.mockResolvedValue({
      data: {
        hora: {
          ...row,
          assinatura_operador: {
            dataUrl: desenho,
            nome: "Falso",
            assinadoEm: "2026-09-28T10:21:00Z",
            userId: "outro",
          },
          operador_assinou_em: "2026-09-28T10:21:00Z",
        },
      },
      error: null,
    });
    await expect(assinarHoraOperador(producaoHoraFromRow(row), desenho)).rejects.toThrow(
      "não devolveu a assinatura confirmada",
    );
  });
});
