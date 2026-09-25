import type { ProducaoHora } from "./types";

function preenchida(hora: ProducaoHora): boolean {
  return Boolean(hora.finalizadoEm || hora.naoRodou || typeof hora.quantidade === "number");
}

/** Uma linha em branco criada por outro login não pode ser assumida pelo turno atual. */
export function mesclarHorasComPadrao(
  padrao: ProducaoHora[],
  remotas: ProducaoHora[],
  operadorUserId: string | null | undefined,
): ProducaoHora[] {
  const prioridade = (hora: ProducaoHora) =>
    hora.finalizadoEm ? 3 : preenchida(hora) ? 2 : 1;
  const ordenadas = [...remotas].sort(
    (a, b) => prioridade(b) - prioridade(a) ||
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );
  return padrao.map((linha) =>
    ordenadas.find((hora) =>
      hora.horaCodigo === linha.horaCodigo &&
      (preenchida(hora) || (operadorUserId && hora.operadorUserId === operadorUserId)),
    ) ?? linha,
  );
}
