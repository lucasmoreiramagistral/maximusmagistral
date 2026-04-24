/**
 * Listas centralizadas de turnos e equipes — derivadas de ESCALAS.
 *
 * Use SEMPRE estas constantes em filtros, selects e validações.
 * Nunca repetir literais de turno/equipe em outros arquivos.
 */

import type { Equipe, Turno } from "@/lib/checklist/types";
import { ESCALAS } from "./escalas";

/** Todos os turnos válidos (na ordem visual: dia → administrativo → noite/fixos). */
export const TODOS_OS_TURNOS: ReadonlyArray<Turno> = Array.from(
  new Set(ESCALAS.map((e) => e.turno)),
);

/** Todas as equipes válidas. */
export const TODAS_AS_EQUIPES: ReadonlyArray<Equipe> = Array.from(
  new Set(ESCALAS.map((e) => e.equipe)),
);
