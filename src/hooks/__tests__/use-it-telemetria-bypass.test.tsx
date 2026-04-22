// Testes do hook useItTelemetria focados no bypass MAGISTRAL.
// Invariante: identidade canônica MAGISTRAL NÃO emite nenhum insert
// no Supabase (nem sessão, nem eventos, nem heartbeat).

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mocks ANTES dos imports do SUT
vi.mock("@/hooks/use-storage", () => ({
  useUsuario: () => ({
    userId: "user-123",
    nome: "Lucas Moreira",
    perfil: "operador",
    equipePadrao: "A",
    turnoPadrao: "12x36 Dia",
  }),
}));

vi.mock("@/hooks/use-connection-status", () => ({
  useOfflineQueue: () => ({ enfileirar: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } } }),
    },
  },
}));

const insertSessaoMock = vi.fn().mockResolvedValue(undefined);
const insertEventoMock = vi.fn().mockResolvedValue(undefined);
const updateFechamentoMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/it/supabase-analytics", () => ({
  insertItSessao: (...a: unknown[]) => insertSessaoMock(...a),
  insertItEvento: (...a: unknown[]) => insertEventoMock(...a),
  updateItSessaoFechamento: (...a: unknown[]) => updateFechamentoMock(...a),
}));

import { useItTelemetria } from "@/hooks/use-it-telemetria";

describe("useItTelemetria — bypass MAGISTRAL", () => {
  beforeEach(() => {
    insertSessaoMock.mockClear();
    insertEventoMock.mockClear();
    updateFechamentoMock.mockClear();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("MAGISTRAL: NÃO cria sessão nem dispara eventos no banco", async () => {
    const { result } = renderHook(() =>
      useItTelemetria({
        slug: "operacao",
        identidade: {
          nomeCompleto: "Magistral",
          nomeCanonico: "MAGISTRAL",
          deviceId: "dev-test",
        },
      }),
    );

    // Da pra navegar página, o hook não deve chamar nenhum insert
    await act(async () => {
      result.current.trackPageView(1);
      result.current.trackEvento("page_view", { pagina: 1 });
      result.current.trackPageView(2);
      // Pequena pausa pra qualquer microtask vazar
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(insertSessaoMock).not.toHaveBeenCalled();
    expect(insertEventoMock).not.toHaveBeenCalled();
    expect(updateFechamentoMock).not.toHaveBeenCalled();
  });

  it("operador normal: cria sessão e emite eventos normalmente", async () => {
    const { result } = renderHook(() =>
      useItTelemetria({
        slug: "operacao",
        identidade: {
          nomeCompleto: "Lucas Moreira",
          nomeCanonico: "LUCAS MOREIRA",
          deviceId: "dev-test",
        },
      }),
    );

    await act(async () => {
      // Aguarda o effect criar a sessão (assíncrono)
      await new Promise((r) => setTimeout(r, 50));
      result.current.trackPageView(1);
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(insertSessaoMock).toHaveBeenCalled();
    // Pelo menos it_open + identidade_confirmada + page_view foram emitidos
    expect(insertEventoMock.mock.calls.length).toBeGreaterThan(0);
  });

  it("MAGISTRAL: não escreve sessão no sessionStorage (sem rastro local)", async () => {
    renderHook(() =>
      useItTelemetria({
        slug: "operacao",
        identidade: {
          nomeCompleto: "Magistral",
          nomeCanonico: "MAGISTRAL",
          deviceId: "dev-test",
        },
      }),
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(window.sessionStorage.getItem("it-telemetria:sessao:operacao")).toBeNull();
  });
});
