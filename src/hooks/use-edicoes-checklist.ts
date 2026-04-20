import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EdicaoChecklist {
  id: number;
  checklist_id: string;
  versao: number;
  editado_por_user_id: string | null;
  operador_login: string;
  operador_responsavel: string;
  editado_em: string;
  checklist_antes: any;
  checklist_depois: any;
}

export function useEdicoesChecklist(checklistId: string | undefined) {
  const [data, setData] = useState<EdicaoChecklist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!checklistId) {
      setData([]);
      setLoading(false);
      return;
    }
    let cancelado = false;
    (async () => {
      setLoading(true);
      const { data: rows, error } = await supabase
        .from("checklist_edicoes")
        .select("*")
        .eq("checklist_id", checklistId)
        .order("versao", { ascending: true });
      if (cancelado) return;
      if (error) {
        console.error("[useEdicoesChecklist]", error);
        setData([]);
      } else {
        setData((rows ?? []) as unknown as EdicaoChecklist[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [checklistId]);

  return { data, loading };
}
