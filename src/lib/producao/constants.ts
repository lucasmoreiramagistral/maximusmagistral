import type { Turno } from "@/lib/checklist/types";
import { escalaPorTurnoEquipe, type Escala } from "@/lib/operacao/escalas";
import type { MotivoReinicio } from "./types";

// ─── Contexto fixo (mesmo equipamento do verso) ─────────────────────
export const PRODUCAO_CONTEXTO_FIXO = {
  linha: "Linha 3" as const,
  area: "Envase" as const,
  maquina: "Enchedora 3" as const,
  equipamento: "Enchedora Zegla 50V" as const,
};

export interface HoraDef {
  codigo: string; // H01..H24
  inicio: string; // "06:00"
  fim: string; // "07:00"
  rotulo: string; // "06:00 às 07:00"
}

function hh(n: number): string {
  return `${String(n % 24).padStart(2, "0")}:00`;
}

/**
 * As 24 faixas horárias do relatório, iniciando às 06:00 e fechando
 * às 06:00 do dia seguinte — exatamente como no formulário em papel.
 */
export const HORA_X_HORA_FAIXAS: HoraDef[] = Array.from({ length: 24 }, (_, i) => {
  const inicio = hh(6 + i);
  const fim = hh(7 + i);
  return {
    codigo: `H${String(i + 1).padStart(2, "0")}`,
    inicio,
    fim,
    rotulo: `${inicio} às ${fim}`,
  };
});

export const HORA_POR_CODIGO: Record<string, HoraDef> = Object.fromEntries(
  HORA_X_HORA_FAIXAS.map((h) => [h.codigo, h]),
);

// ─── Mapeamento hora → escala (mesma regra de sobreposição do PTP) ──
function hhmmParaMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function sobrepoe(
  aIni: number,
  aFim: number,
  aAtravessa: boolean,
  bIni: number,
  bFim: number,
): boolean {
  const expande = (ini: number, fim: number, atravessa: boolean): Array<[number, number]> =>
    atravessa
      ? [
          [ini, 24 * 60],
          [0, fim],
        ]
      : [[ini, fim]];
  for (const [ai, af] of expande(aIni, aFim, aAtravessa)) {
    for (const [bi, bf] of expande(bIni, bFim, false)) {
      if (ai < bf && bi < af) return true;
    }
  }
  return false;
}

/** Códigos de hora (H01..H24) que sobrepõem o horário de uma escala. */
export function horasDaEscala(escala: Escala | null | undefined): string[] {
  if (!escala) return [];
  const eIni = hhmmParaMinutos(escala.horarioInicio);
  const eFim = hhmmParaMinutos(escala.horarioFim);
  return HORA_X_HORA_FAIXAS.filter((f) => {
    const fIni = hhmmParaMinutos(f.inicio);
    const fFimRaw = hhmmParaMinutos(f.fim);
    // Faixa que cruza a meia-noite (23:00→00:00) vira 23:00→24:00.
    const fFim = fFimRaw <= fIni ? 24 * 60 : fFimRaw;
    return sobrepoe(eIni, eFim, escala.atravessaMeiaNoite, fIni, fFim);
  }).map((f) => f.codigo);
}

/** Conveniência: horas do turno+equipe (com fallback de legado). */
export function horasDoTurnoEquipe(
  turno: Turno | null | undefined,
  equipe?: string | null,
): string[] {
  const escala: Escala | null = escalaPorTurnoEquipe(turno, (equipe as never) ?? null);
  return horasDaEscala(escala);
}

// ─── Labels ─────────────────────────────────────────────────────────
export const LABEL_MOTIVO_REINICIO: Record<MotivoReinicio, string> = {
  troca_sabor: "Troca de sabor",
  troca_tamanho: "Troca de tamanho",
  cip: "CIP",
};

export const TAMANHOS_SUGERIDOS = ["300ml", "500ml", "1L", "1,5L", "2L", "2,5L"];

// ─── Checagens do líder ─────────────────────────────────────────────
/**
 * O formulário em papel prevê assinatura do líder "a cada checagem".
 * Na prática são 2 checagens por turno: meio e fim do turno.
 *  Dia   → H06 (11:00 às 12:00) e H12 (17:00 às 18:00)
 *  Noite → H18 (23:00 às 00:00) e H24 (05:00 às 06:00)
 */
export const HORAS_CHECAGEM_LIDER = ["H06", "H12", "H18", "H24"] as const;

export function ehHoraDeChecagemLider(codigo: string): boolean {
  return (HORAS_CHECAGEM_LIDER as readonly string[]).includes(codigo);
}

/** As 2 horas de checagem do líder dentro do turno informado. */
export function checagensLiderDoTurno(codigosDoTurno: string[]): string[] {
  return codigosDoTurno.filter(ehHoraDeChecagemLider);
}
