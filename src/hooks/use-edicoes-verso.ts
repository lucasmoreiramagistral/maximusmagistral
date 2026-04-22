import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EdicaoVersoPtp {
  id: number;
  ptpJanelaId: string;
  janelaCodigo: string;
  editadoEm: string;
  editadoPorNome: string;
  editadoPorLogin: string;
  motivoEdicao: string | null;
  antesJson: unknown;
  depoisJson: unknown;
}

export interface EdicaoVersoLimpeza {
  id: number;
  limpezaTurnoId: string;
  turno: string;
  editadoEm: string;
  editadoPorNome: string;
  editadoPorLogin: string;
  motivoEdicao: string | null;
  antesJson: unknown;
  depoisJson: unknown;
}

interface UseEdicoesVersoResult {
  ptp: EdicaoVersoPtp[];
  limpeza: EdicaoVersoLimpeza[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface PtpEdicaoRow {
  id: number;
  ptp_janela_id: string;
  janela_codigo: string;
  created_at: string;
  editado_por_nome: string;
  editado_por_login: string;
  motivo_edicao: string | null;
  antes_json: unknown;
  depois_json: unknown;
}

interface LimpEdicaoRow {
  id: number;
  limpeza_turno_id: string;
  turno: string;
  created_at: string;
  editado_por_nome: string;
  editado_por_login: string;
  motivo_edicao: string | null;
  antes_json: unknown;
  depois_json: unknown;
}

/**
 * Carrega o histórico de edições do verso (PTP + Limpeza) de um dia.
 *
 * Lazy: só dispara fetch quando `enabled === true`. Usado pelo Dialog
 * "Histórico de edições" no detalhe do dia da gestão — sem `enabled`
 * o hook NÃO toca no banco.
 */
export function useEdicoesVerso(
  folhaDiaKey: string,
  opts: { enabled: boolean },
): UseEdicoesVersoResult {
  const [ptp, setPtp] = useState<EdicaoVersoPtp[]>([]);
  const [limpeza, setLimpeza] = useState<EdicaoVersoLimpeza[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!opts.enabled || !folhaDiaKey) return;
    setLoading(true);
    setError(null);
    try {
      const [ptpRes, limpRes] = await Promise.all([
        supabase
          .from("ptp_janelas_edicoes" as never)
          .select("*")
          .eq("folha_dia_key", folhaDiaKey)
          .order("created_at", { ascending: false }),
        supabase
          .from("limpeza_turnos_edicoes" as never)
          .select("*")
          .eq("folha_dia_key", folhaDiaKey)
          .order("created_at", { ascending: false }),
      ]);
      if (ptpRes.error) throw ptpRes.error;
      if (limpRes.error) throw limpRes.error;

      setPtp(
        ((ptpRes.data ?? []) as unknown as PtpEdicaoRow[]).map((r) => ({
          id: r.id,
          ptpJanelaId: r.ptp_janela_id,
          janelaCodigo: r.janela_codigo,
          editadoEm: r.created_at,
          editadoPorNome: r.editado_por_nome,
          editadoPorLogin: r.editado_por_login,
          motivoEdicao: r.motivo_edicao,
          antesJson: r.antes_json,
          depoisJson: r.depois_json,
        })),
      );
      setLimpeza(
        ((limpRes.data ?? []) as unknown as LimpEdicaoRow[]).map((r) => ({
          id: r.id,
          limpezaTurnoId: r.limpeza_turno_id,
          turno: r.turno,
          editadoEm: r.created_at,
          editadoPorNome: r.editado_por_nome,
          editadoPorLogin: r.editado_por_login,
          motivoEdicao: r.motivo_edicao,
          antesJson: r.antes_json,
          depoisJson: r.depois_json,
        })),
      );
    } catch (e) {
      console.error("[useEdicoesVerso] erro:", e);
      setError("Erro ao carregar histórico de edições do verso.");
    } finally {
      setLoading(false);
    }
  }, [folhaDiaKey, opts.enabled]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ptp, limpeza, loading, error, refetch };
}
