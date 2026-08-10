import { useCallback, useEffect, useState } from "react";
import { useConnectionStatus, useOfflineQueue } from "./use-connection-status";
import { producaoVersoStorage } from "@/lib/producao/verso-storage";
import { blocoDoTurno } from "@/lib/producao/verso-constants";
import {
  ConflitoVersaoError,
  createPassagemPadrao,
  createTanquesPadrao,
  fetchProducaoPassagens,
  fetchProducaoTanques,
  passagemId,
  upsertProducaoPassagem,
  upsertProducaoTanque,
} from "@/lib/producao/verso-supabase";
import type {
  PassagemBloco,
  ProducaoPassagem,
  ProducaoTanque,
} from "@/lib/producao/verso-types";
import type { Turno } from "@/lib/checklist/types";

interface UseProducaoVersoResult {
  tanques: ProducaoTanque[];
  passagem: ProducaoPassagem | null;
  bloco: PassagemBloco;
  loading: boolean;
  error: string | null;
  conflito: boolean;
  refetch: () => Promise<void>;
  salvarTanque: (t: ProducaoTanque) => Promise<void>;
  salvarPassagem: (p: ProducaoPassagem) => Promise<void>;
}

function ehErroDeRede(msg: string) {
  return /failed to fetch|networkerror|fetch failed|load failed|timeout|aborted|err_network|err_internet/i.test(
    msg,
  );
}

/**
 * Verso do relatório operacional horário: tanques de xarope + passagem
 * de turno. Offline-first, mesmo contrato dos demais hooks de produção.
 */
export function useProducaoVerso(
  folhaDiaKey: string,
  dataOperacao: string,
  turno: Turno | null,
  operadorUserId?: string | null,
): UseProducaoVersoResult {
  const { isOnline } = useConnectionStatus();
  const { enfileirar } = useOfflineQueue();
  const bloco = blocoDoTurno(turno);

  const [tanques, setTanques] = useState<ProducaoTanque[]>([]);
  const [passagem, setPassagem] = useState<ProducaoPassagem | null>(null);
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

    const padraoTanques = createTanquesPadrao(
      folhaDiaKey,
      dataOperacao,
      turno,
      operadorUserId,
    );
    const padraoPassagem = createPassagemPadrao(
      folhaDiaKey,
      dataOperacao,
      turno,
      bloco,
      operadorUserId,
    );

    try {
      const locaisTanques = producaoVersoStorage.getTanques(folhaDiaKey);
      const mescladosLocais = padraoTanques.map(
        (p) => locaisTanques.find((l) => l.id === p.id) ?? p,
      );
      setTanques(mescladosLocais);

      const localPassagem = producaoVersoStorage.getPassagem(
        passagemId(dataOperacao, bloco, operadorUserId),
      );
      setPassagem(localPassagem ?? padraoPassagem);

      if (isOnline) {
        const [remotosTanques, remotasPassagens] = await Promise.all([
          fetchProducaoTanques(folhaDiaKey, operadorUserId),
          fetchProducaoPassagens(folhaDiaKey, operadorUserId),
        ]);
        const mesclados = padraoTanques.map(
          (p) => remotosTanques.find((r) => r.id === p.id) ?? p,
        );
        setTanques(mesclados);
        producaoVersoStorage.setTanques(folhaDiaKey, mesclados);

        const encontrada =
          remotasPassagens.find((r) => r.id === padraoPassagem.id) ?? null;
        if (encontrada) {
          setPassagem(encontrada);
          producaoVersoStorage.savePassagem(encontrada);
        }
      }
    } catch (e) {
      console.error(e);
      setError("Erro ao carregar o verso. Mostrando dados locais.");
    } finally {
      setLoading(false);
    }
  }, [folhaDiaKey, dataOperacao, turno, operadorUserId, isOnline, bloco]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const salvarTanque = useCallback(
    async (t: ProducaoTanque) => {
      producaoVersoStorage.saveTanque(t);
      setTanques((prev) => prev.map((x) => (x.id === t.id ? t : x)));
      const expectedUpdatedAt = t.updatedAt ?? null;

      if (!isOnline) {
        enfileirar("producao_tanque", { tanque: t, expectedUpdatedAt });
        return;
      }
      try {
        const saved = await upsertProducaoTanque(t, { expectedUpdatedAt });
        producaoVersoStorage.saveTanque(saved);
        setTanques((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      } catch (e) {
        if (e instanceof ConflitoVersaoError) {
          setConflito(true);
          throw e;
        }
        const msg = e instanceof Error ? e.message : String(e);
        if (ehErroDeRede(msg)) {
          enfileirar("producao_tanque", { tanque: t, expectedUpdatedAt });
          return;
        }
        console.error("[useProducaoVerso] erro de aplicação (tanque):", e);
        throw e;
      }
    },
    [enfileirar, isOnline],
  );

  const salvarPassagem = useCallback(
    async (p: ProducaoPassagem) => {
      producaoVersoStorage.savePassagem(p);
      setPassagem(p);
      const expectedUpdatedAt = p.updatedAt ?? null;

      if (!isOnline) {
        enfileirar("producao_passagem", { passagem: p, expectedUpdatedAt });
        return;
      }
      try {
        const saved = await upsertProducaoPassagem(p, { expectedUpdatedAt });
        producaoVersoStorage.savePassagem(saved);
        setPassagem(saved);
      } catch (e) {
        if (e instanceof ConflitoVersaoError) {
          setConflito(true);
          throw e;
        }
        const msg = e instanceof Error ? e.message : String(e);
        if (ehErroDeRede(msg)) {
          enfileirar("producao_passagem", { passagem: p, expectedUpdatedAt });
          return;
        }
        console.error("[useProducaoVerso] erro de aplicação (passagem):", e);
        throw e;
      }
    },
    [enfileirar, isOnline],
  );

  return {
    tanques,
    passagem,
    bloco,
    loading,
    error,
    conflito,
    refetch,
    salvarTanque,
    salvarPassagem,
  };
}
