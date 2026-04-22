import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  limpezaTurnoFromRow,
  ptpJanelaFromRow,
  type LimpezaTurnoRow,
  type PtpJanelaRow,
} from "@/lib/verso/mappers";
import { calcularResumoVerso, type ResumoVerso } from "@/lib/verso/resumo";
import type { LimpezaTurno, PtpJanela } from "@/lib/verso/types";

interface UseVersosDosDiasResult {
  resumos: Map<string, ResumoVerso>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Carrega o resumo do verso (PTP + Limpeza) para múltiplos dias de uma vez.
 *
 * - 2 queries SQL totais (`.in("folha_dia_key", keys)` em `ptp_janelas` e
 *   `limpeza_turnos`), independente de quantas folhas há na listagem.
 * - Refetch on mount + on `visibilitychange` (debounce 500ms).
 * - Sem realtime — `useChecklistsRemote({realtime:true})` já cobre a lista
 *   principal; o verso muda devagar e não compensa websocket adicional.
 *
 * As chaves devem vir já deduplicadas por `extrairFolhasDiaKeysComVerso`.
 */
export function useVersosDosDiasRemote(
  folhaDiaKeys: string[],
): UseVersosDosDiasResult {
  // Estabiliza o array — evita refetch quando a referência muda mas o conteúdo é igual.
  const keysSerializadas = useMemo(
    () => [...folhaDiaKeys].sort().join("|"),
    [folhaDiaKeys],
  );
  const keysEstaveis = useMemo(
    () => (keysSerializadas ? keysSerializadas.split("|") : []),
    [keysSerializadas],
  );

  const [resumos, setResumos] = useState<Map<string, ResumoVerso>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    if (keysEstaveis.length === 0) {
      setResumos(new Map());
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ptpRes, limpRes] = await Promise.all([
        supabase
          .from("ptp_janelas" as never)
          .select("*")
          .in("folha_dia_key", keysEstaveis),
        supabase
          .from("limpeza_turnos" as never)
          .select("*")
          .in("folha_dia_key", keysEstaveis),
      ]);

      if (ptpRes.error) throw ptpRes.error;
      if (limpRes.error) throw limpRes.error;

      const janelasPorDia = new Map<string, PtpJanela[]>();
      for (const row of (ptpRes.data ?? []) as unknown as PtpJanelaRow[]) {
        const j = ptpJanelaFromRow(row);
        const arr = janelasPorDia.get(j.folhaDiaKey) ?? [];
        arr.push(j);
        janelasPorDia.set(j.folhaDiaKey, arr);
      }

      const turnosPorDia = new Map<string, LimpezaTurno[]>();
      for (const row of (limpRes.data ?? []) as unknown as LimpezaTurnoRow[]) {
        const t = limpezaTurnoFromRow(row);
        const arr = turnosPorDia.get(t.folhaDiaKey) ?? [];
        arr.push(t);
        turnosPorDia.set(t.folhaDiaKey, arr);
      }

      const next = new Map<string, ResumoVerso>();
      for (const key of keysEstaveis) {
        next.set(
          key,
          calcularResumoVerso({
            janelas: janelasPorDia.get(key) ?? [],
            turnos: turnosPorDia.get(key) ?? [],
          }),
        );
      }
      setResumos(next);
    } catch (e) {
      console.error("[useVersosDosDiasRemote] erro:", e);
      setError("Erro ao carregar resumos do verso.");
    } finally {
      setLoading(false);
    }
  }, [keysEstaveis]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Refetch on focus (debounced 500ms para não floodear ao alternar abas).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void refetch();
      }, 500);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [refetch]);

  return { resumos, loading, error, refetch };
}
