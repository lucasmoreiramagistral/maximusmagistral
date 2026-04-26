import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listarResolucoes,
  type ResolucaoNcNr,
} from "@/lib/nao-conformidades/resolucoes";

export function useResolucoesNcNr(diasJanela: number = 90): {
  data: ResolucaoNcNr[];
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<ResolucaoNcNr[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const desde = new Date();
    desde.setDate(desde.getDate() - diasJanela);
    const iso = desde.toISOString().slice(0, 10);
    const lista = await listarResolucoes(iso);
    setData(lista);
    setLoading(false);
  }, [diasJanela]);

  useEffect(() => {
    void refetch();
    const ch = supabase
      .channel("nao-conformidade-resolucoes-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nao_conformidade_resolucoes" },
        () => {
          void refetch();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [refetch]);

  return { data, loading, refetch };
}
