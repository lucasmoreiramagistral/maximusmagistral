import type { Checklist, Turno } from "@/lib/checklist/types";
import {
  LIMPEZA_ITENS_DEF,
  PTP_ITENS,
  PTP_JANELAS,
} from "./constants";
import {
  escalaPorTurnoEquipe,
  janelasPtpDaEscala,
  type Escala,
} from "@/lib/operacao/escalas";
import type {
  LimpezaItem,
  LimpezaTurno,
  LimpezaTurnoStatus,
  PtpJanela,
  PtpJanelaStatus,
} from "./types";

// ─── Tipos públicos ──────────────────────────────────────────────────

export interface RefFrente {
  /** YYYY-MM-DD */
  dataOperacao: string;
  /** Qualquer Turno válido — todos os turnos agora têm verso (PTP + limpeza). */
  turno: Turno;
  equipe: string;
  linha: string;
  maquina: string;
}

export type SituacaoVerso =
  | "completo"
  | "ptp_pendente"
  | "limpeza_pendente"
  | "verso_incompleto"
  | "frente_sem_verso";

export interface LinhaAderencia {
  dataOperacao: string;
  turno: Turno;
  equipe: string;
  ptpEsperadas: number;
  ptpRealizadas: number;
  ptpPendentes: number;
  ptpComOcorrencia: number;
  ptpNaoRodou: number;
  limpezaStatus: LimpezaTurnoStatus | "ausente";
  situacao: SituacaoVerso;
  // ── Análise de Ângulo (aderência por turno) ──
  analiseAnguloEsperadas: number;
  analiseAnguloRealizadas: number;
  /** 0..100 — quando esperadas=0, retorna 0. */
  taxaAnaliseAngulo: number;
}

export interface ResumoVersoRelatorio {
  turnosFrente: number;
  turnosVersoCompleto: number;
  taxaAderencia: number; // 0..100
  ptpEsperadas: number;
  ptpRegistradas: number;
  ptpPendentes: number;
  ptpComOcorrencia: number;
  ptpNaoRodou: number;
  limpezasEsperadas: number;
  limpezasValidadas: number;
  limpezasAguardandoLider: number;
  limpezasPendentesOuRascunho: number;
  // ── Análise de Ângulo (aderência/verificação — NÃO é defeito) ──
  analiseAnguloEsperadas: number;
  analiseAnguloRealizadas: number;
  analiseAnguloPendentes: number;
  /** 0..100 — quando esperadas=0, retorna 0. */
  taxaAnaliseAngulo: number;
}

export interface DiagnosticoPtp {
  porStatus: { chave: string; total: number }[];
  topItens: {
    codigo: string;
    nome: string;
    /** Total acumulado real de ocorrências (soma das quantidades). */
    ocorrencias: number;
    label: string; // "X ocorrências"
  }[];
  porJanela: { chave: string; total: number; rotulo: string }[];
  ocorrenciasLista: {
    dataOperacao: string;
    turno: Turno;
    horario: string; // HH:mm ou ISO
    itemNome: string;
    quantidade: number;
    motivo?: string;
  }[];
  comObservacao: {
    dataOperacao: string;
    turno: Turno;
    janelaCodigo: string;
    observacao: string;
  }[];
  /**
   * Análise de Ângulo por janela — métrica de aderência/verificação.
   * NÃO é defeito, NÃO conta como ocorrência.
   * O `turno` aqui vem do contexto da frente (RefFrente) — janela isolada
   * não define turno com segurança. Fallback: derivarTurnoDaJanela.
   */
  analiseAnguloPorJanela: {
    dataOperacao: string;
    turno: Turno;
    janelaCodigo: string;
    janelaRotulo: string;
    v1Realizada: boolean;
    v2Realizada: boolean;
    realizadas: number;
    esperadas: number;
    status: "completa" | "parcial" | "pendente" | "nao_rodou";
  }[];
}

export interface DiagnosticoLimpeza {
  porStatus: { chave: string; total: number }[];
  topItensNaoRealizados: {
    codigo: number;
    descricao: string;
    total: number;
  }[];
  taxaValidacaoLider: number; // 0..100
  serieDiariaNaoRealizados: { data: string; total: number }[];
}

