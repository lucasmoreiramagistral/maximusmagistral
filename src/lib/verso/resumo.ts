import type { LimpezaTurno, LimpezaTurnoStatus, PtpJanela } from "./types";

/**
 * Saúde do verso do dia — visão de gestão (read-only).
 *
 * IMPORTANTE: o cálculo é baseado **só no campo `status`** dos registros
 * que vieram do banco. NÃO infla com defaults (12 janelas pendentes), pois
 * isso enganaria o gestor mostrando "12 pendentes" quando na verdade o
 * operador nem começou.
 */
export type SaudeVerso = "completo" | "atencao" | "parcial" | "nao_iniciado";

export interface ResumoVersoPtp {
  /** Quantas janelas têm registro no banco (0..12). */
  registradas: number;
  /** Janelas em status final (sem_ocorrencia | houve_ocorrencia | nao_rodou). */
  finalizadas: number;
  comOcorrencia: number;
  semOcorrencia: number;
  naoRodou: number;
  rascunho: number;
  pendente: number;
}

export interface ResumoVersoLimpeza {
  /** `null` = sem registro no banco para o turno. */
  dia: LimpezaTurnoStatus | null;
  noite: LimpezaTurnoStatus | null;
  /** Soma de itens marcados como `nao_realizado` em qualquer turno registrado. */
  itensNaoRealizados: number;
}

export interface ResumoVerso {
  ptp: ResumoVersoPtp;
  limpeza: ResumoVersoLimpeza;
  saude: SaudeVerso;
}

const STATUS_FINAL_PTP = new Set([
  "sem_ocorrencia",
  "houve_ocorrencia",
  "nao_rodou",
]);

export function calcularResumoVerso(input: {
  janelas: PtpJanela[];
  turnos: LimpezaTurno[];
}): ResumoVerso {
  const { janelas, turnos } = input;

  // ─── PTP ───
  let comOcorrencia = 0;
  let semOcorrencia = 0;
  let naoRodou = 0;
  let rascunho = 0;
  let pendente = 0;
  let finalizadas = 0;
  for (const j of janelas) {
    if (STATUS_FINAL_PTP.has(j.statusJanela)) finalizadas++;
    switch (j.statusJanela) {
      case "houve_ocorrencia":
        comOcorrencia++;
        break;
      case "sem_ocorrencia":
        semOcorrencia++;
        break;
      case "nao_rodou":
        naoRodou++;
        break;
      case "rascunho":
        rascunho++;
        break;
      case "pendente":
        pendente++;
        break;
    }
  }

  // ─── Limpeza ───
  let itensNaoRealizados = 0;
  let dia: LimpezaTurnoStatus | null = null;
  let noite: LimpezaTurnoStatus | null = null;
  for (const t of turnos) {
    if (t.turno === "12x36 Dia") dia = t.status;
    if (t.turno === "12x36 Noite") noite = t.status;
    for (const item of t.itens) {
      if (item.status === "nao_realizado") itensNaoRealizados++;
    }
  }

  // ─── Saúde ───
  const semDados = janelas.length === 0 && turnos.length === 0;
  const temAtencao = comOcorrencia > 0 || itensNaoRealizados > 0;
  const completo =
    finalizadas === 12 &&
    dia === "validado" &&
    noite === "validado" &&
    itensNaoRealizados === 0;

  let saude: SaudeVerso;
  if (semDados) saude = "nao_iniciado";
  else if (temAtencao) saude = "atencao";
  else if (completo) saude = "completo";
  else saude = "parcial";

  return {
    ptp: {
      registradas: janelas.length,
      finalizadas,
      comOcorrencia,
      semOcorrencia,
      naoRodou,
      rascunho,
      pendente,
    },
    limpeza: {
      dia,
      noite,
      itensNaoRealizados,
    },
    saude,
  };
}
