import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAnomaliaAtualizacoes } from "@/lib/checklist/supabase-storage";
import type { AnomaliaAtualizacao } from "@/lib/checklist/types";

export function useAnomaliaAtualizacoes(anomaliaId: string | null | undefined) {
  const [data, setData] = useState<AnomaliaAtualizacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!anomaliaId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const lista = await fetchAnomaliaAtualizacoes(anomaliaId);
      setData(lista);
    } catch (e) {
      console.error(e);
      setError("Erro ao carregar histórico");
    } finally {
      setLoading(false);
    }
  }, [anomaliaId]);

  useEffect(() => {
    void refetch();
    if (!anomaliaId) return;
    const ch = supabase
      .channel(`anomalia-atualizacoes-${anomaliaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "anomalia_atualizacoes",
          filter: `anomalia_id=eq.${anomaliaId}`,
        },
        () => {
          void refetch();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [anomaliaId, refetch]);

  return { data, loading, error, refetch };
}
