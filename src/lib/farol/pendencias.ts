/**
 * PENDÊNCIAS ABERTAS — o passivo que o farol tem que mostrar.
 *
 * O farol que eu tinha feito era de EVENTO: mostrava o que aconteceu no dia
 * escolhido. Passou o dia, sumia. O Lucas apontou o furo e o banco confirmou:
 *
 *   - 56 limpezas sem validação do líder, a mais antiga de 24/04 (108 dias)
 *   - 4 NCs abertas desde maio/junho, ZERO resoluções registradas
 *
 * E mesmo assim o farol de hoje dizia "Ciclo em dia — nada exigindo ação".
 *
 * Uma não conformidade não some porque virou a data. Ela fica aberta até
 * alguém resolver. Então o farol é de ESTADO: a célula fica acesa enquanto
 * houver pendência, não importa de quando ela é — e mostra a idade, porque
 * uma NC de 60 dias tem que gritar mais alto que a de ontem.
 */

import type { Checklist } from "@/lib/checklist/types";
import type { LimpezaTurno, PtpJanela } from "@/lib/verso/types";
import { planoDoProblema, type OrigemPlano, type PlanoAcao } from "./planos-types";

/**
 * Duas naturezas diferentes, que o papel do gerente já separa e eu tinha
 * misturado:
 *
 *   "validacao" → o líder não planeja nada. Ele VALIDA. É a linha
 *                 "VERIFICAR EXECUÇÃO / VALIDAÇÃO" do papel, e a ação é
 *                 assinar, não abrir plano.
 *
 *   "nc"        → problema concreto num item: item do checklist respondido
 *                 "Não conforme", ou item da limpeza marcado "não realizado".
 *                 É a linha "Itens NC → Plano Ação".
 *
 * Botão de plano de ação numa validação não fazia sentido nenhum.
 */
export type TipoPendencia = "nc" | "validacao";

export interface Pendencia {
  chave: string;
  tipo: TipoPendencia;
  maquina: string;
  momento: string | null;
  turno: string;
  /** Dia em que a pendência nasceu. */
  dataOrigem: string;
  /** Dias em aberto até hoje. */
  idadeDias: number;
  titulo: string;
  /** Linha curta de contexto: seção da limpeza, momento do checklist etc. */
  contexto: string;
  detalhe: string;
  /** Plano de ação vigente, quando já existe. */
  plano: PlanoAcao | null;
  origemTipo: OrigemPlano;
  origemId: string;
  itemNumero: number | null;
}

