/**
 * Fonte ÚNICA de escalas operacionais.
 *
 * Toda inferência de turno/equipe/janela PTP/coluna Excel deve sair daqui.
 * Não duplicar literais de turno/equipe em outros arquivos.
 *
 * As 8 escalas são fixas e cobrem 3 regimes:
 *   - 12x36          (4 equipes nominais: Karolainny, Valderlan, Nilson, Bruno)
 *   - Administrativo (Comercial — segunda a sexta)
 *   - Turnos fixos   (1º, 2º, 3º — equipe = nome do turno)
 *
 * Regras invariáveis:
 *   - Coluna posicional do Excel (frente/limpeza) é PROPRIEDADE DO TURNO.
 *   - Janelas PTP são derivadas por SOBREPOSIÇÃO de horário (J01..J12).
 *     Janela parcial conta. Não inferir escala apenas pela janela: o contexto
 *     ativo do operador/folha sempre manda.
 */

import type { Equipe, Turno } from "@/lib/checklist/types";

export type GrupoEscala = "12x36" | "Administrativo" | "Turno fixo";
export type RegimeEscala = "12x36" | "Comercial" | "Turno fixo";

export interface Escala {
  /** Identificador estável (snake_case). */
  id: string;
  grupo: GrupoEscala;
  regime: RegimeEscala;
  /** Rótulo curto exibido em cards/selects. */
  label: string;
  turno: Turno;
  equipe: Equipe;
  /** "HH:MM" hora local Manaus. */
  horarioInicio: string;
  /** "HH:MM" hora local Manaus. */
  horarioFim: string;
  /** True quando o turno cruza a meia-noite (regra de data operacional). */
  atravessaMeiaNoite: boolean;
  /** Coluna posicional no Excel da frente/limpeza (1, 2 ou 3). */
  colunaPosicional: 1 | 2 | 3;
}

// ---------- DEFINIÇÃO DAS 8 ESCALAS ----------
export const ESCALAS: ReadonlyArray<Escala> = [
  // 12x36 — coluna posicional 1 (Dia) / 2 (Noite)
  {
    id: "karolainny_12x36_dia",
    grupo: "12x36",
    regime: "12x36",
    label: "Karolainny · 12x36 Dia",
    turno: "12x36 Dia",
    equipe: "Karolainny",
    horarioInicio: "06:00",
    horarioFim: "18:00",
    atravessaMeiaNoite: false,
    colunaPosicional: 1,
  },
  {
    id: "nilson_12x36_dia",
    grupo: "12x36",
    regime: "12x36",
    label: "Nilson · 12x36 Dia",
    turno: "12x36 Dia",
    equipe: "Nilson",
    horarioInicio: "06:00",
    horarioFim: "18:00",
    atravessaMeiaNoite: false,
    colunaPosicional: 1,
  },
  {
    id: "valderlan_12x36_noite",
    grupo: "12x36",
    regime: "12x36",
    label: "Valderlan · 12x36 Noite",
    turno: "12x36 Noite",
    equipe: "Valderlan",
    horarioInicio: "18:00",
    horarioFim: "06:00",
    atravessaMeiaNoite: true,
    colunaPosicional: 2,
  },
  {
    id: "bruno_12x36_noite",
    grupo: "12x36",
    regime: "12x36",
    label: "Bruno · 12x36 Noite",
    turno: "12x36 Noite",
    equipe: "Bruno",
    horarioInicio: "18:00",
    horarioFim: "06:00",
    atravessaMeiaNoite: true,
    colunaPosicional: 2,
  },

  // Administrativo (Comercial) — coluna posicional 1
  {
    id: "comercial",
    grupo: "Administrativo",
    regime: "Comercial",
    label: "Comercial · 07:00–16:00",
    turno: "Comercial",
    equipe: "Comercial",
    horarioInicio: "07:00",
    horarioFim: "16:00",
    atravessaMeiaNoite: false,
    colunaPosicional: 1,
  },

  // Turnos fixos
  {
    id: "primeiro_turno",
    grupo: "Turno fixo",
    regime: "Turno fixo",
    label: "1º Turno · 06:00–14:20",
    turno: "1º Turno",
    equipe: "1º Turno",
    horarioInicio: "06:00",
    horarioFim: "14:20",
    atravessaMeiaNoite: false,
    colunaPosicional: 1,
  },
  {
    id: "segundo_turno",
    grupo: "Turno fixo",
    regime: "Turno fixo",
    label: "2º Turno · 14:20–22:40",
    turno: "2º Turno",
    equipe: "2º Turno",
    horarioInicio: "14:20",
    horarioFim: "22:40",
    atravessaMeiaNoite: false,
    colunaPosicional: 2,
  },
  {
    id: "terceiro_turno",
    grupo: "Turno fixo",
    regime: "Turno fixo",
    label: "3º Turno · 22:40–06:00",
    turno: "3º Turno",
    equipe: "3º Turno",
    horarioInicio: "22:40",
    horarioFim: "06:00",
    atravessaMeiaNoite: true,
    colunaPosicional: 3,
  },
];

