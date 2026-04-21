import type { Equipe, Turno } from "@/lib/checklist/types";

/**
 * Calcula a "data operacional" considerando a regra de madrugada:
 * - se o turno/equipe é noturno e ainda não passou das 06:10 da manhã (Manaus),
 *   a data ainda pertence ao dia anterior (a folha aberta na noite continua "viva").
 *
 * IMPORTANTE: mantém a assinatura recebendo TANTO equipe quanto turno —
 * ambos são necessários para a regra (algumas equipes são fixas no noturno).
 *
 * Esta lógica vivia em src/routes/operador.contexto.tsx; foi extraída para
 * ser reutilizada também no Verso da Folha (PTP + Limpeza).
 */
export function calcularDataOperacional(
  equipe: Equipe | null | undefined,
  turno: Turno | null | undefined,
): string {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const manaus = new Date(utcMs - 4 * 60 * 60_000);

  const horaMin = manaus.getUTCHours() * 60 + manaus.getUTCMinutes();
  const ehNoite =
    equipe === "Valderlan" ||
    equipe === "Bruno" ||
    turno === "12x36 Noite";

  if (ehNoite && horaMin < 6 * 60 + 10) {
    manaus.setUTCDate(manaus.getUTCDate() - 1);
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
