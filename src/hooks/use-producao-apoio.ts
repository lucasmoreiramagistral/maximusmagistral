import { useCallback, useEffect, useState } from "react";
import { useConnectionStatus, useOfflineQueue } from "./use-connection-status";
import { producaoApoioStorage } from "@/lib/producao/apoio-storage";
import {
  ConflitoVersaoError,
  apoioId,
  createProducaoApoioPadrao,
  fetchProducaoApoio,
  upsertProducaoApoio,
} from "@/lib/producao/apoio-supabase";
import type { ProducaoApoio } from "@/lib/producao/apoio-types";
import type { Turno } from "@/lib/checklist/types";

interface UseProducaoApoioResult {
  apoio: ProducaoApoio | null;
  loading: boolean;
  error: string | null;
  conflito: boolean;
  refetch: () => Promise<void>;
  salvar: (a: ProducaoApoio) => Promise<void>;
}

/**
 * Bloco de apoio da frente (Checklist de Apoio, Assepsia e CIP).
 * Offline-first, mesmo contrato do useProducaoHoraria.
 */
export function useProducaoApoio(
  folhaDiaKey: string,
  dataOperacao: string,
  turno: Turno | null,
  operadorUserId?: string | null,
): UseProducaoApoioResult {
  const { isOnline } = useConnectionStatus();
  const { enfileirar } = useOfflineQueue();
  const [apoio, setApoio] = useState<ProducaoApoio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflito, setConflito] = useState(false);

  const refetch = useCallback(async () => {
    if (!turno) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    const padrao = createProducaoApoioPadrao(
      folhaDiaKey,
      dataOperacao,
      turno,
      operadorUserId,
    );
    try {
      const local = producaoApoioStorage.get(
        apoioId(dataOperacao, turno, operadorUserId),
      );
      setApoio(local ?? padrao);
      if (isOnline) {
        const remotos = await fetchProducaoApoio(folhaDiaKey, operadorUserId);
        const encontrado = remotos.find((r) => r.id === padrao.id) ?? null;
        if (encontrado) {
          setApoio(encontrado);
          producaoApoioStorage.save(encontrado);
        }
      }
    } catch (e) {
      console.error(e);
      setError("Erro ao carregar apoio/assepsia/CIP. Mostrando dados locais.");
    } finally {
      setLoading(false);
    }
  }, [folhaDiaKey, dataOperacao, turno, operadorUserId, isOnline]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const salvar = useCallback(
    async (a: ProducaoApoio) => {
      producaoApoioStorage.save(a);
      setApoio(a);

      const expectedUpdatedAt = a.updatedAt ?? null;

      if (!isOnline) {
        enfileirar("producao_apoio", { apoio: a, expectedUpdatedAt });
        return;
      }

      try {
        const saved = await upsertProducaoApoio(a, { expectedUpdatedAt });
        producaoApoioStorage.save(saved);
        setApoio(saved);
      } catch (e) {
        if (e instanceof ConflitoVersaoError) {
          setConflito(true);
          throw e;
        }
        const msg = e instanceof Error ? e.message : String(e);
        const isNetwork =
          /failed to fetch|networkerror|fetch failed|load failed|timeout|aborted|err_network|err_internet/i.test(
            msg,
          );
        if (isNetwork) {
          enfileirar("producao_apoio", { apoio: a, expectedUpdatedAt });
          return;
        }
        console.error("[useProducaoApoio] erro de aplicação:", e);
        throw e;
      }
    },
    [enfileirar, isOnline],
  );

  return { apoio, loading, error, conflito, refetch, salvar };
}
