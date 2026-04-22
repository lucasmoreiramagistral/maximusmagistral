// Testes de integração do hook useExigirIdentidadeIt focados no bypass MAGISTRAL.
// Garante que, com identidade canônica = MAGISTRAL:
//  - temAtaCadastrada NÃO é chamada
//  - pronto = true sem precisar de ata
//  - semTreinamento = false

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mocks ANTES do import do hook
vi.mock("@/hooks/use-storage", () => ({
  useUsuario: () => ({
    userId: "user-123",
    nome: "Lucas Moreira",
    perfil: "operador",
    equipePadrao: "A",
    turnoPadrao: "12x36 Dia",
  }),
  useAuthLoading: () => false,
}));

const temAtaCadastradaMock = vi.fn();
vi.mock("@/lib/it/atas", () => ({
  temAtaCadastrada: (...args: unknown[]) => temAtaCadastradaMock(...args),
}));

// Mock do dialog: expõe um botão que dispara onConfirmar com o nome desejado.
vi.mock("@/components/it-identificacao-dialog", () => ({
  ItIdentificacaoDialog: ({ onConfirmar }: any) => {
    (globalThis as any).__triggerConfirmar = (nomeCompleto: string, nomeCanonico: string) =>
      onConfirmar({
        nomeCompleto,
        nomeCanonico,
        trocaDetectada: false,
        modoUsado: "completo",
        identidadeAnterior: null,
      });
    return null;
  },
}));

import { useExigirIdentidadeIt } from "@/hooks/use-exigir-identidade-it";

describe("useExigirIdentidadeIt — bypass MAGISTRAL", () => {
  beforeEach(() => {
    temAtaCadastradaMock.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("MAGISTRAL: NÃO chama temAtaCadastrada e fica pronto sem ata", async () => {
    temAtaCadastradaMock.mockResolvedValue(false);

    const { result } = renderHook(() => useExigirIdentidadeIt("it002"));

    // Estado inicial: aguardando identidade
    expect(result.current.pronto).toBe(false);
    expect(result.current.identidade).toBeNull();

    // Simula confirmação do nome MAGISTRAL no dialog
    await act(async () => {
      (globalThis as any).__triggerConfirmar("Magistral", "MAGISTRAL");
    });

    await waitFor(() => {
      expect(result.current.pronto).toBe(true);
    });

    expect(result.current.identidade?.nomeCanonico).toBe("MAGISTRAL");
    expect(result.current.semTreinamento).toBe(false);
    expect(result.current.verificandoAta).toBe(false);
    // INVARIANTE CRÍTICO: nenhuma chamada ao banco pra verificar ata
    expect(temAtaCadastradaMock).not.toHaveBeenCalled();
  });

  it("operador normal SEM ata: bloqueia (semTreinamento=true)", async () => {
    temAtaCadastradaMock.mockResolvedValue(false);

    const { result } = renderHook(() => useExigirIdentidadeIt("it002"));

    await act(async () => {
      (globalThis as any).__triggerConfirmar("Lucas Moreira", "LUCAS MOREIRA");
    });

    await waitFor(() => {
      expect(result.current.semTreinamento).toBe(true);
    });

    expect(result.current.pronto).toBe(false);
    expect(temAtaCadastradaMock).toHaveBeenCalledOnce();
    expect(temAtaCadastradaMock).toHaveBeenCalledWith({
      operadorNomeCanonico: "LUCAS MOREIRA",
      documento: "it002",
    });
  });

  it("operador normal COM ata: libera (pronto=true, semTreinamento=false)", async () => {
    temAtaCadastradaMock.mockResolvedValue(true);

    const { result } = renderHook(() => useExigirIdentidadeIt("it005"));

    await act(async () => {
      (globalThis as any).__triggerConfirmar("Lucas Moreira", "LUCAS MOREIRA");
    });

    await waitFor(() => {
      expect(result.current.pronto).toBe(true);
    });

    expect(result.current.semTreinamento).toBe(false);
    expect(temAtaCadastradaMock).toHaveBeenCalledOnce();
  });

  it("erro de rede ao verificar ata (operador normal): fail-closed BLOQUEIA", async () => {
    temAtaCadastradaMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useExigirIdentidadeIt("it002"));

    await act(async () => {
      (globalThis as any).__triggerConfirmar("Lucas Moreira", "LUCAS MOREIRA");
    });

    await waitFor(() => {
      expect(result.current.semTreinamento).toBe(true);
    });

    expect(result.current.pronto).toBe(false);
  });

  it("MAGISTRAL com erro de banco: continua liberado (não consulta o banco)", async () => {
    temAtaCadastradaMock.mockRejectedValue(new Error("would-fail"));

    const { result } = renderHook(() => useExigirIdentidadeIt("it002"));

    await act(async () => {
      (globalThis as any).__triggerConfirmar("MAGISTRAL", "MAGISTRAL");
    });

    await waitFor(() => {
      expect(result.current.pronto).toBe(true);
    });

    expect(result.current.semTreinamento).toBe(false);
    expect(temAtaCadastradaMock).not.toHaveBeenCalled();
  });
});
