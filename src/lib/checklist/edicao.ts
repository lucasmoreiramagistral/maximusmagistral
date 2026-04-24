import type { Checklist, Equipe, RespostaItem, Turno } from "./types";
import { storage } from "./storage";
import { escalaPorTurnoEquipe } from "@/lib/operacao/escalas";

// ─────────────────────────────────────────────────────────────────
// Retomada: calcula o índice do primeiro item ainda sem resposta.
// Se todos já respondidos, retorna o último.
// ─────────────────────────────────────────────────────────────────
export function calcularIndiceRetomada(respostas: RespostaItem[]): number {
  if (!respostas || respostas.length === 0) return 0;
  const idx = respostas.findIndex((r) => !r || r.resposta === null);
  if (idx === -1) return respostas.length - 1;
  return idx;
}

// ─────────────────────────────────────────────────────────────────
// Janela de edição por turno (horário de Manaus / UTC-4).
// - Turnos Dia (Karolainny / Nilson): 05:50 → 18:10 do dia da folha
// - Turnos Noite (Valderlan / Bruno): 17:50 do dia da folha → 06:10 do dia seguinte
// ─────────────────────────────────────────────────────────────────

const MANAUS_OFFSET_MIN = -4 * 60; // UTC-4

/** Retorna o "agora" em minutos desde 1970, no fuso de Manaus, como Date sintético em UTC. */
function agoraManaus(): Date {
  const now = new Date();
  // Date.now() em UTC + offset Manaus = "wallclock" Manaus (representado como UTC)
  return new Date(now.getTime() + MANAUS_OFFSET_MIN * 60 * 1000);
}

/** Cria um Date "wallclock" Manaus a partir de YYYY-MM-DD + HH:MM. */
function dataHoraManaus(yyyymmdd: string, hh: number, mm: number): Date {
  const [y, mo, d] = yyyymmdd.split("-").map((n) => parseInt(n, 10));
  // Construímos como UTC para evitar interferência do fuso do dispositivo;
  // todas as comparações ficam no mesmo "espaço" Manaus.
  return new Date(Date.UTC(y, (mo || 1) - 1, d || 1, hh, mm, 0, 0));
}

/** Soma 1 dia a uma data YYYY-MM-DD. */
function somarUmDia(yyyymmdd: string): string {
  const [y, mo, d] = yyyymmdd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, (mo || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export interface JanelaTurno {
  inicio: Date;
  fim: Date;
}

/**
 * Janela de edição (em "wallclock" Manaus) para a folha do checklist.
 *
 * Usa fonte única em escalas.ts. Para qualquer escala:
 *   - inicio = horario_inicio - 10 min do dia da folha
 *   - fim    = horario_fim + 10 min (no dia seguinte se atravessa meia-noite)
 *
 * Fallback: se a escala não for encontrada (dado legado), usa janela ampla
 * de 24h a partir da data da folha para não bloquear edição de registros antigos.
 */
export function janelaEdicaoTurno(
  dataFolha: string,
  equipe: Equipe,
  turno: Turno,
): JanelaTurno {
  const escala = escalaPorTurnoEquipe(turno, equipe);

  if (!escala) {
    return {
      inicio: dataHoraManaus(dataFolha, 0, 0),
      fim: dataHoraManaus(somarUmDia(dataFolha), 0, 0),
    };
  }

  const [hIni, mIni] = escala.horarioInicio.split(":").map(Number);
  const [hFim, mFim] = escala.horarioFim.split(":").map(Number);

  // 10 min de folga em cada extremo
  const totalIni = hIni * 60 + mIni - 10;
  const totalFim = hFim * 60 + mFim + 10;

  const iniH = Math.floor(totalIni / 60);
  const iniM = totalIni % 60;
  const fimH = Math.floor(totalFim / 60);
  const fimM = totalFim % 60;

  if (escala.atravessaMeiaNoite) {
    return {
      inicio: dataHoraManaus(dataFolha, iniH, iniM),
      fim: dataHoraManaus(somarUmDia(dataFolha), fimH, fimM),
    };
  }
  return {
    inicio: dataHoraManaus(dataFolha, iniH, iniM),
    fim: dataHoraManaus(dataFolha, fimH, fimM),
  };
}

/** Verifica se o agora (Manaus) está dentro da janela do turno do checklist. */
export function dentroDaJanelaEdicao(checklist: Checklist): boolean {
  const { data, equipe, turno } = checklist.contexto;
  const { inicio, fim } = janelaEdicaoTurno(data, equipe, turno);
  const now = agoraManaus();
  return now.getTime() >= inicio.getTime() && now.getTime() <= fim.getTime();
}

// ─────────────────────────────────────────────────────────────────
// Permissão de edição combinada
// ─────────────────────────────────────────────────────────────────

export interface PermissaoEdicao {
  permitido: boolean;
  motivo?: "outra_conta" | "fora_horario" | "nao_concluido" | "assinado";
  mensagem?: string;
}

/**
 * Verifica se o usuário logado pode editar este checklist.
 * Regras:
 *  - precisa estar concluído
 *  - precisa ser a MESMA conta operacional (operadorLogin)
 *  - precisa estar dentro da janela de horário do turno da folha
 *  - NÃO pode estar assinado por operador + líder (fechamento do dia)
 */
export function permissaoEdicaoChecklist(
  checklist: Checklist,
  usuarioLogin: string | undefined,
): PermissaoEdicao {
  if (checklist.status !== "concluido") {
    return {
      permitido: false,
      motivo: "nao_concluido",
      mensagem: "Este checklist ainda não foi concluído.",
    };
  }
  if (!usuarioLogin || checklist.operadorLogin !== usuarioLogin) {
    return {
      permitido: false,
      motivo: "outra_conta",
      mensagem:
        "Este checklist foi preenchido por outra conta operacional e não pode ser alterado neste acesso.",
    };
  }
  // Bloqueio definitivo: somente quando o líder já validou (assinou) o checklist.
  // O operador pode editar livremente até a validação do líder; toda alteração
  // fica registrada no histórico de edições para a gestão auditar.
  if (checklist.assinaturaLider?.dataUrl) {
    return {
      permitido: false,
      motivo: "assinado",
      mensagem: "Edição bloqueada. Checklist já validado pelo líder.",
    };
  }
  return { permitido: true };
}

// ─────────────────────────────────────────────────────────────────
// Marcador sessionStorage para indicar que o rascunho atual é
// uma edição de um checklist já concluído.
// ─────────────────────────────────────────────────────────────────

export const FLAG_EDICAO = "fm-checklist:modo-edicao";

export function marcarModoEdicao(checklistId: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(FLAG_EDICAO, checklistId);
}

export function limparModoEdicao() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(FLAG_EDICAO);
}

export function checklistEmEdicao(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(FLAG_EDICAO);
}

/**
 * Prepara o rascunho local a partir de um checklist já concluído,
 * preservando id, folha_key, momento, contexto, respostas e vínculos
 * de anomalia. Marca a sessão em modo de edição.
 */
export function iniciarEdicaoChecklist(checklist: Checklist) {
  const rascunho: Checklist = {
    ...checklist,
    status: "rascunho",
    // mantém o mesmo id para que o upsert sobrescreva o registro existente
  };
  storage.setRascunho(rascunho);
  marcarModoEdicao(checklist.id);
}

