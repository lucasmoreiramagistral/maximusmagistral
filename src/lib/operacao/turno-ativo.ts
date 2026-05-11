/**
 * Turno Ativo do Dia — fonte única do turno+equipe que o operador está
 * EXECUTANDO no momento (cobre extra/cobertura, não só o cadastro).
 *
 * Persistência: localStorage por userId, key `fm-turno-ativo:${userId}`.
 * Validações ao ler:
 *   - combo precisa formar uma escala válida (escalaPorTurnoEquipe);
 *   - dataOperacional recalculada deve bater com a salva (caso contrário,
 *     o ativo é descartado — não arrasta extra de ontem para hoje).
 *
 * Fallback: turnoPadrao/equipePadrao do cadastro do usuário.
 *
 * SSR-safe: getServerSnapshot devolve sempre o padrão do cadastro.
 */

import { useSyncExternalStore } from "react";
import type { Equipe, Turno, Usuario } from "@/lib/checklist/types";
import { ESCALAS, escalaPorTurnoEquipe } from "./escalas";
import { calcularDataOperacional } from "./data-operacional";

/** Match EXATO turno+equipe — sem fallback de legado.
 *  Usado no Turno Ativo para impedir combos inválidos como Bruno+1ºTurno. */
function comboValidoExato(turno: Turno, equipe: Equipe): boolean {
  return ESCALAS.some((e) => e.turno === turno && e.equipe === equipe);
}

const KEY_PREFIX = "fm-turno-ativo:";
export const TURNO_ATIVO_EVENT = "fm-turno-ativo-update";

interface TurnoAtivoSalvo {
  turno: Turno;
  equipe: Equipe;
  dataOperacional: string;
  gravadoEm: string;
}

export interface TurnoAtivoResolved {
  turno: Turno | null;
  equipe: Equipe | null;
  data: string;
  /** True quando o ativo difere do padrão do cadastro (extra/cobertura). */
  ehExtra: boolean;
  /** True quando o usuário tem padrão no cadastro (sem padrão = obrigatório escolher). */
  temPadrao: boolean;
}

function keyDoUsuario(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `${KEY_PREFIX}${userId}`;
}

function lerCru(userId: string | null | undefined): TurnoAtivoSalvo | null {
  const key = keyDoUsuario(userId);
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TurnoAtivoSalvo;
    if (!parsed?.turno || !parsed?.equipe || !parsed?.dataOperacional) return null;
    // combo precisa ser escala válida
    if (!comboValidoExato(parsed.turno, parsed.equipe)) return null;
    // expira quando a data operacional virou
    const dataAtual = calcularDataOperacional(parsed.equipe, parsed.turno);
    if (dataAtual !== parsed.dataOperacional) return null;
    return parsed;
  } catch {
    return null;
  }
}

function emitir() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TURNO_ATIVO_EVENT));
}

export function setTurnoAtivoDoDia(
  usuario: Pick<Usuario, "userId"> | null | undefined,
  payload: { turno: Turno; equipe: Equipe },
): void {
  const key = keyDoUsuario(usuario?.userId);
  if (!key || typeof window === "undefined") return;
  if (!escalaPorTurnoEquipe(payload.turno, payload.equipe)) return;
  const salvo: TurnoAtivoSalvo = {
    turno: payload.turno,
    equipe: payload.equipe,
    dataOperacional: calcularDataOperacional(payload.equipe, payload.turno),
    gravadoEm: new Date().toISOString(),
  };
  window.localStorage.setItem(key, JSON.stringify(salvo));
  emitir();
}

export function clearTurnoAtivoDoDia(
  usuario: Pick<Usuario, "userId"> | null | undefined,
): void {
  const key = keyDoUsuario(usuario?.userId);
  if (!key || typeof window === "undefined") return;
  window.localStorage.removeItem(key);
  emitir();
}

function resolver(
  usuario: Pick<Usuario, "userId" | "turnoPadrao" | "equipePadrao"> | null | undefined,
): TurnoAtivoResolved {
  const padraoTurno = (usuario?.turnoPadrao as Turno | null | undefined) ?? null;
  const padraoEquipe = (usuario?.equipePadrao as Equipe | null | undefined) ?? null;
  const temPadrao = Boolean(padraoTurno && padraoEquipe);

  const ativo = lerCru(usuario?.userId);
  if (ativo) {
    const ehExtra =
      !temPadrao || ativo.turno !== padraoTurno || ativo.equipe !== padraoEquipe;
    return {
      turno: ativo.turno,
      equipe: ativo.equipe,
      data: ativo.dataOperacional,
      ehExtra,
      temPadrao,
    };
  }

  return {
    turno: padraoTurno,
    equipe: padraoEquipe,
    data: calcularDataOperacional(padraoEquipe, padraoTurno),
    ehExtra: false,
    temPadrao,
  };
}

export function getTurnoAtivoDoDia(
  usuario: Pick<Usuario, "userId" | "turnoPadrao" | "equipePadrao"> | null | undefined,
): TurnoAtivoResolved {
  return resolver(usuario);
}

// ── Hook reativo ────────────────────────────────────────────────────
type Subscriber = () => void;

function subscribe(cb: Subscriber): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  const sh = (e: StorageEvent) => {
    if (e.key && e.key.startsWith(KEY_PREFIX)) cb();
  };
  window.addEventListener(TURNO_ATIVO_EVENT, handler);
  window.addEventListener("storage", sh);
  return () => {
    window.removeEventListener(TURNO_ATIVO_EVENT, handler);
    window.removeEventListener("storage", sh);
  };
}

/**
 * Cache de snapshot por usuário para garantir identidade estável entre
 * leituras consecutivas (requisito do useSyncExternalStore).
 */
const snapshotCache = new WeakMap<object, TurnoAtivoResolved>();
const cacheKeys = new Map<string, { ref: object }>();

function refDoUsuario(userId: string | null | undefined): object {
  const k = userId ?? "__sem_user__";
  let entry = cacheKeys.get(k);
  if (!entry) {
    entry = { ref: {} };
    cacheKeys.set(k, entry);
  }
  return entry.ref;
}

function snapshotEqual(a: TurnoAtivoResolved, b: TurnoAtivoResolved): boolean {
  return (
    a.turno === b.turno &&
    a.equipe === b.equipe &&
    a.data === b.data &&
    a.ehExtra === b.ehExtra &&
    a.temPadrao === b.temPadrao
  );
}

export function useTurnoAtivoDoDia(
  usuario: Pick<Usuario, "userId" | "turnoPadrao" | "equipePadrao"> | null | undefined,
): TurnoAtivoResolved {
  const ref = refDoUsuario(usuario?.userId);

  const getSnapshot = () => {
    const fresh = resolver(usuario);
    const cached = snapshotCache.get(ref);
    if (cached && snapshotEqual(cached, fresh)) return cached;
    snapshotCache.set(ref, fresh);
    return fresh;
  };

  const getServerSnapshot = (): TurnoAtivoResolved => {
    const padraoTurno = (usuario?.turnoPadrao as Turno | null | undefined) ?? null;
    const padraoEquipe = (usuario?.equipePadrao as Equipe | null | undefined) ?? null;
    return {
      turno: padraoTurno,
      equipe: padraoEquipe,
      data: calcularDataOperacional(padraoEquipe, padraoTurno),
      ehExtra: false,
      temPadrao: Boolean(padraoTurno && padraoEquipe),
    };
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
