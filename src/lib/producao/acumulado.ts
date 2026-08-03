import { HORA_X_HORA_FAIXAS } from "./constants";
import type { ProducaoHora, ProducaoHoraCalculada } from "./types";

/** Horas em que o acumulado zera por virada de turno (06:00 e 18:00). */
export const HORAS_VIRADA_TURNO = new Set(["H01", "H13"]);

function rotuloProduto(sabor: string | null, tamanho: string | null): string | null {
  const partes = [sabor?.trim(), tamanho?.trim()].filter(Boolean);
  return partes.length > 0 ? partes.join(" ") : null;
}

/**
 * Calcula a quantidade acumulada de cada hora do dia.
 *
 * Regras (espelham o formulário em papel):
 *  1. Zera na virada de turno — H01 (06:00) e H13 (18:00).
 *  2. Zera quando a hora está marcada com `reiniciaAcumulado`
 *     (troca de sabor, troca de tamanho ou CIP).
 *
 * Horas sem lançamento (sem quantidade e sem "não rodou") ficam com
 * acumulado `null` — em branco, como no papel — e não somam nada.
 * O produto vigente é herdado do último reinício do bloco.
 */
export function calcularAcumulado(horas: ProducaoHora[]): ProducaoHoraCalculada[] {
  const porCodigo = new Map(horas.map((h) => [h.horaCodigo, h]));
  const ordenadas = HORA_X_HORA_FAIXAS.map((f) => porCodigo.get(f.codigo)).filter(
    (h): h is ProducaoHora => Boolean(h),
  );

  let acumulado = 0;
  let produtoVigente: string | null = null;
  const saida: ProducaoHoraCalculada[] = [];

  for (const h of ordenadas) {
    const zera = HORAS_VIRADA_TURNO.has(h.horaCodigo) || h.reiniciaAcumulado;
    if (zera) acumulado = 0;

    const produtoDaLinha = rotuloProduto(h.produtoSabor, h.produtoTamanho);
    if (zera) {
      produtoVigente = produtoDaLinha;
    } else if (produtoDaLinha && !produtoVigente) {
      produtoVigente = produtoDaLinha;
    }

    const temLancamento = h.naoRodou || typeof h.quantidade === "number";
    if (temLancamento) {
      acumulado += h.naoRodou ? 0 : h.quantidade ?? 0;
    }

    saida.push({
      ...h,
      quantidadeAcumulada: temLancamento ? acumulado : null,
      produtoVigente,
    });
  }

  return saida;
}

export interface ResumoHoraXHora {
  /** Horas do escopo que já têm lançamento. */
  lancadas: number;
  /** Total de horas do escopo. */
  total: number;
  /** Códigos de hora do escopo ainda em branco. */
  faltantes: string[];
  totalProduzido: number;
  totalMeta: number;
  totalParadaMin: number;
  /** Percentual de atingimento da meta (null quando não há meta). */
  atingimentoPct: number | null;
}

/**
 * Resumo de um escopo de horas (normalmente as 12 horas de um turno).
 * `codigosDoEscopo` define o denominador — horas fora dele são ignoradas.
 */
export function calcularResumoHoraXHora(
  horas: ProducaoHora[],
  codigosDoEscopo: string[],
): ResumoHoraXHora {
  const escopo = new Set(codigosDoEscopo);
  const porCodigo = new Map(horas.filter((h) => escopo.has(h.horaCodigo)).map((h) => [h.horaCodigo, h]));

  let lancadas = 0;
  let totalProduzido = 0;
  let totalMeta = 0;
  let totalParadaMin = 0;
  const faltantes: string[] = [];

  for (const codigo of codigosDoEscopo) {
    const h = porCodigo.get(codigo);
    const temLancamento = Boolean(h && (h.naoRodou || typeof h.quantidade === "number"));
    if (!temLancamento) {
      faltantes.push(codigo);
      continue;
    }
    lancadas++;
    totalProduzido += h?.naoRodou ? 0 : h?.quantidade ?? 0;
    totalMeta += h?.meta ?? 0;
    totalParadaMin += h?.tempoParadaMin ?? 0;
  }

  return {
    lancadas,
    total: codigosDoEscopo.length,
    faltantes,
    totalProduzido,
    totalMeta,
    totalParadaMin,
    atingimentoPct: totalMeta > 0 ? Math.round((totalProduzido / totalMeta) * 100) : null,
  };
}
