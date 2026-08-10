/**
 * Área ativa — multi-módulo.
 *
 * O banco já guarda `modulos_acesso` (text[]) e tem `has_modulo()`, mas até
 * aqui o login usava só `perfil`, e o próprio código marcava isso como
 * débito técnico. Resultado prático: para ver outra área era preciso
 * deslogar e entrar com outra conta.
 *
 * Com isto, quem tem mais de um módulo troca de área com um clique. Serve
 * na fábrica (coordenador que cobre turno como líder) e serve para testar.
 *
 * O perfil continua mandando no destino inicial após o login; o módulo
 * define o que a pessoa PODE abrir.
 */

import type { PerfilAtivo, Usuario } from "./types";
import { PERFIS_ATIVOS, ehPerfilAtivo } from "./types";

const CHAVE = "fm-area-ativa";
export const AREA_ATIVA_EVENT = "fm-area-ativa-update";

/** Áreas que o usuário pode abrir: o próprio perfil + os módulos liberados. */
export function areasDisponiveis(usuario: Usuario | null): PerfilAtivo[] {
  if (!usuario) return [];
  const set = new Set<PerfilAtivo>();
  if (ehPerfilAtivo(usuario.perfil)) set.add(usuario.perfil);
  for (const m of usuario.modulosAcesso ?? []) {
    if (ehPerfilAtivo(m)) set.add(m);
  }
  // "admin" não é área própria — quem tem admin enxerga tudo.
  if ((usuario.modulosAcesso ?? []).includes("admin")) {
    for (const p of PERFIS_ATIVOS) set.add(p);
  }
  return PERFIS_ATIVOS.filter((p) => set.has(p));
}

export function podeAbrirArea(usuario: Usuario | null, area: PerfilAtivo): boolean {
  return areasDisponiveis(usuario).includes(area);
}

export function getAreaAtiva(usuario: Usuario | null): PerfilAtivo | null {
  const disponiveis = areasDisponiveis(usuario);
  if (disponiveis.length === 0) return null;
  if (typeof window === "undefined") return disponiveis[0];

  const salva = window.localStorage.getItem(CHAVE);
  if (salva && ehPerfilAtivo(salva) && disponiveis.includes(salva)) return salva;

  // Sem escolha salva, manda no perfil — é o papel principal da pessoa.
  if (ehPerfilAtivo(usuario!.perfil) && disponiveis.includes(usuario!.perfil)) {
    return usuario!.perfil;
  }
  return disponiveis[0];
}

export function setAreaAtiva(area: PerfilAtivo): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE, area);
  window.dispatchEvent(new Event(AREA_ATIVA_EVENT));
}

export function clearAreaAtiva(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CHAVE);
  window.dispatchEvent(new Event(AREA_ATIVA_EVENT));
}
