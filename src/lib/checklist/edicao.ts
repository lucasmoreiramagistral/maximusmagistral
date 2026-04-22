import type { Checklist, Equipe, RespostaItem, Turno } from "./types";
import { storage } from "./storage";

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

/** Determina se a equipe é de turno noturno (atravessa meia-noite). */
function ehTurnoNoite(equipe: Equipe, turno: Turno): boolean {
  if (equipe === "Valderlan" || equipe === "Bruno") return true;
  if (turno === "12x36 Noite") return true;
  return false;
}

/** Janela de edição (em "wallclock" Manaus) para a folha do checklist. */
export function janelaEdicaoTurno(
  dataFolha: string,
  equipe: Equipe,
  turno: Turno,
): JanelaTurno {
  if (ehTurnoNoite(equipe, turno)) {
    // 17:50 do dia da folha → 06:10 do dia seguinte
    return {
      inicio: dataHoraManaus(dataFolha, 17, 50),
      fim: dataHoraManaus(somarUmDia(dataFolha), 6, 10),
    };
  }
  // Dia: 05:50 → 18:10
  return {
    inicio: dataHoraManaus(dataFolha, 5, 50),
    fim: dataHoraManaus(dataFolha, 18, 10),
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
  // Bloqueio definitivo: se ambas as assinaturas (operador e líder) já foram coletadas
  // no fechamento do dia, o checklist está finalizado e não pode mais ser alterado.
  if (checklist.assinaturaOperador?.dataUrl && checklist.assinaturaLider?.dataUrl) {
    return {
      permitido: false,
      motivo: "assinado",
      mensagem:
        "Checklist finalizado e assinado pelo operador e pelo líder. Não pode mais ser alterado.",
    };
  }
  if (!dentroDaJanelaEdicao(checklist)) {
    return {
      permitido: false,
      motivo: "fora_horario",
      mensagem: "Edição bloqueada. O horário deste turno já encerrou.",
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

