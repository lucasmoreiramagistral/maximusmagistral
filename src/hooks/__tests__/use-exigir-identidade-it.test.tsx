// Testes de integração do hook useExigirIdentidadeIt focados no bypass MAGISTRAL.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { useEffect } from "react";

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

// Mock do dialog: expõe trigger global pra confirmar identidade.
vi.mock("@/components/it-identificacao-dialog", () => ({
  ItIdentificacaoDialog: ({ open, onConfirmar }: any) => {
    if (open) {
      (globalThis as any).__triggerConfirmar = (
        nomeCompleto: string,
        nomeCanonico: string,
      ) =>
        onConfirmar({
          nomeCompleto,
          nomeCanonico,
          trocaDetectada: false,
          modoUsado: "completo",
          identidadeAnterior: null,
        });
    }
    return null;
  },
}));

import { useExigirIdentidadeIt } from "@/hooks/use-exigir-identidade-it";

interface Snapshot {
  pronto: boolean;
  semTreinamento: boolean;
  verificandoAta: boolean;
  identidadeCanonico: string | null;
}

function renderHookComModal(documento: "it002" | "it005") {
  const snap: { current: Snapshot } = {
    current: {
      pronto: false,
      semTreinamento: false,
      verificandoAta: false,
      identidadeCanonico: null,
    },
  };
  function Probe() {
    const r = useExigirIdentidadeIt(documento);
    useEffect(() => {
      snap.current = {
        pronto: r.pronto,
        semTreinamento: r.semTreinamento,
        verificandoAta: r.verificandoAta,
        identidadeCanonico: r.identidade?.nomeCanonico ?? null,
      };
    });
    return <>{r.modal}</>;
  }
  const utils = render(<Probe />);
  return { snap, ...utils };
}

describe("useExigirIdentidadeIt — bypass MAGISTRAL", () => {
  beforeEach(() => {
    temAtaCadastradaMock.mockReset();
    (globalThis as any).__triggerConfirmar = undefined;
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("MAGISTRAL: NÃO chama temAtaCadastrada e fica pronto sem ata", async () => {
    temAtaCadastradaMock.mockResolvedValue(false);
    const { snap } = renderHookComModal("it002");

    await waitFor(() =>
      expect((globalThis as any).__triggerConfirmar).toBeDefined(),
    );

    await act(async () => {
      (globalThis as any).__triggerConfirmar("Magistral", "MAGISTRAL");
    });

    await waitFor(() => expect(snap.current.pronto).toBe(true));

    expect(snap.current.identidadeCanonico).toBe("MAGISTRAL");
    expect(snap.current.semTreinamento).toBe(false);
    expect(snap.current.verificandoAta).toBe(false);
    expect(temAtaCadastradaMock).not.toHaveBeenCalled();
  });

  it("operador normal SEM ata: bloqueia (semTreinamento=true)", async () => {
    temAtaCadastradaMock.mockResolvedValue(false);
    const { snap } = renderHookComModal("it002");

    await waitFor(() =>
      expect((globalThis as any).__triggerConfirmar).toBeDefined(),
    );
    await act(async () => {
      (globalThis as any).__triggerConfirmar("Lucas Moreira", "LUCAS MOREIRA");
    });

    await waitFor(() => expect(snap.current.semTreinamento).toBe(true));

    expect(snap.current.pronto).toBe(false);
    expect(temAtaCadastradaMock).toHaveBeenCalledOnce();
    expect(temAtaCadastradaMock).toHaveBeenCalledWith({
      operadorNomeCanonico: "LUCAS MOREIRA",
      documento: "it002",
    });
  });

  it("operador normal COM ata: libera (pronto=true, semTreinamento=false)", async () => {
    temAtaCadastradaMock.mockResolvedValue(true);
    const { snap } = renderHookComModal("it005");

    await waitFor(() =>
      expect((globalThis as any).__triggerConfirmar).toBeDefined(),
    );
    await act(async () => {
      (globalThis as any).__triggerConfirmar("Lucas Moreira", "LUCAS MOREIRA");
    });

    await waitFor(() => expect(snap.current.pronto).toBe(true));

    expect(snap.current.semTreinamento).toBe(false);
    expect(temAtaCadastradaMock).toHaveBeenCalledOnce();
  });

  it("erro de rede ao verificar ata (operador normal): fail-closed BLOQUEIA", async () => {
    temAtaCadastradaMock.mockRejectedValue(new Error("network down"));
    const { snap } = renderHookComModal("it002");

    await waitFor(() =>
      expect((globalThis as any).__triggerConfirmar).toBeDefined(),
    );
    await act(async () => {
      (globalThis as any).__triggerConfirmar("Lucas Moreira", "LUCAS MOREIRA");
    });

    await waitFor(() => expect(snap.current.semTreinamento).toBe(true));
    expect(snap.current.pronto).toBe(false);
  });

  it("MAGISTRAL com erro de banco: continua liberado (não consulta o banco)", async () => {
    temAtaCadastradaMock.mockRejectedValue(new Error("would-fail"));
    const { snap } = renderHookComModal("it002");

    await waitFor(() =>
      expect((globalThis as any).__triggerConfirmar).toBeDefined(),
    );
    await act(async () => {
      (globalThis as any).__triggerConfirmar("MAGISTRAL", "MAGISTRAL");
    });

    await waitFor(() => expect(snap.current.pronto).toBe(true));

    expect(snap.current.semTreinamento).toBe(false);
    expect(temAtaCadastradaMock).not.toHaveBeenCalled();
  });
});
