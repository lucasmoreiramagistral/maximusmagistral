import { MAQUINAS_CARD } from "../hora-x-hora-telegram/cartao.ts";

export interface HoraPersistida {
  maquina: string;
  hora_codigo: string;
  quantidade: number | null;
  tempo_parada_min: number | null;
  motivo_parada_codigo: string | null;
  operador_nome?: string | null;
  produto_sabor?: string | null;
  produto_tamanho?: string | null;
  meta?: number | null;
  nao_rodou?: boolean | null;
  [campo: string]: unknown;
}

const maquinas = new Set<string>(MAQUINAS_CARD.map((maquina) => maquina.nome));

/** A lista vem ordenada da confirmação mais recente para a mais antiga. */
export function registrosPublicos(horas: readonly HoraPersistida[]) {
  const unicas = new Map<string, {
    maquina: string;
    horaCodigo: string;
    quantidade: number;
    perdaMin: number | null;
    motivoCodigo: string | null;
    operadorNome: string | null;
    produtoSabor: string | null;
    produtoTamanho: string | null;
    cadencia: number | null;
    naoRodou: boolean;
  }>();
  for (const hora of horas) {
    if (!maquinas.has(hora.maquina) || !/^H(0[1-9]|1[0-9]|2[0-4])$/.test(hora.hora_codigo)
        || typeof hora.quantidade !== "number" || !Number.isFinite(hora.quantidade)
        || hora.quantidade < 0) continue;
    const chave = `${hora.maquina}:${hora.hora_codigo}`;
    if (unicas.has(chave)) continue;
    unicas.set(chave, {
      maquina: hora.maquina,
      horaCodigo: hora.hora_codigo,
      quantidade: hora.quantidade,
      perdaMin: hora.tempo_parada_min,
      motivoCodigo: hora.motivo_parada_codigo,
      operadorNome: hora.operador_nome ?? null,
      produtoSabor: hora.produto_sabor ?? null,
      produtoTamanho: hora.produto_tamanho ?? null,
      cadencia: hora.meta ?? null,
      naoRodou: hora.nao_rodou === true,
    });
  }
  return [...unicas.values()];
}
