import type { Checklist, Equipe, Turno } from "@/lib/checklist/types";
import type { MaquinaOperacional } from "@/lib/maquinas/catalogo";

/** A validação aberta no tablet pertence à máquina vinculada ao operador. */
export function checklistPosSetupParaValidar(
  checklists: readonly Checklist[],
  ativo: { data: string; turno: Turno | null; equipe: Equipe | null },
  maquina: MaquinaOperacional,
): Checklist | null {
  if (!ativo.turno || !ativo.equipe) return null;
  return (
    checklists.find(
      (c) =>
        c.contexto.data === ativo.data &&
        c.contexto.turno === ativo.turno &&
        c.contexto.equipe === ativo.equipe &&
        c.contexto.linha === maquina.linha &&
        c.contexto.maquina === maquina.nome &&
        c.momento === "Pós-setup" &&
        c.status === "concluido",
    ) ?? null
  );
}
