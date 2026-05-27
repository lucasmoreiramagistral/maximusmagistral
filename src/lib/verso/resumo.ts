import type { LimpezaTurno, LimpezaTurnoStatus, PtpJanela } from "./types";
import { PTP_JANELAS } from "./constants";
import { janelasPtpDoTurnoEquipe } from "@/lib/operacao/escalas";
import type { Equipe, Turno } from "@/lib/checklist/types";

/**
 * Saúde do verso do dia — visão de gestão (read-only).
 *
 * Quando `escopo: { turno, equipe }` é informado, o resumo é restrito às
 * janelas/limpeza daquele turno (ex.: card do 12x36 Dia ignora janelas e
 * limpeza da Noite).
 */
export type SaudeVerso = "completo" | "atencao" | "parcial" | "nao_iniciado";

export interface ResumoVersoPtp {
  registradas: number;
  finalizadas: number;
  comOcorrencia: number;
  semOcorrencia: number;
  naoRodou: number;
  rascunho: number;
  pendente: number;
  naoPreenchidas: number;
  codigosFaltantes: string[];
  comAssinaturaCorrupta: number;
  /** Tamanho do escopo do PTP (ex.: 6 num turno 12x36, 12 sem escopo). */
  totalJanelasTurno: number;
}

export interface ResumoVersoLimpeza {
  dia: LimpezaTurnoStatus | null;
  noite: LimpezaTurnoStatus | null;
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
  /** Escopo opcional: restringe o cálculo às janelas/limpeza do turno. */
  escopo?: { turno: Turno; equipe: Equipe };
}): ResumoVerso {
  const { janelas: janelasInput, turnos: turnosInput, escopo } = input;

  // ─── Escopo por turno ───
  const codigosDoTurno = escopo
    ? janelasPtpDoTurnoEquipe(escopo.turno, escopo.equipe)
    : PTP_JANELAS.map((d) => d.codigo);
  const totalJanelasTurno = codigosDoTurno.length || PTP_JANELAS.length;
  const codigosSet = new Set(codigosDoTurno);

  const janelas = escopo
    ? janelasInput.filter((j) => codigosSet.has(j.janelaCodigo))
    : janelasInput;
  const turnos = escopo
    ? turnosInput.filter((t) => t.turno === escopo.turno)
    : turnosInput;

  // ─── PTP ───
  let comOcorrencia = 0;
  let semOcorrencia = 0;
  let naoRodou = 0;
  let rascunho = 0;
  let pendente = 0;
  let finalizadas = 0;
  let comAssinaturaCorrupta = 0;
  const codigosRegistrados = new Set<string>();
  for (const j of janelas) {
    codigosRegistrados.add(j.janelaCodigo);
    const ehFinal = STATUS_FINAL_PTP.has(j.statusJanela);
    if (ehFinal) finalizadas++;
    if (ehFinal && !j.assinaturaOperador) comAssinaturaCorrupta++;
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
  const codigosFaltantes = codigosDoTurno.filter(
    (c) => !codigosRegistrados.has(c),
  );
  const naoPreenchidas = codigosFaltantes.length;

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
  const temAtencao =
    comOcorrencia > 0 ||
    itensNaoRealizados > 0 ||
    comAssinaturaCorrupta > 0;

  const limpezaCompleta = escopo
    ? escopo.turno === "12x36 Dia"
      ? dia === "validado"
      : escopo.turno === "12x36 Noite"
        ? noite === "validado"
        : dia === "validado" && noite === "validado"
    : dia === "validado" && noite === "validado";

  const completo =
    finalizadas === totalJanelasTurno &&
    limpezaCompleta &&
    itensNaoRealizados === 0 &&
    comAssinaturaCorrupta === 0;

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
      naoPreenchidas,
      codigosFaltantes,
      comAssinaturaCorrupta,
      totalJanelasTurno,
    },
    limpeza: {
      dia,
      noite,
      itensNaoRealizados,
    },
    saude,
  };
}
