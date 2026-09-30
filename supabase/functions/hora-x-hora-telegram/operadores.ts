export interface HoraComOperador {
  operador_user_id?: string | null;
  operador_nome?: string | null;
}

export function idsDeOperadoresSemNome(horas: readonly HoraComOperador[]): string[] {
  return [...new Set(horas.filter((hora) => !hora.operador_nome?.trim())
    .map((hora) => hora.operador_user_id).filter((id): id is string => Boolean(id)))];
}

export function preencherNomesOperadores<T extends HoraComOperador>(
  horas: readonly T[], perfis: readonly { id: string; nome: string | null }[],
): T[] {
  const nomes = new Map(perfis.map((perfil) => [perfil.id, perfil.nome?.trim()]));
  return horas.map((hora) => ({
    ...hora,
    operador_nome: hora.operador_nome?.trim() ||
      (hora.operador_user_id ? nomes.get(hora.operador_user_id) : null) || null,
  }));
}
