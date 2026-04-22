import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  limpezaTurnoFromRow,
  ptpJanelaFromRow,
  type LimpezaTurnoRow,
  type PtpJanelaRow,
} from "@/lib/verso/mappers";
import type { LimpezaTurno, PtpJanela } from "@/lib/verso/types";

interface UseVersoRelatorioResult {
  ptp: PtpJanela[];
  limpeza: LimpezaTurno[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Carrega TODOS os registros de PTP e Limpeza num intervalo (data_operacao).
 *
 * - 2 queries por intervalo, sem filtro de turno em SQL (turno do PTP é
 *   derivado em memória via PTP_JANELAS_POR_TURNO).
 * - Erro fica isolado em `error`; nunca lança.
 * - Refetch on `visibilitychange` (debounce 500ms).
 */
export function useVersoRelatorioRemote(
  dataInicio: string,
  dataFim: string,
): UseVersoRelatorioResult {
  const [ptp, setPtp] = useState<PtpJanela[]>([]);
  const [limpeza, setLimpeza] = useState<LimpezaTurno[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    if (!dataInicio || !dataFim) {
      setPtp([]);
      setLimpeza([]);
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
          .gte("data_operacao", dataInicio)
          .lte("data_operacao", dataFim)
          .order("data_operacao", { ascending: true }),
        supabase
          .from("limpeza_turnos" as never)
          .select("*")
          .gte("data_operacao", dataInicio)
          .lte("data_operacao", dataFim)
          .order("data_operacao", { ascending: true }),
      ]);
      if (ptpRes.error) throw ptpRes.error;
      if (limpRes.error) throw limpRes.error;
      setPtp(((ptpRes.data ?? []) as unknown as PtpJanelaRow[]).map(ptpJanelaFromRow));
      setLimpeza(
        ((limpRes.data ?? []) as unknown as LimpezaTurnoRow[]).map(limpezaTurnoFromRow),
      );
    } catch (e) {
      console.error("[useVersoRelatorioRemote] erro:", e);
      setError("Não foi possível carregar os dados do verso.");
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

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

  return { ptp, limpeza, loading, error, refetch };
}