/** Escalas agrupadas para UI (selects/cards agrupados). */
export const ESCALAS_AGRUPADAS: ReadonlyArray<{
  grupo: GrupoEscala;
  escalas: ReadonlyArray<Escala>;
}> = [
  { grupo: "12x36", escalas: ESCALAS.filter((e) => e.grupo === "12x36") },
  { grupo: "Administrativo", escalas: ESCALAS.filter((e) => e.grupo === "Administrativo") },
  { grupo: "Turno fixo", escalas: ESCALAS.filter((e) => e.grupo === "Turno fixo") },
];

// ---------- HELPERS ----------

/**
 * Localiza a escala pela combinação turno+equipe.
 *
 * Tem FALLBACK de legado: para registros antigos com equipe "A"/"B"/etc
 * ou sem combinação válida, mapeia pelo NOME DO TURNO. Isso evita que
 * relatórios/exportações quebrem com dados pré-migration.
 */
export function escalaPorTurnoEquipe(
  turno: Turno | null | undefined,
  equipe: Equipe | null | undefined,
): Escala | null {
  if (!turno) return null;

  // 1) match exato turno+equipe
  if (equipe) {
    const exata = ESCALAS.find((e) => e.turno === turno && e.equipe === equipe);
    if (exata) return exata;
  }

  // 2) fallback de legado: mapeia pelo nome do turno
  switch (turno) {
    case "Comercial":
      return ESCALAS.find((e) => e.id === "comercial") ?? null;
    case "1º Turno":
      return ESCALAS.find((e) => e.id === "primeiro_turno") ?? null;
    case "2º Turno":
      return ESCALAS.find((e) => e.id === "segundo_turno") ?? null;
    case "3º Turno":
      return ESCALAS.find((e) => e.id === "terceiro_turno") ?? null;
    case "12x36 Dia":
      // sem equipe nominal → pega a primeira escala 12x36 Dia (Karolainny)
      return ESCALAS.find((e) => e.turno === "12x36 Dia") ?? null;
    case "12x36 Noite":
      return ESCALAS.find((e) => e.turno === "12x36 Noite") ?? null;
    default:
      return null;
  }
}

/**
 * Deriva a escala "habitual" do usuário a partir do par equipe/turno padrão.
 * Usado para pré-seleção no cadastro e na escolha do dia.
 */
export function derivarEscalaHabitual(
  equipePadrao: Equipe | null | undefined,
  turnoPadrao: Turno | null | undefined,
): Escala | null {
  return escalaPorTurnoEquipe(turnoPadrao, equipePadrao);
}

/**
 * Coluna posicional no Excel da FRENTE e da LIMPEZA (1, 2 ou 3).
 * NÃO confundir com janelas PTP — essas são por horário real.
 */
export function colunaPosicionalDoTurno(turno: Turno | null | undefined): 1 | 2 | 3 | null {
  if (!turno) return null;
  // Pega qualquer escala com esse turno (todas têm a mesma coluna posicional).
  const escala = ESCALAS.find((e) => e.turno === turno);
  return escala?.colunaPosicional ?? null;
}

// ---------- JANELAS PTP (J01..J12) ----------

/**
 * As 12 janelas oficiais do PTP, em hora local Manaus.
 * J01..J06 cobrem o "dia" (06:00–18:00).
 * J07..J12 cobrem a "noite" (18:00–06:00).
 *
 * Janelas que cruzam meia-noite (J12) têm `atravessa: true`.
 */
