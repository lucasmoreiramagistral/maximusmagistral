import { useCallback, useEffect, useState } from "react";
import { useConnectionStatus, useOfflineQueue } from "./use-connection-status";
import { versoStorage } from "@/lib/verso/storage";
import {
  createPtpJanelasPadrao,
  fetchPtpJanelas,
  upsertPtpJanela,
  insertPtpEdicao,
  ConflitoVersaoError,
} from "@/lib/verso/supabase-storage";
import {
  upsertObservacaoVerso,
  labelPtpJanela,
} from "@/lib/verso/observacoes";
import type { PtpEdicaoPayload, PtpJanela } from "@/lib/verso/types";
import { VERSO_CONTEXTO_FIXO } from "@/lib/verso/constants";

interface UsePtpResult {
  janelas: PtpJanela[];
  loading: boolean;
  error: string | null;
  conflito: boolean;
  refetch: () => Promise<void>;
  salvarJanela: (
    janela: PtpJanela,
    opts?: {
      anterior?: PtpJanela;
      motivoEdicao?: string;
      editadoPorLogin: string;
      editadoPorNome: string;
    },
  ) => Promise<void>;
}

/**
 * Carrega/sincroniza janelas do PTP do dia.
 * - se online: busca do banco e mescla com as 12 janelas default
 * - se offline: usa estado local
 * - salvar: tenta upsert online; se falhar, enfileira via fila offline
 */
export function usePtpJanelas(folhaDiaKey: string, dataOperacao: string): UsePtpResult {
  const { isOnline } = useConnectionStatus();
  const { enfileirar } = useOfflineQueue();
  const [janelas, setJanelas] = useState<PtpJanela[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflito, setConflito] = useState(false);

  const mergeWithDefaults = useCallback(
    (remotos: PtpJanela[]): PtpJanela[] => {
      const defaults = createPtpJanelasPadrao(folhaDiaKey, dataOperacao);
      return defaults.map((d) => {
        const found = remotos.find((r) => r.janelaCodigo === d.janelaCodigo);
        return found ?? d;
      });
    },
    [folhaDiaKey, dataOperacao],
  );

  const refetch = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      // sempre começa com o que estiver local
      const local = versoStorage.getPtpJanelas(folhaDiaKey);
      if (local.length > 0) {
        setJanelas(mergeWithDefaults(local));
      } else {
        setJanelas(mergeWithDefaults([]));
      }
      if (isOnline) {
        const remotos = await fetchPtpJanelas(folhaDiaKey);
        const merged = mergeWithDefaults(remotos);
        setJanelas(merged);
        versoStorage.bulkSetPtpJanelas(folhaDiaKey, remotos);
      }
    } catch (e) {
      console.error(e);
      setError("Erro ao carregar PTP. Mostrando dados locais.");
    } finally {
      setLoading(false);
    }
  }, [folhaDiaKey, isOnline, mergeWithDefaults]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const salvarJanela: UsePtpResult["salvarJanela"] = useCallback(
    async (janela, opts) => {
      // 1) atualiza UI + storage local imediatamente
      versoStorage.savePtpJanela(janela);
      setJanelas((prev) => {
        const i = prev.findIndex((p) => p.janelaCodigo === janela.janelaCodigo);
        if (i < 0) return [...prev, janela];
        const next = [...prev];
        next[i] = janela;
        return next;
      });

      const edicao: PtpEdicaoPayload | null = opts?.anterior
        ? {
            ptpJanelaId: janela.id,
            folhaDiaKey: janela.folhaDiaKey,
            janelaCodigo: janela.janelaCodigo,
            editadoPorLogin: opts.editadoPorLogin,
            editadoPorNome: opts.editadoPorNome,
            motivoEdicao: opts.motivoEdicao ?? null,
            antesJson: opts.anterior,
            depoisJson: janela,
          }
        : null;

      // Conflito de versão: usa o updatedAt do snapshot que estamos salvando
      // (espelha o que o servidor devolveu na última leitura/gravação).
      // Se for a primeira gravação, será undefined e a checagem é pulada.
      const expectedUpdatedAt = janela.updatedAt ?? opts?.anterior?.updatedAt;

      // 2) tenta enviar agora; se falhar, vai pra fila
      if (!isOnline) {
        enfileirar("ptp_janela", {
          janela,
          expectedUpdatedAt: expectedUpdatedAt ?? null,
          edicao,
        });
        return;
      }
      try {
        const saved = await upsertPtpJanela(janela, {
          expectedUpdatedAt: expectedUpdatedAt,
        });
        versoStorage.savePtpJanela(saved);
        setJanelas((prev) => {
          const i = prev.findIndex((p) => p.janelaCodigo === saved.janelaCodigo);
          if (i < 0) return [...prev, saved];
          const next = [...prev];
          next[i] = saved;
          return next;
        });
        if (edicao) {
          try {
            await insertPtpEdicao(edicao);
          } catch (e) {
            console.error("[usePtpJanelas] insertPtpEdicao falhou:", e);
          }
        }
        // Propagação para o campo "Observações" da frente da folha:
        // só quando a janela é CONCLUÍDA (tem assinatura ou status final).
        // Se a observação está vazia, o helper remove a linha existente.
        const ehConclusao =
          saved.statusJanela === "sem_ocorrencia" ||
          saved.statusJanela === "houve_ocorrencia" ||
          saved.statusJanela === "nao_rodou";
        if (ehConclusao && opts) {
          try {
            await upsertObservacaoVerso({
              folhaDiaKey: saved.folhaDiaKey,
              dataOperacao: saved.dataOperacao,
              linha: saved.linha || VERSO_CONTEXTO_FIXO.linha,
              maquina: saved.maquina || VERSO_CONTEXTO_FIXO.maquina,
              origemTipo: "ptp",
              origemCodigo: saved.janelaCodigo,
              origemLabel: labelPtpJanela(saved.janelaCodigo),
              texto: saved.observacao ?? "",
              registradoPorLogin: opts.editadoPorLogin,
              registradoPorNome: opts.editadoPorNome,
            });
          } catch (e) {
            console.error("[usePtpJanelas] upsertObservacaoVerso falhou:", e);
          }
        }
      } catch (e) {
        if (e instanceof ConflitoVersaoError) {
          setConflito(true);
          throw e;
        }
        // erro provável de rede → enfileira
        enfileirar("ptp_janela", {
          janela,
          expectedUpdatedAt: expectedUpdatedAt ?? null,
          edicao,
        });
      }
    },
    [enfileirar, isOnline],
  );

  return { janelas, loading, error, conflito, refetch, salvarJanela };
}
