import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Carrega TODAS as edições de checklist em um intervalo de datas (Manaus).
 * Retorna Map<checklist_id, total_edicoes>.
 */
export function useEdicoesPorPeriodo(dataInicio: string, dataFim: string) {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dataInicio || !dataFim) return;
    let cancelado = false;
    setLoading(true);
    (async () => {
      // Manaus = UTC-4. Converte intervalo para UTC.
      const ini = `${dataInicio}T00:00:00-04:00`;
      const fim = `${dataFim}T23:59:59-04:00`;
      const { data, error } = await supabase
        .from("checklist_edicoes")
        .select("checklist_id")
        .gte("editado_em", ini)
        .lte("editado_em", fim);
      if (cancelado) return;
      if (error) {
        console.error("[useEdicoesPorPeriodo]", error);
        setCounts(new Map());
        setLoading(false);
        return;
      }
      const m = new Map<string, number>();
      for (const row of data ?? []) {
        const id = (row as { checklist_id: string }).checklist_id;
        m.set(id, (m.get(id) ?? 0) + 1);
      }
      setCounts(m);
      setLoading(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [dataInicio, dataFim]);

  return { counts, loading };
}