export interface JanelaPTP {
  codigo: string; // "J01".."J12"
  inicio: string; // "HH:MM"
  fim: string; // "HH:MM"
  atravessa: boolean;
}

export const JANELAS_PTP: ReadonlyArray<JanelaPTP> = [
  { codigo: "J01", inicio: "06:00", fim: "08:00", atravessa: false },
  { codigo: "J02", inicio: "08:00", fim: "10:00", atravessa: false },
  { codigo: "J03", inicio: "10:00", fim: "12:00", atravessa: false },
  { codigo: "J04", inicio: "12:00", fim: "14:00", atravessa: false },
  { codigo: "J05", inicio: "14:00", fim: "16:00", atravessa: false },
  { codigo: "J06", inicio: "16:00", fim: "18:00", atravessa: false },
  { codigo: "J07", inicio: "18:00", fim: "20:00", atravessa: false },
  { codigo: "J08", inicio: "20:00", fim: "22:00", atravessa: false },
  { codigo: "J09", inicio: "22:00", fim: "00:00", atravessa: false },
  { codigo: "J10", inicio: "00:00", fim: "02:00", atravessa: false },
  { codigo: "J11", inicio: "02:00", fim: "04:00", atravessa: false },
  { codigo: "J12", inicio: "04:00", fim: "06:00", atravessa: false },
];

function hhmmParaMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Retorna true se [aIni, aFim) sobrepõe [bIni, bFim) em uma timeline circular
 * de 24h (suporta intervalos que cruzam meia-noite).
 *
 * Estratégia: expande cada intervalo para a forma "linear" e testa sobreposição.
 */
function intervalosSobreposicao(
  aIni: number,
  aFim: number,
  aAtravessa: boolean,
  bIni: number,
  bFim: number,
  bAtravessa: boolean,
): boolean {
  const expande = (ini: number, fim: number, atravessa: boolean): Array<[number, number]> => {
    if (!atravessa) return [[ini, fim]];
    return [
      [ini, 24 * 60],
      [0, fim],
    ];
  };

  const segsA = expande(aIni, aFim, aAtravessa);
  const segsB = expande(bIni, bFim, bAtravessa);

  for (const [ai, af] of segsA) {
    for (const [bi, bf] of segsB) {
      if (ai < bf && bi < af) return true;
    }
  }
  return false;
}

/**
 * Lista as janelas PTP que SOBREPÕEM o horário de uma escala.
 * Janela parcial conta (ex: 2º Turno 14:20–22:40 cobre J05..J08, sendo J05 parcial).
 *
 * Distribuição esperada:
 *   12x36 Dia    (06:00–18:00)  → J01..J06
 *   12x36 Noite  (18:00–06:00)  → J07..J12
 *   Comercial    (07:00–16:00)  → J01..J05  (J01 parcial)
 *   1º Turno     (06:00–14:20)  → J01..J04  (J04 parcial)
 *   2º Turno     (14:20–22:40)  → J05..J08  (J05 parcial)
 *   3º Turno     (22:40–06:00)  → J09..J12  (J09 parcial)
 */
export function janelasPtpDaEscala(escala: Escala | null | undefined): string[] {
  if (!escala) return [];
  const eIni = hhmmParaMinutos(escala.horarioInicio);
  const eFim = hhmmParaMinutos(escala.horarioFim);

  return JANELAS_PTP.filter((j) => {
    const jIni = hhmmParaMinutos(j.inicio);
    const jFim = hhmmParaMinutos(j.fim === "00:00" ? "24:00" : j.fim);
    return intervalosSobreposicao(
      eIni,
      eFim,
      escala.atravessaMeiaNoite,
      jIni,
      jFim,
      j.atravessa,
    );
  }).map((j) => j.codigo);
}

/**
 * Conveniência: lista as janelas PTP a partir de turno+equipe.
 * Aplica o mesmo fallback de legado de `escalaPorTurnoEquipe`.
 */
export function janelasPtpDoTurnoEquipe(
  turno: Turno | null | undefined,
  equipe: Equipe | null | undefined,
): string[] {
  return janelasPtpDaEscala(escalaPorTurnoEquipe(turno, equipe));
}
