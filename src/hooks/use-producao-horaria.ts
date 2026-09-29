import { useCallback, useEffect, useState } from "react";
import { useConnectionStatus } from "./use-connection-status";
import { producaoStorage } from "@/lib/producao/storage";
import { assinarHoraOperador } from "@/lib/producao/assinatura-operador";
import { ehHoraDeChecagemLider } from "@/lib/producao/constants";
import { horaEstaNoPrazo } from "@/lib/producao/horario";
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
    },
  ) => Promise<void>;
  assinarHora: (
    hora: ProducaoHora,
    assinaturaDataUrl: string,
    nomeLider: string,
  ) => Promise<void>;
  assinarTurnoOperador: (hora: ProducaoHora, assinaturaDataUrl: string) => Promise<void>;
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
      if (hora.finalizadoEm || anteriorConfirmado) {
        throw new Error("Esta hora já foi salva e não pode ser alterada.");
      }
      if (!horaEstaNoPrazo(hora.dataOperacao, hora.horaCodigo)) {
        throw new Error(`O prazo para salvar ${hora.horaInicio}–${hora.horaFim} terminou 20 minutos após o fim da hora.`);
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

  const assinarHora: UseProducaoHorariaResult["assinarHora"] = useCallback(
    async (hora, assinaturaDataUrl, nomeLider) => {
      if (!isOnline) throw new Error("Conecte o tablet para salvar a assinatura do líder.");
      if (!ehHoraDeChecagemLider(hora.horaCodigo) || !hora.createdAt || !hora.updatedAt ||
          !(hora.finalizadoEm || hora.naoRodou || typeof hora.quantidade === "number")) {
        throw new Error("A assinatura fica disponível após confirmar a última hora do turno.");
      }
      if (hora.assinaturaLider?.dataUrl) throw new Error("Esta checagem já foi assinada.");
      if (hora.finalizadoEm && !hora.assinaturaOperador?.dataUrl) {
        throw new Error("O operador deve assinar o turno antes da validação do líder.");
      }
      const nome = nomeLider.trim();
      if (nome.length < 2 || nome.length > 120) {
        throw new Error("Informe o nome de quem assinou (2 a 120 caracteres).");
      }
      if (!assinaturaDataUrl.startsWith("data:image/png;base64,") || assinaturaDataUrl.length < 100) {
        throw new Error("Peça ao líder para desenhar a assinatura antes de salvar.");
      }
      const assinadoEm = new Date().toISOString();
      try {
        const salva = await upsertProducaoHora({
          ...hora,
          liderNome: nome,
          assinaturaLider: { dataUrl: assinaturaDataUrl, nome, assinadoEm },
          liderAssinouEm: assinadoEm,
        }, { expectedUpdatedAt: hora.updatedAt, somenteAssinatura: true });
        if (usarCacheLocal) producaoStorage.saveHora(salva);
        setHoras((prev) => prev.map((item) =>
          item.id === salva.id ? salva : item,
        ));
      } catch (e) {
        if (e instanceof ConflitoVersaoError ||
            (e instanceof Error && /hora mudou|já assinada/i.test(e.message))) {
          setConflito(true);
        }
        throw e;
      }
    },
    [isOnline, usarCacheLocal],
  );

  const assinarTurnoOperador: UseProducaoHorariaResult["assinarTurnoOperador"] = useCallback(
    async (hora, assinaturaDataUrl) => {
      if (!isOnline) throw new Error("Conecte o tablet para salvar a assinatura do operador.");
      try {
        const salva = await assinarHoraOperador(hora, assinaturaDataUrl);
        if (usarCacheLocal) producaoStorage.saveHora(salva);
        setHoras((prev) => prev.map((item) => item.id === salva.id ? salva : item));
      } catch (e) {
        if (e instanceof Error && /hora mudou|já assinou|já assinada/i.test(e.message)) {
          setConflito(true);
        }
        throw e;
      }
    },
    [isOnline, usarCacheLocal],
  );

  return { horas, loading, error, conflito, refetch, salvarHora, assinarHora, assinarTurnoOperador };
}
