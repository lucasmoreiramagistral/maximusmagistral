import { HORA_X_HORA_FAIXAS } from "./constants";

/** Fim da faixa horária no relógio de Manaus (UTC−04), inclusive após meia-noite. */
export function fimDaHoraEpoch(dataOperacao: string, horaCodigo: string): number {
  const indice = HORA_X_HORA_FAIXAS.findIndex((faixa) => faixa.codigo === horaCodigo);
  if (indice < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dataOperacao)) {
    throw new Error("Data operacional ou hora inválida.");
  }
  const inicioDia = Date.parse(`${dataOperacao}T06:00:00-04:00`);
  if (Number.isNaN(inicioDia)) throw new Error("Data operacional inválida.");
  return inicioDia + (indice + 1) * 60 * 60 * 1000;
}

export function horaTerminou(
  dataOperacao: string,
  horaCodigo: string,
  agoraEpoch = Date.now(),
): boolean {
  return agoraEpoch >= fimDaHoraEpoch(dataOperacao, horaCodigo);
}
