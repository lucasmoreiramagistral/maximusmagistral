import type { Checklist } from "@/lib/checklist/types";
import type { LimpezaTurno, PtpJanela } from "@/lib/verso/types";

/**
 * Primeiro registro concluído da máquina. É o limite observável do histórico,
 * não a data oficial de implantação nem uma prova de produção nos dias anteriores.
 */
export function inicioCoberturaObservada(
  maquina: string,
  checklists: readonly Checklist[],
  limpezas: readonly LimpezaTurno[],
  ptp: readonly PtpJanela[],
): string | null {
  const datas = [
    ...checklists
      .filter((c) => c.contexto.maquina === maquina && c.status === "concluido")
      .map((c) => c.contexto.data),
    ...limpezas
      .filter(
        (l) =>
          l.maquina === maquina &&
          l.status !== "pendente" &&
          l.status !== "rascunho",
      )
      .map((l) => l.dataOperacao),
    ...ptp
      .filter(
        (p) =>
          p.maquina === maquina &&
          (p.statusJanela === "sem_ocorrencia" || p.statusJanela === "houve_ocorrencia"),
      )
      .map((p) => p.dataOperacao),
  ];
  return datas.length > 0 ? datas.reduce((menor, data) => (data < menor ? data : menor)) : null;
}