export function diffDias(de: string, ate: string): number {
  const a = Date.parse(`${de}T00:00:00Z`);
  const b = Date.parse(`${ate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * O plano passou na checagem: foi cumprido E o item saiu da NC.
 *
 * Plano reprovado (`nao_cumprido`) não aprova nada — volta pro vermelho, que
 * é exatamente o "Farol Sim/Não" do papel do gerente.
 */
export function planoAprovado(p: PlanoAcao | null | undefined): boolean {
  if (!p) return false;
  return p.status === "cumprido" && p.checagemSaiuNc === true;
}

/**
 * Este plano encerra ESTA ocorrência?
 *
 * Só encerra o que já existia quando a checagem foi feita. Ocorrência posterior
 * à checagem é reincidência: o plano não a cobre, ela volta a pesar no farol e
 * o grupo aparece como "voltou a acontecer".
 *
 * Sem esse corte por data, aprovar um plano hoje apagaria também as falhas de
 * amanhã — o problema pararia de aparecer na tela sem ter parado na fábrica,
 * que é a única coisa que este farol não pode deixar acontecer.
 */
export function planoEncerraOcorrencia(
  p: PlanoAcao | null | undefined,
  dataOcorrencia: string,
): boolean {
  if (!planoAprovado(p)) return false;
  const checadoEm = p?.checadoEm;
  if (!checadoEm) return false;
  return dataOcorrencia <= checadoEm.slice(0, 10);
}

export interface EntradaPendencias {
  checklists: Checklist[];
  limpezas: LimpezaTurno[];
  ptp?: PtpJanela[];
  planos: PlanoAcao[];
  /** Data de referência para calcular a idade. */
  hoje: string;
  turno?: string | null;
  equipe?: string | null;
  ptpJanelasEsperadas?: ReadonlyArray<string>;
  operadorUserIds?: ReadonlySet<string>;
  /**
   * Inclui também as ocorrências que um plano já encerrou.
   *
   * O farol e as filas usam `false` (o padrão): quem já foi resolvido não é
   * pendência. Mas "avaliar melhorias" precisa do oposto — para dizer que o
   * dispenser de sabão parou de acontecer, é preciso ter as 151 vezes em que
   * ele aconteceu. Medindo só o que está aberto, um problema eliminado some
   * junto com a prova de que foi eliminado, e o "antes" da comparação vira
   * sempre zero.
   */
  incluirEncerradas?: boolean;
}

/** Identidade estável do problema PTP; não depende da ordem do array JSON. */
export function numeroItemPtp(codigo: string): number | null {
  const numeros: Record<string, number> = {
    TAMPA_ALTA: 1,
    ESTOURANDO: 2,
    FINISH_QUEBRANDO: 3,
    NIVEL_BAIXO: 4,
    SEM_TAMPA: 5,
  };
  return numeros[codigo] ?? null;
}

/**
 * Levanta tudo que está em aberto AGORA, de qualquer data.
 *
 * Duas fontes:
 *   1. item do checklist respondido "Não conforme" sem plano concluído
 *   2. limpeza em "aguardando_validacao" — o líder nunca fechou
 */
export function levantarPendencias(e: EntradaPendencias): Pendencia[] {
  const out: Pendencia[] = [];

  for (const c of e.checklists) {
    if (e.turno && c.contexto.turno !== e.turno) continue;
    if (e.equipe && c.contexto.equipe !== e.equipe) continue;
    for (const r of c.respostas) {
      if (r.resposta !== "Não conforme") continue;
      const plano = planoDoProblema(e.planos, "checklist", r.itemNumero, c.contexto.maquina);
      if (!e.incluirEncerradas && planoEncerraOcorrencia(plano, c.contexto.data)) continue;

      out.push({
        chave: `nc:${c.id}:${r.itemNumero}`,
        tipo: "nc",
        maquina: c.contexto.maquina,
        momento: c.momento,
        turno: c.contexto.turno,
        dataOrigem: c.contexto.data,
        idadeDias: diffDias(c.contexto.data, e.hoje),
        titulo: `Checklist · item ${r.itemNumero} — ${r.descricao}`,
        contexto: `${c.momento} · operador ${c.operadorResponsavel ?? c.operador}`,
        detalhe: r.observacao || "sem ação registrada pelo operador",
        plano,
        origemTipo: "checklist",
        origemId: c.id,
        itemNumero: r.itemNumero,
      });
    }

    // O Pós-setup é o fechamento da folha. Se o operador já assinou e a
    // liderança ainda não, existe uma pendência de validação — não um plano
    // de ação. Até aqui o farol cobrava isso apenas para a limpeza e deixava
    // o FM09 aparecer verde sem o segundo aceite.
    if (
      c.momento === "Pós-setup" &&
      c.status === "concluido" &&
      c.assinaturaOperador &&
      !c.assinaturaLider
    ) {
      out.push({
        chave: `val-checklist:${c.id}`,
        tipo: "validacao",
        maquina: c.contexto.maquina,
        momento: c.momento,
        turno: c.contexto.turno,
        dataOrigem: c.contexto.data,
        idadeDias: diffDias(c.contexto.data, e.hoje),
        titulo: `Checklist operacional · fechamento ${c.contexto.turno}`,
        contexto: `${c.momento} · ${c.respostas.length} itens verificados`,
        detalhe: `${c.assinaturaOperador.nome} assinou. Falta a validação da liderança para fechar a folha.`,
        plano: null,
        origemTipo: "checklist",
        origemId: c.id,
        itemNumero: null,
      });
    }
  }

  for (const l of e.limpezas) {
    if (e.turno && l.turno !== e.turno) continue;
    if (e.operadorUserIds && (!l.operadorUserId || !e.operadorUserIds.has(l.operadorUserId))) {
      continue;
    }
    // 2a. Itens da limpeza marcados "não realizado" — problema concreto,
    //     precisa de plano de ação igual à NC do checklist.
    for (const item of l.itens ?? []) {
      if (item.status !== "nao_realizado") continue;
      const plano = planoDoProblema(e.planos, "limpeza", item.codigo, l.maquina ?? "Enchedora 3");
      if (!e.incluirEncerradas && planoEncerraOcorrencia(plano, l.dataOperacao)) continue;

      out.push({
        chave: `nr:${l.id}:${item.codigo}`,
        tipo: "nc",
        maquina: l.maquina ?? "Enchedora 3",
        momento: null,
        turno: l.turno,
        dataOrigem: l.dataOperacao,
        idadeDias: diffDias(l.dataOperacao, e.hoje),
        titulo: `Limpeza · item ${item.codigo} — ${item.descricao}`,
        contexto: `${item.grupo} · ${item.secao}`,
        detalhe: (item.observacao ?? "").trim() || "sem observação do operador",
        plano,
        origemTipo: "limpeza",
        origemId: l.id,
        itemNumero: item.codigo,
      });
    }

    // 2b. O turno inteiro aguardando a assinatura do líder.
    //     Aqui não há o que planejar — há o que assinar.
    if (l.status !== "aguardando_validacao") continue;

    const totalItens = (l.itens ?? []).length;
    const naoRealizados = (l.itens ?? []).filter((i) => i.status === "nao_realizado").length;

    out.push({
      chave: `val:${l.id}`,
      tipo: "validacao",
      maquina: l.maquina ?? "Enchedora 3",
      momento: null,
      turno: l.turno,
      dataOrigem: l.dataOperacao,
      idadeDias: diffDias(l.dataOperacao, e.hoje),
      titulo: `Limpeza da sala de envase · ${l.turno}`,
      contexto: `${totalItens} itens verificados${
        naoRealizados > 0 ? ` · ${naoRealizados} não realizado(s)` : " · todos realizados"
      }`,
      detalhe: l.operadorNome
        ? `${l.operadorNome} assinou${
            l.operadorAssinouEm
              ? ` em ${l.operadorAssinouEm.slice(0, 10).split("-").reverse().join("/")}`
              : ""
          }. Falta a sua assinatura para fechar o turno.`
        : "Operador assinou. Falta a sua assinatura para fechar o turno.",
      plano: null,
      origemTipo: "limpeza",
      origemId: l.id,
      itemNumero: null,
    });
  }

  const janelasEsperadas =
    e.ptpJanelasEsperadas && e.ptpJanelasEsperadas.length > 0
      ? new Set(e.ptpJanelasEsperadas)
      : null;
  for (const p of e.ptp ?? []) {
    if (janelasEsperadas && !janelasEsperadas.has(p.janelaCodigo)) continue;
    if (e.operadorUserIds && (!p.operadorUserId || !e.operadorUserIds.has(p.operadorUserId))) {
      continue;
    }
    if (p.statusJanela !== "houve_ocorrencia") continue;

    for (const item of p.itens ?? []) {
      if ((item.quantidade ?? 0) <= 0) continue;
      const itemNumero = numeroItemPtp(item.codigo);
      if (itemNumero == null) continue;
      const plano = planoDoProblema(e.planos, "ptp", itemNumero, p.maquina);
      if (!e.incluirEncerradas && planoEncerraOcorrencia(plano, p.dataOperacao)) continue;

      out.push({
        chave: `ptp:${p.id}:${item.codigo}`,
        tipo: "nc",
        maquina: p.maquina,
        momento: null,
        turno: e.turno ?? (Number(p.janelaCodigo.slice(1)) <= 6 ? "12x36 Dia" : "12x36 Noite"),
        dataOrigem: p.dataOperacao,
        idadeDias: diffDias(p.dataOperacao, e.hoje),
        titulo: `PTP · ${item.nome}`,
        contexto: `Janela ${p.janelaCodigo} · ${p.janelaInicio}–${p.janelaFim}`,
        detalhe:
          `${item.quantidade} ocorrência(s)` +
          ((p.observacao ?? "").trim() ? ` · ${p.observacao!.trim()}` : ""),
        plano,
        origemTipo: "ptp",
        origemId: p.id,
        itemNumero,
      });
    }
  }

  // Mais velha primeiro: é a que envergonha e a que tem que sair.
  return out.sort((a, b) => b.idadeDias - a.idadeDias);
}

/** Faixa de envelhecimento — o aging que um black belt procura primeiro. */
export type FaixaIdade = "hoje" | "ate7" | "ate30" | "acima30";

export function faixaIdade(dias: number): FaixaIdade {
  if (dias <= 0) return "hoje";
  if (dias <= 7) return "ate7";
  if (dias <= 30) return "ate30";
  return "acima30";
}

export const ROTULO_FAIXA: Record<FaixaIdade, string> = {
  hoje: "Hoje",
  ate7: "Até 7 dias",
  ate30: "8 a 30 dias",
  acima30: "Mais de 30 dias",
};

export function agruparPorIdade(p: Pendencia[]): Array<{
  faixa: FaixaIdade;
  rotulo: string;
  qtd: number;
}> {
  const ordem: FaixaIdade[] = ["acima30", "ate30", "ate7", "hoje"];
  const c = new Map<FaixaIdade, number>();
  for (const x of p) c.set(faixaIdade(x.idadeDias), (c.get(faixaIdade(x.idadeDias)) ?? 0) + 1);
  return ordem
    .filter((f) => (c.get(f) ?? 0) > 0)
    .map((f) => ({ faixa: f, rotulo: ROTULO_FAIXA[f], qtd: c.get(f) ?? 0 }));
}
