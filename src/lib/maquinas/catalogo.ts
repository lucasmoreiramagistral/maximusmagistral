/**
 * Identificadores estáveis para novos registros. Os nomes continuam iguais aos
 * já gravados no Supabase para preservar a leitura das folhas da Enchedora 3.
 */
export const MAQUINAS = {
  "enchedora-3": {
    id: "enchedora-3",
    nome: "Enchedora 3",
    linha: "Linha 3",
    area: "Envase",
    equipamento: "Enchedora Zegla 50V",
    tipo: "enchedora",
    unidadeProducao: "garrafas",
    formularios: { checklist: true, ptp: true, limpeza: true, horaXHora: true },
  },
  "enchedora-2": {
    id: "enchedora-2",
    nome: "Enchedora 2",
    linha: "Linha 2",
    area: "Envase",
    equipamento: "Enchedora Zegla 40V",
    tipo: "enchedora",
    unidadeProducao: "garrafas",
    formularios: { checklist: true, ptp: true, limpeza: true, horaXHora: true },
  },
  "empacotadora-2": {
    id: "empacotadora-2",
    nome: "Empacotadora 2",
    linha: "Linha 2",
    area: "Envase",
    equipamento: "Empacotadora 2",
    tipo: "empacotadora",
    unidadeProducao: "pacotes",
    formularios: { checklist: true, ptp: true, limpeza: false, horaXHora: true },
  },
  "empacotadora-3": {
    id: "empacotadora-3",
    nome: "Empacotadora 3",
    linha: "Linha 3",
    area: "Envase",
    equipamento: "Empacotadora 3",
    tipo: "empacotadora",
    unidadeProducao: "pacotes",
    formularios: { checklist: true, ptp: true, limpeza: false, horaXHora: true },
  },
} as const;

export type MaquinaId = keyof typeof MAQUINAS;
export type MaquinaOperacional = (typeof MAQUINAS)[MaquinaId];
export type NomeMaquina = MaquinaOperacional["nome"];
export type NomeLinha = MaquinaOperacional["linha"];

export const MAQUINAS_ORDENADAS: readonly MaquinaOperacional[] = [
  MAQUINAS["enchedora-2"],
  MAQUINAS["empacotadora-2"],
  MAQUINAS["enchedora-3"],
  MAQUINAS["empacotadora-3"],
];

export function maquinaPorNome(nome: string | null | undefined): MaquinaOperacional | null {
  return MAQUINAS_ORDENADAS.find((m) => m.nome === nome) ?? null;
}

export function maquinaPorId(id: string | null | undefined): MaquinaOperacional | null {
  return id && id in MAQUINAS ? MAQUINAS[id as MaquinaId] : null;
}

/** Compatibilidade de perfis criados antes da atribuição de máquina. */
export function maquinaDoUsuario(usuario: { maquinaId?: string | null } | null | undefined): MaquinaOperacional {
  return maquinaPorId(usuario?.maquinaId) ?? MAQUINAS["enchedora-3"];
}

/**
 * A Enchedora 3 conserva os IDs históricos. Nos outros equipamentos o sufixo
 * da máquina entra no ID antes do upsert, evitando colisão entre folhas.
 */
export function sufixoIdMaquina(maquina: MaquinaOperacional): string {
  return maquina.id === "enchedora-3" ? "" : `-maquina:${maquina.id}`;
}
