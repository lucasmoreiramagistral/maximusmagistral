import type { FolhaChecklistDia } from "@/lib/checklist/types";
import { buildFolhaDiaKey } from "@/lib/operacao/data-operacional";
import { maquinaPorNome } from "@/lib/maquinas/catalogo";

/**
 * Todas as quatro máquinas têm PTP no verso do checklist. A limpeza só se
 * aplica às enchedoras e é tratada separadamente no resumo.
 */
export function temVerso(folha: FolhaChecklistDia): boolean {
  const maquina = maquinaPorNome(folha.contexto.maquina);
  return !!maquina && maquina.linha === folha.contexto.linha && maquina.formularios.ptp;
}

/**
 * Extrai a lista deduplicada de `folhaDiaKey` para todas as folhas que
 * possuem verso. Usada pelo hook batch da gestão pra fazer 2 queries
 * totais (PTP + Limpeza) com `.in("folha_dia_key", [...])`.
 *
 * Importante: várias `folhaKey` (uma por turno) compartilham o mesmo
 * `folhaDiaKey` — o `Set` garante dedup correta.
 */
export function extrairFolhasDiaKeysComVerso(
  folhas: FolhaChecklistDia[],
): string[] {
  const set = new Set<string>();
  for (const f of folhas) {
    if (!temVerso(f)) continue;
    set.add(
      buildFolhaDiaKey(f.contexto.data, f.contexto.linha, f.contexto.maquina),
    );
  }
  return [...set];
}
