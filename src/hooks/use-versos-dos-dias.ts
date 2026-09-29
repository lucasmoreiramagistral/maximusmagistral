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
import { maquinaPorNome } from "@/lib/maquinas/catalogo";
import { paginarPorChaves } from "@/lib/verso/paginacao";
import type { FolhaChecklistDia } from "@/lib/checklist/types";

interface UseVersosDosDiasResult {
  /** Map indexado por `folhaKey` (turno+equipe) — UM resumo por turno. */
  resumos: Map<string, ResumoVerso>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/** Evita o corte implícito de linhas do PostgREST em consultas de vários dias. */
async function buscarTodasLinhas<T>(
  tabela: "ptp_janelas" | "limpeza_turnos",
  keys: string[],
): Promise<T[]> {
  return paginarPorChaves(keys, async (lote, de, ate) => {
      const { data, error, count } = await supabase.from(tabela as never)
        .select("*", { count: "exact" })
        .in("folha_dia_key", lote)
        .order("id", { ascending: true })
        .range(de, ate);
      if (error) throw error;
      return { data: (data ?? []) as T[], count };
  });
}

/**
 * Carrega o resumo do verso (PTP e limpeza quando aplicável) por TURNO.
 *
 * - Consultas em lotes e páginas por `folha_dia_key`, sem truncar 30 dias de quatro máquinas.
 * - Para cada `folha.folhaKey` (turno+equipe específicos), calcula um
 *   `ResumoVerso` filtrado para aquele turno. Assim, no mesmo dia, o card
 *   do 12x36 Dia mostra só janelas Dia (0/6), e o 12x36 Noite mostra só
 *   janelas Noite (X/6) — sem misturar.
 * - Refetch on mount + on `visibilitychange` (debounce 500ms).
 */
export function useVersosDosDiasRemote(
  folhas: FolhaChecklistDia[],
): UseVersosDosDiasResult {
  // Cada uma das quatro máquinas tem PTP; só as enchedoras têm limpeza.
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
  const limpezaDiaKeysSerial = useMemo(() => {
    const keys = new Set<string>();
    for (const f of folhasComVerso) {
      if (!maquinaPorNome(f.contexto.maquina)?.formularios.limpeza) continue;
      keys.add(buildFolhaDiaKey(f.contexto.data, f.contexto.linha, f.contexto.maquina));
    }
    return [...keys].sort().join("|");
  }, [folhasComVerso]);

  const [resumos, setResumos] = useState<Map<string, ResumoVerso>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buscaRef = useRef(0);

  const refetch = useCallback(async () => {
    const busca = ++buscaRef.current;
    if (folhasComVerso.length === 0) {
      setResumos(new Map());
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setResumos(new Map());
    setError(null);
    try {
      const keys = folhaDiaKeysSerial ? folhaDiaKeysSerial.split("|") : [];
      const limpezaKeys = limpezaDiaKeysSerial ? limpezaDiaKeysSerial.split("|") : [];
      const [ptpLinhas, limpezaLinhas] = await Promise.all([
        buscarTodasLinhas<PtpJanelaRow>("ptp_janelas", keys),
        buscarTodasLinhas<LimpezaTurnoRow>("limpeza_turnos", limpezaKeys),
      ]);

      const janelasPorDia = new Map<string, PtpJanela[]>();
      for (const row of ptpLinhas) {
        const j = ptpJanelaFromRow(row);
        const arr = janelasPorDia.get(j.folhaDiaKey) ?? [];
        arr.push(j);
        janelasPorDia.set(j.folhaDiaKey, arr);
      }

      const turnosPorDia = new Map<string, LimpezaTurno[]>();
      for (const row of limpezaLinhas) {
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
            maquina: f.contexto.maquina,
          }),
        );
      }
      if (busca === buscaRef.current) setResumos(next);
    } catch (e) {
      console.error("[useVersosDosDiasRemote] erro:", e);
      if (busca === buscaRef.current) {
        setResumos(new Map());
        setError("Erro ao carregar todos os resumos do verso. Tente novamente.");
      }
    } finally {
      if (busca === buscaRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folhasKeysSerial, folhaDiaKeysSerial, limpezaDiaKeysSerial]);

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
