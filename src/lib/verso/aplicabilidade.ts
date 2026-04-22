import type { FolhaChecklistDia } from "@/lib/checklist/types";
import { buildFolhaDiaKey } from "@/lib/operacao/data-operacional";
import { VERSO_CONTEXTO_FIXO } from "./constants";

/**
 * O verso da folha (PTP + Limpeza Sala de Envase) só existe na Linha 3 /
 * Enchedora 3 (Zegla 50V). Todas as demais linhas/máquinas não têm verso —
 * a UI de gestão precisa pular badges e ignorar filtros de verso pra elas.
 */
export function temVerso(folha: FolhaChecklistDia): boolean {
  return (
    folha.contexto.linha === VERSO_CONTEXTO_FIXO.linha &&
    folha.contexto.maquina === VERSO_CONTEXTO_FIXO.maquina
  );
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
