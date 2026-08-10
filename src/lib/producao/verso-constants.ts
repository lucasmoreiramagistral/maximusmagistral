import type { Turno } from "@/lib/checklist/types";
import type { PassagemBloco } from "./verso-types";

/** O formulário em papel tem 18 linhas de tanque de xarope. */
export const TANQUES_TOTAL = 18;

export const TANQUES_ORDENS: number[] = Array.from(
  { length: TANQUES_TOTAL },
  (_, i) => i + 1,
);

export const PASSAGEM_BLOCOS: { codigo: PassagemBloco; rotulo: string }[] = [
  { codigo: "1T", rotulo: "1º Turno" },
  { codigo: "2T", rotulo: "2º Turno" },
  { codigo: "3T", rotulo: "3º Turno" },
];

/** Bloco sugerido a partir do turno ativo do operador. */
export function blocoDoTurno(turno: Turno | null | undefined): PassagemBloco {
  switch (turno) {
    case "2º Turno":
      return "2T";
    case "3º Turno":
    case "12x36 Noite":
      return "3T";
    default:
      return "1T";
  }
}