export interface AlertaVerso {
  texto: string;
  destaque: "destructive" | "warning" | "info";
}

export interface ForaDoRecorte {
  ptp: PtpJanela[];
  limpeza: LimpezaTurno[];
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Lista de janelas PTP cobertas por uma escala, com cache.
 * Usado em vários laços; evita recomputar a cada item.
 */
const _janelasPorEscalaIdCache = new Map<string, string[]>();
function janelasDeEscalaCacheada(escala: Escala | null): string[] {
  if (!escala) return [];
  const cache = _janelasPorEscalaIdCache.get(escala.id);
  if (cache) return cache;
  const lista = janelasPtpDaEscala(escala);
  _janelasPorEscalaIdCache.set(escala.id, lista);
  return lista;
}

/**
 * Deriva a escala/turno a partir de uma janela PTP.
 *
 * IMPORTANTE: o contexto ativo do operador/folha sempre manda. Esta função
 * é apenas um fallback para indexação de relatórios consolidados, quando
 * não temos contexto: devolve a primeira escala que cobre essa janela.
 *
 * @param janelaCodigo "J01".."J12"
 * @param escalaAtiva  se vier, valida que a janela é coberta por essa escala
 *                     e devolve a própria; caso contrário retorna null.
 */
export function derivarEscalaDaJanela(
  janelaCodigo: string,
  escalaAtiva?: Escala | null,
): Escala | null {
  if (escalaAtiva) {
    const cobertura = janelasDeEscalaCacheada(escalaAtiva);
    return cobertura.includes(janelaCodigo) ? escalaAtiva : null;
  }
  // Fallback: percorre escalas conhecidas e devolve a primeira que cobre.
  // Mantém a lista derivada da fonte única para não duplicar literais.
  for (const turno of [
    "12x36 Dia",
    "12x36 Noite",
    "Comercial",
    "1º Turno",
    "2º Turno",
    "3º Turno",
  ] as Turno[]) {
    const escala = escalaPorTurnoEquipe(turno, null);
    if (!escala) continue;
    if (janelasDeEscalaCacheada(escala).includes(janelaCodigo)) return escala;
  }
  return null;
}

/** Versão "só turno" para call sites que só precisam do turno. */
function derivarTurnoDaJanela(janelaCodigo: string): Turno | null {
  return derivarEscalaDaJanela(janelaCodigo)?.turno ?? null;
}

function chaveRef(data: string, turno: string): string {
  return `${data}__${turno}`;
}

// ─── Construção da referência documental da frente ───────────────────

export function construirReferenciaFrente(
  checklistsFiltrados: Checklist[],
): RefFrente[] {
  const map = new Map<string, RefFrente>();
  for (const c of checklistsFiltrados) {
    const turno = c.contexto.turno;
    // Todos os turnos têm verso (PTP + limpeza); sem filtro restritivo.
    const data = c.contexto.data;
    const key = chaveRef(data, turno);
    if (!map.has(key)) {
      map.set(key, {
        dataOperacao: data,
        turno,
        equipe: c.contexto.equipe,
        linha: c.contexto.linha,
        maquina: c.contexto.maquina,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.dataOperacao !== b.dataOperacao)
      return a.dataOperacao.localeCompare(b.dataOperacao);
    return a.turno.localeCompare(b.turno);
  });
}

// ─── Cruzamento frente × verso ───────────────────────────────────────

function avaliarSituacao(
  ptpEsperadas: number,
  ptpConcluidas: number,
  limpezaStatus: LimpezaTurnoStatus | "ausente",
): SituacaoVerso {
  const ptpOk = ptpConcluidas >= ptpEsperadas;
  const limpOk = limpezaStatus === "validado";
  if (ptpOk && limpOk) return "completo";
  if (!ptpOk && limpOk) return "ptp_pendente";
  if (ptpOk && !limpOk) return "limpeza_pendente";
  return "verso_incompleto";
}

function ptpConcluidaStatus(s: PtpJanelaStatus): boolean {
  return s !== "pendente" && s !== "rascunho";
}

export function cruzarFrenteVerso(
  ref: RefFrente[],
  ptp: PtpJanela[],
  limpeza: LimpezaTurno[],
): LinhaAderencia[] {
  // Indexa PTP por (data, turno-derivado)
  const ptpPorChave = new Map<string, PtpJanela[]>();
  for (const j of ptp) {
    const t = derivarTurnoDaJanela(j.janelaCodigo);
    if (!t) continue;
    const k = chaveRef(j.dataOperacao, t);
    const arr = ptpPorChave.get(k) ?? [];
    arr.push(j);
    ptpPorChave.set(k, arr);
  }
  // Indexa limpeza por (data, turno) — qualquer turno é válido agora.
  const limpPorChave = new Map<string, LimpezaTurno>();
  for (const l of limpeza) {
    limpPorChave.set(chaveRef(l.dataOperacao, l.turno), l);
  }

  return ref.map<LinhaAderencia>((r) => {
    const k = chaveRef(r.dataOperacao, r.turno);
    const ptpDoTurno = ptpPorChave.get(k) ?? [];
    const escalaRef = escalaPorTurnoEquipe(r.turno, r.equipe as never);
    const ptpEsperadas = janelasDeEscalaCacheada(escalaRef).length;
    const ptpRealizadas = ptpDoTurno.filter((j) => ptpConcluidaStatus(j.statusJanela))
      .length;
    const ptpPendentes = ptpEsperadas - ptpRealizadas;
    const ptpComOcorrencia = ptpDoTurno.filter(
      (j) => j.statusJanela === "houve_ocorrencia",
    ).length;
    const ptpNaoRodou = ptpDoTurno.filter((j) => j.statusJanela === "nao_rodou").length;

    // ── Análise de Ângulo: só conta janelas que rodaram (≠ nao_rodou) ──
    let analiseAnguloEsperadas = 0;
    let analiseAnguloRealizadas = 0;
    for (const j of ptpDoTurno) {
      if (j.statusJanela === "nao_rodou") continue;
      analiseAnguloEsperadas += 2;
      const a = j.analiseAngulo;
      if (a?.v1Realizada) analiseAnguloRealizadas += 1;
      if (a?.v2Realizada) analiseAnguloRealizadas += 1;
    }
    const taxaAnaliseAngulo =
      analiseAnguloEsperadas === 0
        ? 0
        : Math.round((analiseAnguloRealizadas / analiseAnguloEsperadas) * 100);

    const limp = limpPorChave.get(k);
    const limpezaStatus: LimpezaTurnoStatus | "ausente" = limp ? limp.status : "ausente";

    return {
      dataOperacao: r.dataOperacao,
      turno: r.turno,
      equipe: r.equipe,
      ptpEsperadas,
      ptpRealizadas,
      ptpPendentes: Math.max(0, ptpPendentes),
      ptpComOcorrencia,
      ptpNaoRodou,
      limpezaStatus,
      situacao: avaliarSituacao(ptpEsperadas, ptpRealizadas, limpezaStatus),
      analiseAnguloEsperadas,
      analiseAnguloRealizadas,
      taxaAnaliseAngulo,
    };
  });
}

// ─── Resumo (12 KPIs) ────────────────────────────────────────────────

export function calcularResumoVersoRelatorio(
  aderencia: LinhaAderencia[],
): ResumoVersoRelatorio {
  const turnosFrente = aderencia.length;
  const turnosVersoCompleto = aderencia.filter((a) => a.situacao === "completo").length;
  const taxaAderencia =
    turnosFrente === 0 ? 0 : Math.round((turnosVersoCompleto / turnosFrente) * 100);

  const ptpEsperadas = aderencia.reduce((s, a) => s + a.ptpEsperadas, 0);
  const ptpRegistradas = aderencia.reduce((s, a) => s + a.ptpRealizadas, 0);
  const ptpPendentes = aderencia.reduce((s, a) => s + a.ptpPendentes, 0);
  const ptpComOcorrencia = aderencia.reduce((s, a) => s + a.ptpComOcorrencia, 0);
  const ptpNaoRodou = aderencia.reduce((s, a) => s + a.ptpNaoRodou, 0);

  const limpezasEsperadas = turnosFrente; // 1 limpeza por turno da frente
  const limpezasValidadas = aderencia.filter((a) => a.limpezaStatus === "validado")
    .length;
  const limpezasAguardandoLider = aderencia.filter(
    (a) => a.limpezaStatus === "aguardando_validacao",
  ).length;
  const limpezasPendentesOuRascunho = aderencia.filter(
    (a) =>
      a.limpezaStatus === "pendente" ||
      a.limpezaStatus === "rascunho" ||
      a.limpezaStatus === "ausente",
  ).length;

  // ── Análise de Ângulo: agregação no período ──
  const analiseAnguloEsperadas = aderencia.reduce(
    (s, a) => s + a.analiseAnguloEsperadas,
    0,
  );
  const analiseAnguloRealizadas = aderencia.reduce(
    (s, a) => s + a.analiseAnguloRealizadas,
    0,
  );
  const analiseAnguloPendentes = Math.max(
    0,
    analiseAnguloEsperadas - analiseAnguloRealizadas,
  );
  const taxaAnaliseAngulo =
    analiseAnguloEsperadas === 0
      ? 0
      : Math.round((analiseAnguloRealizadas / analiseAnguloEsperadas) * 100);

  return {
    turnosFrente,
    turnosVersoCompleto,
    taxaAderencia,
    ptpEsperadas,
    ptpRegistradas,
    ptpPendentes,
    ptpComOcorrencia,
    ptpNaoRodou,
    limpezasEsperadas,
    limpezasValidadas,
    limpezasAguardandoLider,
    limpezasPendentesOuRascunho,
    analiseAnguloEsperadas,
    analiseAnguloRealizadas,
    analiseAnguloPendentes,
    taxaAnaliseAngulo,
  };
}

// ─── Diagnóstico PTP ─────────────────────────────────────────────────

const LABEL_PTP: Record<PtpJanelaStatus, string> = {
  pendente: "Pendente",
  rascunho: "Rascunho",
  sem_ocorrencia: "Sem ocorrência",
  houve_ocorrencia: "Houve ocorrência",
  nao_rodou: "Não rodou",
};

export function calcularDiagnosticoPtp(
  ptpDoRecorte: PtpJanela[],
  /**
   * Referência da frente — usada para resolver o turno de cada janela
   * a partir do contexto real (data, equipe, linha, máquina). Janela sozinha
   * NÃO define turno com segurança (J05 pode pertencer a múltiplos turnos).
   * Quando ausente, cai para derivarTurnoDaJanela como fallback.
   */
  ref: RefFrente[] = [],
): DiagnosticoPtp {
  // Por status
  const statusMap = new Map<PtpJanelaStatus, number>();
  for (const j of ptpDoRecorte)
    statusMap.set(j.statusJanela, (statusMap.get(j.statusJanela) ?? 0) + 1);
  const porStatus = (Object.keys(LABEL_PTP) as PtpJanelaStatus[])
    .map((s) => ({ chave: LABEL_PTP[s], total: statusMap.get(s) ?? 0 }))
    .filter((r) => r.total > 0);

  // Top itens — soma direta das quantidades reais (sem multiplicar por 2).
  const itensMap = new Map<string, number>();
  for (const j of ptpDoRecorte) {
    if (j.statusJanela !== "houve_ocorrencia") continue;
    for (const it of j.itens) {
      itensMap.set(it.codigo, (itensMap.get(it.codigo) ?? 0) + (it.quantidade ?? 0));
    }
  }
  const topItens = PTP_ITENS.map((def) => {
    const ocorrencias = itensMap.get(def.codigo) ?? 0;
    return {
      codigo: def.codigo,
      nome: def.nome,
      ocorrencias,
      label: `${ocorrencias} ocorrência${ocorrencias === 1 ? "" : "s"}`,
    };
  })
    .filter((r) => r.ocorrencias > 0)
    .sort((a, b) => b.ocorrencias - a.ocorrencias);

  // Por janela J01..J12 — só conta janelas com ocorrência
  const porJanelaMap = new Map<string, number>();
  for (const j of ptpDoRecorte) {
    if (j.statusJanela !== "houve_ocorrencia") continue;
    const totalMarc = j.itens.reduce((s, it) => s + (it.quantidade ?? 0), 0);
    porJanelaMap.set(j.janelaCodigo, (porJanelaMap.get(j.janelaCodigo) ?? 0) + totalMarc);
  }
  const porJanela = PTP_JANELAS.map((def) => ({
    chave: def.codigo,
    total: porJanelaMap.get(def.codigo) ?? 0,
    rotulo: def.rotulo,
  })).filter((r) => r.total > 0);

  // ── Resolução de turno por janela: contexto manda, janela é fallback ──
  // Index: para cada (data, janelaCodigo) busca o turno da RefFrente cuja
  // escala cobre essa janela. Se não houver, fallback p/ derivarTurnoDaJanela.
  const turnoPorChaveJanela = new Map<string, Turno>();
  for (const r of ref) {
    const escala = escalaPorTurnoEquipe(r.turno, r.equipe as never);
    if (!escala) continue;
    for (const jc of janelasDeEscalaCacheada(escala)) {
      turnoPorChaveJanela.set(`${r.dataOperacao}__${jc}`, r.turno);
    }
  }
  function resolverTurno(dataOperacao: string, janelaCodigo: string): Turno {
    const ctx = turnoPorChaveJanela.get(`${dataOperacao}__${janelaCodigo}`);
    if (ctx) return ctx;
    return (derivarTurnoDaJanela(janelaCodigo) ?? "12x36 Dia") as Turno;
  }

  // Lista detalhada de ocorrências
  const ocorrenciasLista: DiagnosticoPtp["ocorrenciasLista"] = [];
  for (const j of ptpDoRecorte) {
    if (j.statusJanela !== "houve_ocorrencia") continue;
    const turno = resolverTurno(j.dataOperacao, j.janelaCodigo);

    for (const it of j.itens) {
      if (it.status !== "houve_ocorrencia") continue;

      if (it.historico && it.historico.length > 0) {
        for (const h of it.historico) {
          if (h.tipo === "correcao_zerar") continue;
          ocorrenciasLista.push({
            dataOperacao: j.dataOperacao,
            turno,
            horario: h.horario,
            itemNome: it.nome,
            quantidade: h.quantidade,
            motivo: h.motivo || undefined,
          });
        }
      } else if ((it.quantidade ?? 0) > 0) {
        // Fallback legado
        ocorrenciasLista.push({
          dataOperacao: j.dataOperacao,
          turno,
          horario: j.dataOperacao,
          itemNome: it.nome,
          quantidade: it.quantidade,
        });
      }
    }
  }
  ocorrenciasLista.sort((a, b) => b.horario.localeCompare(a.horario));

  // Janelas com observação preenchida
  const comObservacao = ptpDoRecorte
    .filter((j) => j.observacao && j.observacao.trim().length > 0)
    .map((j) => ({
      dataOperacao: j.dataOperacao,
      turno: resolverTurno(j.dataOperacao, j.janelaCodigo),
      janelaCodigo: j.janelaCodigo,
      observacao: (j.observacao ?? "").trim(),
    }))
    .sort(
      (a, b) =>
        a.dataOperacao.localeCompare(b.dataOperacao) ||
        a.janelaCodigo.localeCompare(b.janelaCodigo),
    );


  // ── Análise de Ângulo por janela ──
  const rotuloPorJanela = new Map(PTP_JANELAS.map((d) => [d.codigo, d.rotulo]));
  const analiseAnguloPorJanela = ptpDoRecorte
    .map((j) => {
      const isNaoRodou = j.statusJanela === "nao_rodou";
      const a = j.analiseAngulo;
      const v1 = !isNaoRodou && Boolean(a?.v1Realizada);
      const v2 = !isNaoRodou && Boolean(a?.v2Realizada);
      const esperadas = isNaoRodou ? 0 : 2;
      const realizadas = (v1 ? 1 : 0) + (v2 ? 1 : 0);
      let status: "completa" | "parcial" | "pendente" | "nao_rodou";
      if (isNaoRodou) status = "nao_rodou";
      else if (realizadas === 2) status = "completa";
      else if (realizadas === 1) status = "parcial";
      else status = "pendente";
      return {
        dataOperacao: j.dataOperacao,
        turno: resolverTurno(j.dataOperacao, j.janelaCodigo),
        janelaCodigo: j.janelaCodigo,
        janelaRotulo: rotuloPorJanela.get(j.janelaCodigo) ?? j.janelaCodigo,
        v1Realizada: v1,
        v2Realizada: v2,
        realizadas,
        esperadas,
        status,
      };
    })
    .sort(
      (a, b) =>
        a.dataOperacao.localeCompare(b.dataOperacao) ||
        a.janelaCodigo.localeCompare(b.janelaCodigo),
    );

  return {
    porStatus,
    topItens,
    porJanela,
    ocorrenciasLista,
    comObservacao,
    analiseAnguloPorJanela,
  };
}


// ─── Diagnóstico Limpeza ─────────────────────────────────────────────

const LABEL_LIMP: Record<LimpezaTurnoStatus, string> = {
  pendente: "Pendente",
  rascunho: "Rascunho",
  aguardando_validacao: "Aguardando líder",
  validado: "Validado",
};

export function calcularDiagnosticoLimpeza(
  limpezaDoRecorte: LimpezaTurno[],
  totalEsperadasParaTaxa: number,
): DiagnosticoLimpeza {
  const statusMap = new Map<LimpezaTurnoStatus, number>();
  for (const t of limpezaDoRecorte)
    statusMap.set(t.status, (statusMap.get(t.status) ?? 0) + 1);
  const porStatus = (Object.keys(LABEL_LIMP) as LimpezaTurnoStatus[])
    .map((s) => ({ chave: LABEL_LIMP[s], total: statusMap.get(s) ?? 0 }))
    .filter((r) => r.total > 0);

  // Top itens não realizados
  const itensMap = new Map<number, number>();
  for (const t of limpezaDoRecorte) {
    for (const it of t.itens as LimpezaItem[]) {
      if (it.status === "nao_realizado")
        itensMap.set(it.codigo, (itensMap.get(it.codigo) ?? 0) + 1);
    }
  }
  const topItensNaoRealizados = LIMPEZA_ITENS_DEF.map((def) => ({
    codigo: def.codigo,
    descricao: def.descricao,
    total: itensMap.get(def.codigo) ?? 0,
  }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const validadas = limpezaDoRecorte.filter((t) => t.status === "validado").length;
  const taxaValidacaoLider =
    totalEsperadasParaTaxa === 0
      ? 0
      : Math.round((validadas / totalEsperadasParaTaxa) * 100);

  // Série diária — total de itens não realizados por dia
  const serieMap = new Map<string, number>();
  for (const t of limpezaDoRecorte) {
    const totalNR = (t.itens as LimpezaItem[]).filter(
      (it) => it.status === "nao_realizado",
    ).length;
    if (totalNR === 0) continue;
    serieMap.set(t.dataOperacao, (serieMap.get(t.dataOperacao) ?? 0) + totalNR);
  }
  const serieDiariaNaoRealizados = Array.from(serieMap.entries())
    .map(([data, total]) => ({ data, total }))
    .sort((a, b) => a.data.localeCompare(b.data));

  return { porStatus, topItensNaoRealizados, taxaValidacaoLider, serieDiariaNaoRealizados };
}

// ─── Filtragem do recorte (apenas registros cuja chave (data,turno) está em ref) ─

export function filtrarPtpDoRecorte(
  ref: RefFrente[],
  ptp: PtpJanela[],
): PtpJanela[] {
  const set = new Set(ref.map((r) => chaveRef(r.dataOperacao, r.turno)));
  return ptp.filter((j) => {
    const t = derivarTurnoDaJanela(j.janelaCodigo);
    if (!t) return false;
    return set.has(chaveRef(j.dataOperacao, t));
  });
}

export function filtrarLimpezaDoRecorte(
  ref: RefFrente[],
  limpeza: LimpezaTurno[],
): LimpezaTurno[] {
  const set = new Set(ref.map((r) => chaveRef(r.dataOperacao, r.turno)));
  return limpeza.filter((l) => set.has(chaveRef(l.dataOperacao, l.turno)));
}

export function registrosVersoForaDoRecorte(
  ref: RefFrente[],
  ptp: PtpJanela[],
  limpeza: LimpezaTurno[],
): ForaDoRecorte {
  const set = new Set(ref.map((r) => chaveRef(r.dataOperacao, r.turno)));
  const ptpFora = ptp.filter((j) => {
    const t = derivarTurnoDaJanela(j.janelaCodigo);
    if (!t) return true;
    return !set.has(chaveRef(j.dataOperacao, t));
  });
  const limpFora = limpeza.filter((l) => !set.has(chaveRef(l.dataOperacao, l.turno)));
  return { ptp: ptpFora, limpeza: limpFora };
}

// ─── Alertas operacionais ────────────────────────────────────────────

export function calcularAlertasVerso(args: {
  aderencia: LinhaAderencia[];
  resumo: ResumoVersoRelatorio;
  diagPtp: DiagnosticoPtp;
  diagLimp: DiagnosticoLimpeza;
}): AlertaVerso[] {
  const { aderencia, resumo, diagPtp, diagLimp } = args;
  const alertas: AlertaVerso[] = [];

  const limpezaNaoValidadaComFrente = aderencia.filter(
    (a) => a.limpezaStatus !== "validado" && a.limpezaStatus !== "ausente",
  ).length;
  if (limpezaNaoValidadaComFrente > 0) {
    alertas.push({
      texto: `${limpezaNaoValidadaComFrente} turno(s) com checklist concluído e limpeza não validada pelo líder.`,
      destaque: limpezaNaoValidadaComFrente >= 3 ? "destructive" : "warning",
    });
  }

  const ptpIncompletos = aderencia.filter(
    (a) => a.ptpRealizadas < a.ptpEsperadas,
  ).length;
  if (ptpIncompletos > 0) {
    alertas.push({
      texto: `${ptpIncompletos} turno(s) com PTP incompleto (faltam janelas finalizadas).`,
      destaque: ptpIncompletos >= 3 ? "destructive" : "warning",
    });
  }

  if (resumo.ptpPendentes > 0) {
    alertas.push({
      texto: `${resumo.ptpPendentes} janela(s) PTP pendentes/rascunho no período.`,
      destaque: "warning",
    });
  }

  // ── Análise de Ângulo: alertas de aderência (não é defeito) ──
  if (resumo.analiseAnguloEsperadas > 0) {
    if (resumo.taxaAnaliseAngulo < 40) {
      alertas.push({
        texto: `Aderência crítica na Análise de Ângulo: ${resumo.taxaAnaliseAngulo}% das verificações realizadas (${resumo.analiseAnguloRealizadas}/${resumo.analiseAnguloEsperadas}).`,
        destaque: "destructive",
      });
    } else if (resumo.taxaAnaliseAngulo < 70) {
      alertas.push({
        texto: `Aderência baixa na Análise de Ângulo: ${resumo.taxaAnaliseAngulo}% das verificações realizadas (${resumo.analiseAnguloRealizadas}/${resumo.analiseAnguloEsperadas}).`,
        destaque: "warning",
      });
    }
  }

  const topPtp = diagPtp.topItens[0];
  if (topPtp && topPtp.ocorrencias > 0) {
    alertas.push({
      texto: `Item PTP recorrente: ${topPtp.nome} — ${topPtp.label}.`,
      destaque: "info",
    });
  }

  const topLimp = diagLimp.topItensNaoRealizados[0];
  if (topLimp) {
    alertas.push({
      texto: `Item de limpeza mais negligenciado: "${topLimp.descricao}" (${topLimp.total} ocorrência(s) de não realizado).`,
      destaque: "warning",
    });
  }

  const aguardandoLider = aderencia.filter(
    (a) => a.limpezaStatus === "aguardando_validacao",
  ).length;
  if (aguardandoLider >= 3) {
    alertas.push({
      texto: `${aguardandoLider} limpeza(s) aguardando validação do líder.`,
      destaque: "destructive",
    });
  }

  const semVerso = aderencia.filter(
    (a) =>
      a.ptpRealizadas === 0 && (a.limpezaStatus === "ausente" || a.limpezaStatus === "pendente"),
  ).length;
  if (semVerso > 0) {
    alertas.push({
      texto: `${semVerso} turno(s) com frente registrada e nenhum verso iniciado.`,
      destaque: semVerso >= 3 ? "destructive" : "warning",
    });
  }

  return alertas;
}

