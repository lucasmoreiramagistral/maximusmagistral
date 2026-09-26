import { beforeEach, describe, expect, it, vi } from "vitest";
import { assinarHoraComLogin } from "./assinatura-hora";
import { producaoHoraFromRow, type ProducaoHoraRow } from "./mappers";

const validacao = vi.hoisted(() => ({
  criarCliente: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client-validacao", () => ({
  criarClienteValidacao: validacao.criarCliente,
}));

const assinaturaDataUrl = `data:image/png;base64,${"A".repeat(120)}`;
const versao = "2026-09-23T11:01:00.123456+00:00";
const linha: ProducaoHoraRow = {
  id: "4c135b0e-2565-4de8-9850-71ed176a482b",
  folha_dia_key: "2026-09-23-Linha 2-Empacotadora 2",
  data_operacao: "2026-09-23",
  linha: "Linha 2",
  area: "Produção",
  maquina: "Empacotadora 2",
  equipamento: "Empacotadora 2",
  turno: "12x36 Dia",
  hora_codigo: "H06",
  hora_inicio: "11:00",
  hora_fim: "12:00",
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
  operador_user_id: "f67182c0-1c9f-4658-8b7b-aa9ab6a7e9f1",
  lider_nome: null,
  assinatura_lider: null,
  lider_assinou_em: null,
  ultima_edicao_por_login: null,
  ultima_edicao_por_nome: null,
  created_at: "2026-09-23T11:01:00Z",
  updated_at: versao,
  finalizado_em: "2026-09-23T11:01:00Z",
};
const liderUid = "1d29e65d-31b0-4210-b980-5a5fa21f750e";

describe("assinatura autenticada da hora", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validacao.criarCliente.mockReturnValue({
      auth: {
        signInWithPassword: validacao.signInWithPassword,
        signOut: validacao.signOut,
      },
      rpc: validacao.rpc,
    });
    validacao.signInWithPassword.mockResolvedValue({
      data: { user: { id: liderUid } }, error: null,
    });
    validacao.signOut.mockResolvedValue({ error: null });
  });

  it("grava na sessão isolada e aceita apenas a identidade devolvida pelo banco", async () => {
    const assinatura = {
      dataUrl: assinaturaDataUrl,
      nome: "Líder cadastrado",
      assinadoEm: "2026-09-23T12:02:00Z",
      userId: liderUid,
    };
    validacao.rpc.mockResolvedValue({
      data: {
        ator: { userId: liderUid, login: "lider.real", nome: "Líder cadastrado", perfil: "lider" },
        hora: { ...linha, lider_nome: assinatura.nome, assinatura_lider: assinatura,
          lider_assinou_em: assinatura.assinadoEm },
      },
      error: null,
    });

    const resultado = await assinarHoraComLogin(
      producaoHoraFromRow(linha), assinaturaDataUrl, "LIDER.DIGITADO", "senha",
    );

    expect(validacao.signInWithPassword).toHaveBeenCalledWith({
      email: "lider.digitado@magistral.internal", password: "senha",
    });
    expect(validacao.rpc).toHaveBeenCalledWith("rpc_assinar_hora_lider", {
      p_hora_id: linha.id,
      p_updated_at: versao,
      p_assinatura_data_url: assinaturaDataUrl,
    });
    expect(resultado.lider).toMatchObject({ userId: liderUid, login: "lider.real" });
    expect(resultado.hora.assinaturaLider).toEqual(assinatura);
    expect(validacao.signOut).toHaveBeenCalledOnce();
  });

  it("recusa resposta sem vínculo entre o JWT e o autor carimbado", async () => {
    validacao.rpc.mockResolvedValue({
      data: {
        ator: { userId: liderUid, login: "lider.real", nome: "Líder", perfil: "lider" },
        hora: { ...linha, assinatura_lider: { dataUrl: assinaturaDataUrl,
          userId: "outra-pessoa" }, lider_assinou_em: "2026-09-23T12:02:00Z" },
      },
      error: null,
    });

    await expect(assinarHoraComLogin(
      producaoHoraFromRow(linha), assinaturaDataUrl, "lider.real", "senha",
    )).rejects.toThrow("não devolveu a assinatura confirmada");
    expect(validacao.signOut).toHaveBeenCalledOnce();
  });

  it("não chama a RPC se a autenticação falhar, e encerra a sessão isolada", async () => {
    validacao.signInWithPassword.mockResolvedValue({
      data: { user: null }, error: { code: "invalid_credentials" },
    });

    await expect(assinarHoraComLogin(
      producaoHoraFromRow(linha), assinaturaDataUrl, "lider.real", "errada",
    )).rejects.toThrow("Usuário ou senha inválidos");
    expect(validacao.rpc).not.toHaveBeenCalled();
    expect(validacao.signOut).toHaveBeenCalledOnce();
  });

  it("rejeita hora sem versão e assinatura vazia antes de iniciar login", async () => {
    await expect(assinarHoraComLogin(
      producaoHoraFromRow({ ...linha, updated_at: undefined }),
      assinaturaDataUrl, "lider.real", "senha",
    )).rejects.toThrow("Recarregue a hora");
    await expect(assinarHoraComLogin(
      producaoHoraFromRow(linha), "data:image/png;base64,AQ==",
      "lider.real", "senha",
    )).rejects.toThrow("Desenhe a assinatura");
    expect(validacao.criarCliente).not.toHaveBeenCalled();
  });
});
