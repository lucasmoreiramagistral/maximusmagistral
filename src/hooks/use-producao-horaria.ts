import { useCallback, useEffect, useState } from "react";
import { useConnectionStatus, useOfflineQueue } from "./use-connection-status";
import { producaoStorage } from "@/lib/producao/storage";
import {
  ConflitoVersaoError,
  createProducaoHorasPadrao,
  fetchProducaoHoras,
  insertProducaoHoraEdicao,
  upsertProducaoHora,
} from "@/lib/producao/supabase-storage";
import type {
  ProducaoHora,
  ProducaoHoraEdicaoPayload,
} from "@/lib/producao/types";
import type { Turno } from "@/lib/checklist/types";

interface UseProducaoHorariaResult {
  horas: ProducaoHora[];
  loading: boolean;
  error: string | null;
  conflito: boolean;
  refetch: () => Promise<void>;
  salvarHora: (
    hora: ProducaoHora,
    opts?: {
      anterior?: ProducaoHora;
      motivoEdicao?: string;
      editadoPorLogin: string;
      editadoPorNome: string;
    },
  ) => Promise<void>;
}

/**
 * Carrega/sincroniza as 24 linhas horárias do Hora x Hora.
 * Mesmo contrato do usePtpJanelas: offline-first, fila para erro de rede,
 * erro de aplicação propagado para o toast vermelho da tela.
 */
export function useProducaoHoraria(
  folhaDiaKey: string,
  dataOperacao: string,
  turno: Turno | null,
  operadorUserId?: string | null,
): UseProducaoHorariaResult {
  const { isOnline } = useConnectionStatus();
  const { enfileirar } = useOfflineQueue();
  const [horas, setHoras] = useState<ProducaoHora[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflito, setConflito] = useState(false);

  const mergeWithDefaults = useCallback(
    (remotos: ProducaoHora[]): ProducaoHora[] => {
      const defaults = createProducaoHorasPadrao(
        folhaDiaKey,
        dataOperacao,
        (turno ?? "12x36 Dia") as Turno,
        operadorUserId,
      );
      return defaults.map((d) => {
        const found = remotos.find((r) => r.horaCodigo === d.horaCodigo);
        return found ?? d;
      });
    },
    [folhaDiaKey, dataOperacao, turno, operadorUserId],
  );

  const refetch = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const local = producaoStorage.getHoras(folhaDiaKey);
      setHoras(mergeWithDefaults(local));
      if (isOnline) {
        const remotos = await fetchProducaoHoras(folhaDiaKey, operadorUserId);
        setHoras(mergeWithDefaults(remotos));
        producaoStorage.bulkSetHoras(folhaDiaKey, remotos);
      }
    } catch (e) {
      console.error(e);
      setError("Erro ao carregar Hora x Hora. Mostrando dados locais.");
    } finally {
      setLoading(false);
    }
  }, [folhaDiaKey, isOnline, mergeWithDefaults, operadorUserId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const salvarHora: UseProducaoHorariaResult["salvarHora"] = useCallback(
    async (hora, opts) => {
      producaoStorage.saveHora(hora);
      setHoras((prev) => {
        const i = prev.findIndex((p) => p.horaCodigo === hora.horaCodigo);
        if (i < 0) return [...prev, hora];
        const next = [...prev];
        next[i] = hora;
        return next;
      });

      const edicao: ProducaoHoraEdicaoPayload | null = opts?.anterior
        ? {
            producaoHorariaId: hora.id,
            folhaDiaKey: hora.folhaDiaKey,
            horaCodigo: hora.horaCodigo,
            editadoPorLogin: opts.editadoPorLogin,
            editadoPorNome: opts.editadoPorNome,
            motivoEdicao: opts.motivoEdicao ?? null,
            antesJson: opts.anterior,
            depoisJson: hora,
          }
        : null;

      const expectedUpdatedAt = hora.updatedAt ?? opts?.anterior?.updatedAt;

      if (!isOnline) {
        enfileirar("producao_hora", {
          hora,
          expectedUpdatedAt: expectedUpdatedAt ?? null,
          edicao,
        });
        return;
      }

      try {
        const saved = await upsertProducaoHora(hora, { expectedUpdatedAt });
        producaoStorage.saveHora(saved);
        setHoras((prev) => {
          const i = prev.findIndex((p) => p.horaCodigo === saved.horaCodigo);
          if (i < 0) return [...prev, saved];
          const next = [...prev];
          next[i] = saved;
          return next;
        });
        if (edicao) {
          try {
            await insertProducaoHoraEdicao(edicao);
          } catch (e) {
            console.error("[useProducaoHoraria] insertProducaoHoraEdicao falhou:", e);
          }
        }
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
          enfileirar("producao_hora", {
            hora,
            expectedUpdatedAt: expectedUpdatedAt ?? null,
            edicao,
          });
          return;
        }
        console.error("[useProducaoHoraria] erro de aplicação:", e);
        throw e;
      }
    },
    [enfileirar, isOnline],
  );

  return { horas, loading, error, conflito, refetch, salvarHora };
}
