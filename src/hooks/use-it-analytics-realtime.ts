// ============================================================
// Realtime para o painel /gestao/it-analytics.
// Escuta INSERTs em it_consulta_sessoes e it_consulta_eventos
// e dispara um callback (debounced) pra recarregar os dados.
// Debounce evita refetch em rajada quando vários eventos chegam juntos.
// ============================================================

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useItAnalyticsRealtime(
  enabled: boolean,
  onChange: () => void,
  debounceMs = 1500,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        onChangeRef.current();
      }, debounceMs);
    };

    const ch = supabase
      .channel("it-analytics-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "it_consulta_sessoes" },
        trigger,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "it_consulta_eventos" },
        trigger,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "it_consulta_sessoes" },
        trigger,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
  }, [enabled, debounceMs]);
}
