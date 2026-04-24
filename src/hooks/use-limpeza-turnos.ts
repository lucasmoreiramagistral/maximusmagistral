import { useCallback, useEffect, useState } from "react";
import { useConnectionStatus, useOfflineQueue } from "./use-connection-status";
import { versoStorage } from "@/lib/verso/storage";
import {
  ConflitoVersaoError,
  fetchLimpezaTurnos,
  insertLimpezaEdicao,
  upsertLimpezaTurno,
} from "@/lib/verso/supabase-storage";
import {
  upsertObservacaoVerso,
  labelLimpezaTurno,
  labelLimpezaItem,
  origemCodigoLimpezaItem,
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

  // Modelo LAZY: NÃO pré-criar registros para todos os turnos.
  // O hook devolve apenas o que existe (local + remoto). O consumidor
  // (UI/relatório) cria registro sob demanda via createLimpezaTurnoPadrao
  // quando o operador da escala ativa abre/preenche limpeza.

  const refetch = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const local = versoStorage.getLimpezaTurnos(folhaDiaKey);
      setTurnos(local);

      if (isOnline) {
        const remotos = await fetchLimpezaTurnos(folhaDiaKey);
        setTurnos(remotos);
        versoStorage.bulkSetLimpezaTurnos(folhaDiaKey, remotos);
      }
    } catch (e) {
      console.error(e);
      setError("Erro ao carregar limpeza. Mostrando dados locais.");
    } finally {
      setLoading(false);
    }
  }, [folhaDiaKey, isOnline]);

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
        // Propaga observações por ITEM (apenas itens "nao_realizado" com texto)
        // para "Observações" da frente. Itens fora de NR ou sem texto têm sua
        // linha apagada (upsert com texto vazio = DELETE).
        // Também limpa a antiga obs "do turno inteiro" (origem_codigo = turno).
        const ehConclusao =
          saved.status === "aguardando_validacao" || saved.status === "validado";
        if (ehConclusao && opts) {
          const ctx = {
            folhaDiaKey: saved.folhaDiaKey,
            dataOperacao: saved.dataOperacao,
            linha: saved.linha || VERSO_CONTEXTO_FIXO.linha,
            maquina: saved.maquina || VERSO_CONTEXTO_FIXO.maquina,
            registradoPorLogin: opts.editadoPorLogin,
            registradoPorNome: opts.editadoPorNome,
          };
          try {
            // 1) Limpa a obs legada/agregada do turno (se existir).
            await upsertObservacaoVerso({
              ...ctx,
              origemTipo: "limpeza",
              origemCodigo: saved.turno,
              origemLabel: labelLimpezaTurno(saved.turno),
              texto: "",
            });
            // 2) Para cada item, sincroniza a obs por item.
            for (const it of saved.itens) {
              const texto =
                it.status === "nao_realizado" ? (it.observacao ?? "") : "";
              await upsertObservacaoVerso({
                ...ctx,
                origemTipo: "limpeza",
                origemCodigo: origemCodigoLimpezaItem(saved.turno, it.codigo),
                origemLabel: labelLimpezaItem(saved.turno, it.codigo),
                texto,
              });
            }
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
