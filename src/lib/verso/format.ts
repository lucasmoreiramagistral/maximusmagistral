import type { PtpItem, PtpJanelaStatus } from "./types";

/**
 * Deriva o status de uma janela do PTP a partir dos itens e do flag "não rodou".
 * Regra:
 *  - naoRodou=true → "nao_rodou"
 *  - todos zerados → "sem_ocorrencia"
 *  - algum >0 → "houve_ocorrencia"
 */
export function deriveStatusJanela(
  itens: PtpItem[],
  naoRodou: boolean,
): PtpJanelaStatus {
  if (naoRodou) return "nao_rodou";
  const somatorio = itens.reduce((acc, i) => acc + (i.quantidade || 0), 0);
  return somatorio > 0 ? "houve_ocorrencia" : "sem_ocorrencia";
}

/** Aplica o status correto em cada item. */
export function recalcularStatusItens(itens: PtpItem[]): PtpItem[] {
  return itens.map((i) => ({
    ...i,
    status: i.quantidade > 0 ? "houve_ocorrencia" : "sem_ocorrencia",
  }));
}
