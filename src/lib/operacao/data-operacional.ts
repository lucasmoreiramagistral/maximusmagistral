import type { Equipe, Turno } from "@/lib/checklist/types";
import { escalaPorTurnoEquipe } from "./escalas";

/**
 * Calcula a "data operacional" considerando a regra de madrugada.
 *
 * Regra unificada (sem comparação por nome de equipe):
 *   - Se a escala atravessa a meia-noite E o relógio Manaus ainda não passou
 *     do horário de fim do turno (com folga de 10 min), a data ainda pertence
 *     ao dia anterior — a folha aberta na noite continua "viva".
 *   - Caso contrário, é a data de hoje em Manaus.
 *
 * Usa fonte única em escalas.ts. NÃO comparar equipe por literal aqui.
 */
export function calcularDataOperacional(
  equipe: Equipe | null | undefined,
  turno: Turno | null | undefined,
): string {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const manaus = new Date(utcMs - 4 * 60 * 60_000);

  const escala = escalaPorTurnoEquipe(turno, equipe);

  if (escala?.atravessaMeiaNoite) {
    const horaMin = manaus.getUTCHours() * 60 + manaus.getUTCMinutes();
    const [hFim, mFim] = escala.horarioFim.split(":").map(Number);
    const fimMin = hFim * 60 + mFim + 10; // folga de 10 min após o fim do turno

    if (horaMin < fimMin) {
      manaus.setUTCDate(manaus.getUTCDate() - 1);
    }
  }

  const y = manaus.getUTCFullYear();
  const m = String(manaus.getUTCMonth() + 1).padStart(2, "0");
  const d = String(manaus.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Chave da folha do dia para o Verso (PTP + Limpeza).
 * NÃO usar a folha_key do checklist da frente: o verso tem sua própria chave.
 *
 * Formato: YYYY-MM-DD__Linha 3__Enchedora 3
 */
export function buildFolhaDiaKey(
  data: string,
  linha: string,
  maquina: string,
): string {
  return `${data}__${linha}__${maquina}`;
}

export function formatarDataBR(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
