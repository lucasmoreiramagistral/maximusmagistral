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
import {
  upsertObservacaoVerso,
  labelLimpezaTurno,
} from "@/lib/verso/observacoes";
import { VERSO_CONTEXTO_FIXO } from "@/lib/verso/constants";
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

      // Conflito de versão: usa o updatedAt do snapshot que estamos salvando
      // (refletindo a última leitura/gravação). Primeira gravação → undefined.
      const expectedUpdatedAt = turno.updatedAt ?? opts?.anterior?.updatedAt;

      if (!isOnline) {
        enfileirar("limpeza_turno", {
          turno,
          expectedUpdatedAt: expectedUpdatedAt ?? null,
          edicao,
        });
        return;
      }
      try {
        const saved = await upsertLimpezaTurno(turno, {
          expectedUpdatedAt: expectedUpdatedAt,
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
        // Propaga observação livre do turno para "Observações" da frente
        // somente após o operador concluir (status >= aguardando_validacao).
        const ehConclusao =
          saved.status === "aguardando_validacao" || saved.status === "validado";
        if (ehConclusao && opts) {
          try {
            await upsertObservacaoVerso({
              folhaDiaKey: saved.folhaDiaKey,
              dataOperacao: saved.dataOperacao,
              linha: saved.linha || VERSO_CONTEXTO_FIXO.linha,
              maquina: saved.maquina || VERSO_CONTEXTO_FIXO.maquina,
              origemTipo: "limpeza",
              origemCodigo: saved.turno,
              origemLabel: labelLimpezaTurno(saved.turno),
              texto: saved.observacao ?? "",
              registradoPorLogin: opts.editadoPorLogin,
              registradoPorNome: opts.editadoPorNome,
            });
          } catch (e) {
            console.error("[useLimpezaTurnos] upsertObservacaoVerso falhou:", e);
          }
        }
      } catch (e) {
        if (e instanceof ConflitoVersaoError) {
          setConflito(true);
          throw e;
        }
        enfileirar("limpeza_turno", {
          turno,
          expectedUpdatedAt: expectedUpdatedAt ?? null,
          edicao,
        });
      }
    },
    [enfileirar, isOnline],
  );

  return { turnos, loading, error, conflito, refetch, salvarTurno };
}
