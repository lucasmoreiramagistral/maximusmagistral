import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Retorna um Map<checklist_id, total_edicoes> para uma lista de IDs.
 * Útil para indicar na gestão quais checklists possuem histórico de edições.
 */
export function useEdicoesChecklists(checklistIds: string[]) {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const key = checklistIds.slice().sort().join(",");

  useEffect(() => {
    if (checklistIds.length === 0) {
      setCounts(new Map());
      return;
    }
    let cancelado = false;
    (async () => {
      const { data, error } = await supabase
        .from("checklist_edicoes")
        .select("checklist_id")
        .in("checklist_id", checklistIds);
      if (cancelado) return;
      if (error) {
        console.error("[useEdicoesChecklists]", error);
        setCounts(new Map());
        return;
      }
      const m = new Map<string, number>();
      for (const row of data ?? []) {
        const id = (row as { checklist_id: string }).checklist_id;
        m.set(id, (m.get(id) ?? 0) + 1);
      }
      setCounts(m);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return counts;
}
