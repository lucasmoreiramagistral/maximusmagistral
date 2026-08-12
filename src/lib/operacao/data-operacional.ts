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
  agora: Date = new Date(),
): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Manaus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? "";

  let dataManaus = `${parte("year")}-${parte("month")}-${parte("day")}`;
  const horaMin = Number(parte("hour")) * 60 + Number(parte("minute"));

  const escala = escalaPorTurnoEquipe(turno, equipe);

  if (escala?.atravessaMeiaNoite) {
    const [hFim, mFim] = escala.horarioFim.split(":").map(Number);
    const fimMin = hFim * 60 + mFim + 10; // folga de 10 min após o fim do turno

    if (horaMin < fimMin) {
      const anterior = new Date(`${dataManaus}T12:00:00Z`);
      anterior.setUTCDate(anterior.getUTCDate() - 1);
      dataManaus = anterior.toISOString().slice(0, 10);
    }
  }

  return dataManaus;
}

/**
 * Chave da folha do dia para o Verso (PTP + Limpeza).
 * NÃO usar a folha_key do checklist da frente: o verso tem sua própria chave.
 *
 * Formato: YYYY-MM-DD__Linha 3__Enchedora 3
 */
export function buildFolhaDiaKey(data: string, linha: string, maquina: string): string {
  return `${data}__${linha}__${maquina}`;
}

export function formatarDataBR(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
