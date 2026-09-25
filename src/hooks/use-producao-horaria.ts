import { useCallback, useEffect, useState } from "react";
import { useConnectionStatus } from "./use-connection-status";
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
import { mesclarHorasComPadrao } from "@/lib/producao/mesclar-horas";
import type { Turno } from "@/lib/checklist/types";
import { MAQUINAS, type MaquinaOperacional } from "@/lib/maquinas/catalogo";

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
      somenteAssinatura?: boolean;
    },
  ) => Promise<void>;
}

/**
 * Carrega/sincroniza as 24 linhas horárias do Hora x Hora.
 * A confirmação do lançamento vem do Supabase. Uma hora que não chegou ao
 * servidor não pode aparecer como salva nem alimentar o card do Telegram.
 */
export function useProducaoHoraria(
  folhaDiaKey: string,
  dataOperacao: string,
  turno: Turno | null,
  operadorUserId?: string | null,
  maquina: MaquinaOperacional = MAQUINAS["enchedora-3"],
  usarCacheLocal = true,
): UseProducaoHorariaResult {
  const { isOnline } = useConnectionStatus();
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
        maquina,
      );
      return mesclarHorasComPadrao(defaults, remotos, operadorUserId);
    },
    [folhaDiaKey, dataOperacao, turno, operadorUserId, maquina],
  );

  const refetch = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      if (!isOnline && !usarCacheLocal) {
        throw new Error("Sem conexão para consultar o banco.");
      }
      const local = usarCacheLocal ? producaoStorage.getHoras(folhaDiaKey) : [];
      setHoras(mergeWithDefaults(local));
      if (isOnline) {
        const remotos = await fetchProducaoHoras(folhaDiaKey);
        setHoras(mergeWithDefaults(remotos));
        if (usarCacheLocal) producaoStorage.bulkSetHoras(folhaDiaKey, remotos);
      }
    } catch (e) {
      console.error(e);
      setError(
        usarCacheLocal
          ? "Erro ao carregar Hora x Hora. Mostrando dados locais."
          : "Não foi possível consultar o banco. Tente atualizar antes de avaliar as horas.",
      );
    } finally {
      setLoading(false);
    }
  }, [folhaDiaKey, isOnline, mergeWithDefaults, usarCacheLocal]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const salvarHora: UseProducaoHorariaResult["salvarHora"] = useCallback(
    async (hora, opts) => {
      if (!isOnline) {
        throw new Error("Conecte o tablet para confirmar o lançamento no Supabase.");
      }
      const anteriorConfirmado =
        opts?.anterior &&
        (opts.anterior.finalizadoEm ||
          (opts.anterior.createdAt &&
            (opts.anterior.naoRodou || typeof opts.anterior.quantidade === "number")));
      if ((hora.finalizadoEm || anteriorConfirmado) && !opts?.somenteAssinatura) {
        throw new Error("Esta hora já foi salva e não pode ser alterada.");
      }

      const edicao: ProducaoHoraEdicaoPayload | null = opts?.anterior?.createdAt
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

      try {
        const saved = await upsertProducaoHora(hora, {
          expectedUpdatedAt,
          somenteAssinatura: opts?.somenteAssinatura,
        });
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
        if (typeof e === "object" && e !== null && "code" in e && e.code === "23505") {
          await refetch();
          throw new Error("Esta hora já foi registrada para a máquina. Confira o lançamento atualizado.");
        }
        if (e instanceof ConflitoVersaoError) {
          setConflito(true);
          throw e;
        }
        console.error("[useProducaoHoraria] erro de aplicação:", e);
        throw e;
      }
    },
    [isOnline, refetch],
  );

  return { horas, loading, error, conflito, refetch, salvarHora };
}
