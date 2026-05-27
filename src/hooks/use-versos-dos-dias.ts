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
import { buildFolhaDiaKey } from "@/lib/operacao/data-operacional";
import { temVerso } from "@/lib/verso/aplicabilidade";
import type { FolhaChecklistDia } from "@/lib/checklist/types";

interface UseVersosDosDiasResult {
  /** Map indexado por `folhaKey` (turno+equipe) — UM resumo por turno. */
  resumos: Map<string, ResumoVerso>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Carrega o resumo do verso (PTP + Limpeza) por TURNO para múltiplas folhas.
 *
 * - 2 queries SQL totais usando `.in("folha_dia_key", keys)` (deduplicado).
 * - Para cada `folha.folhaKey` (turno+equipe específicos), calcula um
 *   `ResumoVerso` filtrado para aquele turno. Assim, no mesmo dia, o card
 *   do 12x36 Dia mostra só janelas Dia (0/6), e o 12x36 Noite mostra só
 *   janelas Noite (X/6) — sem misturar.
 * - Refetch on mount + on `visibilitychange` (debounce 500ms).
 */
export function useVersosDosDiasRemote(
  folhas: FolhaChecklistDia[],
): UseVersosDosDiasResult {
  // Só folhas com verso (Linha 3 / Enchedora 3).
  const folhasComVerso = useMemo(
    () => folhas.filter(temVerso),
    [folhas],
  );

  // Estabiliza pela identidade lógica de cada folha (folhaKey).
  const folhasKeysSerial = useMemo(
    () => folhasComVerso.map((f) => f.folhaKey).sort().join("|"),
    [folhasComVerso],
  );

  // `folhaDiaKey` único para as duas queries.
  const folhaDiaKeys = useMemo(() => {
    const set = new Set<string>();
    for (const f of folhasComVerso) {
      set.add(
        buildFolhaDiaKey(
          f.contexto.data,
          f.contexto.linha,
          f.contexto.maquina,
        ),
      );
    }
    return [...set];
  }, [folhasComVerso]);

  const folhaDiaKeysSerial = useMemo(
    () => [...folhaDiaKeys].sort().join("|"),
    [folhaDiaKeys],
  );

  const [resumos, setResumos] = useState<Map<string, ResumoVerso>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    if (folhasComVerso.length === 0) {
      setResumos(new Map());
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const keys = folhaDiaKeysSerial ? folhaDiaKeysSerial.split("|") : [];
      const [ptpRes, limpRes] = await Promise.all([
        supabase
          .from("ptp_janelas" as never)
          .select("*")
          .in("folha_dia_key", keys),
        supabase
          .from("limpeza_turnos" as never)
          .select("*")
          .in("folha_dia_key", keys),
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

      // Um resumo por folhaKey (turno+equipe), filtrado pelo escopo do turno.
      const next = new Map<string, ResumoVerso>();
      for (const f of folhasComVerso) {
        const diaKey = buildFolhaDiaKey(
          f.contexto.data,
          f.contexto.linha,
          f.contexto.maquina,
        );
        next.set(
          f.folhaKey,
          calcularResumoVerso({
            janelas: janelasPorDia.get(diaKey) ?? [],
            turnos: turnosPorDia.get(diaKey) ?? [],
            escopo: { turno: f.contexto.turno, equipe: f.contexto.equipe },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folhasKeysSerial, folhaDiaKeysSerial]);

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

  return { resumos, loading, error, refetch };
}
