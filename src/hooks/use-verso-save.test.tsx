import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLimpezaTurnoPadrao } from "@/lib/verso/supabase-storage";
import { versoStorage } from "@/lib/verso/storage";
import { usePtpJanelas } from "./use-ptp-janelas";
import { useLimpezaTurnos } from "./use-limpeza-turnos";

vi.mock("./use-connection-status", () => ({
  useConnectionStatus: () => ({ isOnline: true }),
  useOfflineQueue: () => ({ enfileirar: vi.fn() }),
}));

vi.mock("@/lib/verso/supabase-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/verso/supabase-storage")>();
  return {
    ...actual,
    fetchPtpJanelas: vi.fn(async () => []),
    fetchLimpezaTurnos: vi.fn(async () => []),
    upsertPtpJanela: vi.fn(async () => {
      throw new Error("RLS negou PTP");
    }),
    upsertLimpezaTurno: vi.fn(async () => {
      throw new Error("RLS negou limpeza");
    }),
  };
});

describe("rejeição do banco em formulários do verso", () => {
  beforeEach(() => window.localStorage.clear());

  it("não marca PTP como concluído no tablet quando Supabase rejeita", async () => {
    const { result } = renderHook(() => usePtpJanelas("ptp-rejeitado", "2026-09-28"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const antes = result.current.janelas[0];
    const preenchido = { ...antes, statusJanela: "sem_ocorrencia" as const };
    let erro: unknown;
    await act(async () => {
      try {
        await result.current.salvarJanela(preenchido);
      } catch (e) {
        erro = e;
      }
    });
    expect(erro).toBeInstanceOf(Error);
    expect(result.current.janelas[0]).toEqual(antes);
    expect(versoStorage.getPtpJanelas("ptp-rejeitado")).toEqual([]);
  });

  it("não marca limpeza como concluída no tablet quando Supabase rejeita", async () => {
    const { result } = renderHook(() => useLimpezaTurnos("limpeza-rejeitada", "2026-09-28"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const preenchido = createLimpezaTurnoPadrao("limpeza-rejeitada", "2026-09-28", "12x36 Dia");
    let erro: unknown;
    await act(async () => {
      try {
        await result.current.salvarTurno(preenchido);
      } catch (e) {
        erro = e;
      }
    });
    expect(erro).toBeInstanceOf(Error);
    expect(result.current.turnos).toEqual([]);
    expect(versoStorage.getLimpezaTurnos("limpeza-rejeitada")).toEqual([]);
  });
});
