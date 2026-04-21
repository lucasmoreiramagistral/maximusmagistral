import { useCallback, useEffect, useState } from "react";
import { useConnectionStatus, useOfflineQueue } from "./use-connection-status";
import { versoStorage } from "@/lib/verso/storage";
import {
  ConflitoVersaoError,
  createLimpezaTurnosPadrao,
  fetchLimpezaTurnos,
  insertLimpezaEdicao,
  upsertLimpezaTurno,
} from "@/lib/verso/supabase-storage";
import type { LimpezaEdicaoPayload, LimpezaTurno } from "@/lib/verso/types";

interface UseLimpezaResult {
  turnos: LimpezaTurno[];
  loading: boolean;
  error: string | null;
  conflito: boolean;
  refetch: () => Promise<void>;
  salvarTurno: (
    turno: LimpezaTurno,
    opts?: {
      anterior?: LimpezaTurno;
      motivoEdicao?: string;
      editadoPorLogin: string;
      editadoPorNome: string;
    },
  ) => Promise<void>;
}

export function useLimpezaTurnos(
  folhaDiaKey: string,
  dataOperacao: string,
): UseLimpezaResult {
  const { isOnline } = useConnectionStatus();
  const { enfileirar } = useOfflineQueue();
  const [turnos, setTurnos] = useState<LimpezaTurno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflito, setConflito] = useState(false);

  const mergeWithDefaults = useCallback(
    (remotos: LimpezaTurno[]): LimpezaTurno[] => {
      const defaults = createLimpezaTurnosPadrao(folhaDiaKey, dataOperacao);
      return defaults.map((d) => {
        const found = remotos.find((r) => r.turno === d.turno);
        return found ?? d;
      });
    },
    [folhaDiaKey, dataOperacao],
  );

  const refetch = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const local = versoStorage.getLimpezaTurnos(folhaDiaKey);
      if (local.length > 0) setTurnos(mergeWithDefaults(local));
      else setTurnos(mergeWithDefaults([]));

      if (isOnline) {
        const remotos = await fetchLimpezaTurnos(folhaDiaKey);
        setTurnos(mergeWithDefaults(remotos));
        versoStorage.bulkSetLimpezaTurnos(folhaDiaKey, remotos);
      }
    } catch (e) {
      console.error(e);
      setError("Erro ao carregar limpeza. Mostrando dados locais.");
    } finally {
      setLoading(false);
    }
  }, [folhaDiaKey, isOnline, mergeWithDefaults]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const salvarTurno: UseLimpezaResult["salvarTurno"] = useCallback(
    async (turno, opts) => {
      versoStorage.saveLimpezaTurno(turno);
      setTurnos((prev) => {
        const i = prev.findIndex((p) => p.turno === turno.turno);
        if (i < 0) return [...prev, turno];
        const next = [...prev];
        next[i] = turno;
        return next;
      });

      const edicao: LimpezaEdicaoPayload | null = opts?.anterior
        ? {
            limpezaTurnoId: turno.id,
            folhaDiaKey: turno.folhaDiaKey,
            turno: turno.turno,
            editadoPorLogin: opts.editadoPorLogin,
            editadoPorNome: opts.editadoPorNome,
            motivoEdicao: opts.motivoEdicao ?? null,
            antesJson: opts.anterior,
            depoisJson: turno,
          }
        : null;

      if (!isOnline) {
        enfileirar("limpeza_turno", {
          turno,
          expectedUpdatedAt: opts?.anterior?.updatedAt ?? null,
          edicao,
        });
        return;
      }
      try {
        const saved = await upsertLimpezaTurno(turno, {
          expectedUpdatedAt: opts?.anterior?.updatedAt ?? null,
        });
        versoStorage.saveLimpezaTurno(saved);
        setTurnos((prev) => {
          const i = prev.findIndex((p) => p.turno === saved.turno);
          if (i < 0) return [...prev, saved];
          const next = [...prev];
          next[i] = saved;
          return next;
        });
        if (edicao) {
          try {
            await insertLimpezaEdicao(edicao);
          } catch (e) {
            console.error("[useLimpezaTurnos] insertLimpezaEdicao falhou:", e);
          }
        }
      } catch (e) {
        if (e instanceof ConflitoVersaoError) {
          setConflito(true);
          throw e;
        }
        enfileirar("limpeza_turno", {
          turno,
          expectedUpdatedAt: opts?.anterior?.updatedAt ?? null,
          edicao,
        });
      }
    },
    [enfileirar, isOnline],
  );

  return { turnos, loading, error, conflito, refetch, salvarTurno };
}
