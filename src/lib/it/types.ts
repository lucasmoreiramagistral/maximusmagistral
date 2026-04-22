// Tipos para as Instruções de Trabalho (IT) consumidas do Supabase Storage.

export type IndiceTipo = "capa" | "sumario" | "secao" | "passo" | "anexo";

export interface IndiceEntry {
  tipo: IndiceTipo;
  label: string;
  pagina: number;
  numero?: number | string;
}

export interface ManifestPagina {
  pagina: number;
  arquivo: string;
  kb: number;
}

export interface ManifestDoc {
  titulo: string;
  codigo: string;
  total_paginas: number;
  tamanho_mb: number;
  paginas: ManifestPagina[];
  indice: IndiceEntry[];
}

export interface ManifestRoot {
  it002: ManifestDoc;
  it005: ManifestDoc;
}

export type ItDocSlug = "operacao" | "limpeza";

export const IT_DOC_KEY: Record<ItDocSlug, keyof ManifestRoot> = {
  operacao: "it002",
  limpeza: "it005",
};

export const IT_DOC_TITULO: Record<ItDocSlug, string> = {
  operacao: "IT Operação — Enchedora L3",
  limpeza: "IT Limpeza — Enchedora L3",
};
