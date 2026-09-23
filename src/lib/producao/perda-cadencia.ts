/**
 * Replica a conta do acompanhamento dos lideres: a diferenca entre a
 * cadencia da hora e a producao e convertida em minutos equivalentes.
 * Nao e uma medicao do tempo em que o equipamento ficou desligado.
 */
export function calcularPerdaCadenciaMin(
  cadenciaPorHora: number | null,
  produzido: number | null,
): number | null {
  if (
    cadenciaPorHora === null || produzido === null ||
    !Number.isSafeInteger(cadenciaPorHora) || cadenciaPorHora <= 0 ||
    !Number.isSafeInteger(produzido) || produzido < 0
  ) return null;
  return Math.max(0, Math.round(((cadenciaPorHora - produzido) * 60) / cadenciaPorHora));
}

export function rotuloTempoParada(
  metodo: string | null | undefined,
  minutos: number | null | undefined,
): string {
  if (metodo === "cadencia_equivalente") return "Perda equivalente";
  return minutos == null ? "Minutos" : "Parada informada";
}
