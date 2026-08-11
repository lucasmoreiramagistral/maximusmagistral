/**
 * PENDÊNCIAS ABERTAS — agrupadas por item, em duas filas.
 *
 * Duas correções que vieram de olhar a tela com dado real:
 *
 * 1. Uma lista só, misturando "validação" e "item não conforme", com botão
 *    "Abrir plano de ação" nos dois. Não se planeja uma validação — o líder
 *    valida. O papel já separa: "VERIFICAR EXECUÇÃO / VALIDAÇÃO" e
 *    "Itens NC → Plano Ação".
 *
 * 2. Uma linha por ocorrência dava 426 linhas. Quase tudo era o mesmo item
 *    repetido. Agora é uma linha por PROBLEMA, com a contagem de vezes.
 *    Um plano resolve o grupo; quando for checado, o grupo inteiro sai.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Pendencia } from "@/lib/farol/pendencias";
import {
  agruparPendencias,
  ocorrenciaRepresentante,
  type GrupoPendencia,
} from "@/lib/farol/grupos";
import { etapaDoPlano, type PlanoAcao } from "@/lib/farol/planos-types";
import { formatarDataBR } from "@/lib/operacao/data-operacional";

const COR_FAIXA: Record<string, string> = {
  acima30: "border-destructive bg-destructive-soft text-destructive",
  ate30: "border-warning/50 bg-warning/15 text-warning-foreground",
  ate7: "border-primary/40 bg-primary-soft text-primary",
  hoje: "border-border bg-muted text-muted-foreground",
};

export function PendenciasAbertas({
  pendencias,
  planos,
  onAbrirPlano,
  onValidar,
  modo = "completo",
}: {
  pendencias: Pendencia[];
  planos: PlanoAcao[];
  onAbrirPlano?: (p: Pendencia) => void;
  onValidar?: (p: Pendencia) => void;
  /**
   * "completo"  — líder e Sup/Coord: a fila inteira, porque são eles que agem
   *               em cada linha.
   * "executivo" — Gestão Industrial: só o que exige decisão dela, e o resto
   *               atrás de um botão.
   *
   * A GI recebia as 55 validações uma embaixo da outra, cada uma com os 21
   * itens descritos. Rolar 55 cartões é trabalho do líder; o gerente precisa
   * ver onde está o vermelho e quem é o próximo responsável. Uma tela que
   * exige rolagem para achar o problema é uma tela que não vai ser olhada — e
   * o farol já morreu uma vez por isso.
   */
  modo?: "completo" | "executivo";
}) {
  const grupos = agruparPendencias(pendencias, planos);
  const validacoes = grupos.filter((g) => g.tipo === "validacao");
  const problemas = grupos.filter((g) => g.tipo === "nc");
  const executivo = modo === "executivo";

  return (
    <>
      {executivo ? (
        <ResumoValidacoes grupos={validacoes} />
      ) : (
        <Fila
          titulo="Aguardando a sua validação"
          subtitulo="O operador fechou e assinou. Falta você conferir e assinar."
          vazio="Nada aguardando validação."
          grupos={validacoes}
          // Validação é por turno: cada ocorrência é uma folha diferente,
          // então esta fila mostra as ocorrências, não o grupo.
          expandirSempre
          acao={
            onValidar ? { rotulo: () => "Validar", onClick: onValidar, cor: "warning" } : undefined
          }
        />
      )}

      <Fila
        titulo={
          executivo
            ? "Problemas que ninguém assumiu"
            : "Itens fora do padrão — precisam de plano de ação"
        }
        subtitulo={
          executivo
            ? "Agrupados por causa. O que aparece aqui é o que a liderança ainda não transformou em plano."
            : "Um item recorrente é um problema só. Resolver é eliminar a causa, não tratar cada ocorrência."
        }
        vazio="Nenhum item fora do padrão em aberto."
        grupos={problemas}
        // A GI vê os cinco piores; a ordem já é reincidência → mais frequente
        // → mais antigo, então os cinco primeiros são de fato os que importam.
        limite={executivo ? 5 : undefined}
        acao={
          onAbrirPlano
            ? {
                rotulo: (g: GrupoPendencia) =>
                  !g.plano
                    ? "Abrir plano de ação"
                    : g.plano.status === "nao_cumprido" || g.reincidiuAposPlano
                      ? "Replanejar"
                      : "Checar resultado",
                onClick: (p) => onAbrirPlano(p),
                cor: "primary",
              }
            : undefined
        }
      />
    </>
  );
}

interface Acao {
  rotulo: (g: GrupoPendencia) => string;
  onClick: (p: Pendencia) => void;
  cor: "primary" | "warning";
}

/**
 * O que a GI precisa saber sobre validação: quantas, há quanto tempo, e que
 * a cobrança é do líder — não dela. Sem os 55 cartões.
 */
function ResumoValidacoes({ grupos }: { grupos: GrupoPendencia[] }) {
  const [aberto, setAberto] = useState(false);
  const total = grupos.reduce((s, g) => s + g.qtd, 0);
  const idade = grupos.reduce((m, g) => Math.max(m, g.idadeMaxDias), 0);

  if (total === 0) {
    return (
      <section className="mt-8" aria-label="Validações do líder">
        <p className="rounded-xl border border-success/40 bg-success-soft p-4 text-sm font-semibold text-success">
          Nenhum turno esperando validação do líder.
        </p>
      </section>
    );
  }

  const ocorrencias = grupos.flatMap((g) => g.ocorrencias);

  return (
    <section className="mt-8" aria-label="Validações do líder">
      <div className="rounded-2xl border-2 border-destructive/40 bg-destructive-soft/40 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-destructive text-destructive-foreground">
            <span className="text-2xl font-black leading-none">{total}</span>
            <span className="text-[9px] font-bold opacity-90">turnos</span>
          </span>
          <div className="min-w-[240px] flex-1">
            <p className="text-lg font-black text-foreground">Validações que o líder não fechou</p>
            <p className="text-sm text-muted-foreground">
              A mais antiga há <b className="text-destructive">{idade} dias</b>. Quem assina é o
              líder — aqui isto é cobrança de rotina, não tarefa da GI.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold hover:bg-accent"
            aria-expanded={aberto}
          >
            {aberto ? "Ocultar lista" : `Ver os ${total}`}
          </button>
        </div>

        {aberto && (
          <ul className="mt-4 max-h-96 space-y-1.5 overflow-y-auto border-t border-destructive/20 pt-4">
            {ocorrencias.map((o) => (
              <li
                key={o.chave}
                className="flex flex-wrap items-center gap-3 rounded-lg bg-card px-3 py-2 text-sm"
              >
                <span className="w-14 shrink-0 font-black text-destructive">{o.idadeDias}d</span>
                <span className="flex-1 font-semibold text-foreground">{o.titulo}</span>
                <span className="text-xs text-muted-foreground">
                  {formatarDataBR(o.dataOrigem)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Fila({
  titulo,
  subtitulo,
  vazio,
  grupos,
  acao,
  expandirSempre,
  limite,
}: {
  titulo: string;
  subtitulo: string;
  vazio: string;
  grupos: GrupoPendencia[];
  acao?: Acao;
  expandirSempre?: boolean;
  /** Mostra só os N primeiros, com botão para abrir o resto. */
  limite?: number;
}) {
  const [verTodos, setVerTodos] = useState(false);
  const totalOcorrencias = grupos.reduce((s, g) => s + g.qtd, 0);
  const cortar = !!limite && !verTodos && grupos.length > limite;
  const visiveis = cortar ? grupos.slice(0, limite) : grupos;

  return (
    <section className="mt-8" aria-label={titulo}>
      <div className="mb-3">
        <h3 className="text-2xl font-black tracking-tight text-foreground">
          {titulo}
          {grupos.length > 0 && (
            <span className="ml-2 rounded-full bg-destructive px-3 py-0.5 align-middle text-base font-black text-destructive-foreground">
              {expandirSempre ? totalOcorrencias : grupos.length}
            </span>
          )}
        </h3>
        <p className="text-sm text-muted-foreground">
          {subtitulo}
          {!expandirSempre && grupos.length > 0 && (
            <>
              {" "}
              <b className="text-foreground">
                {grupos.length} {grupos.length === 1 ? "problema" : "problemas"} em{" "}
                {totalOcorrencias} ocorrências.
              </b>
            </>
          )}
        </p>
      </div>

      {grupos.length === 0 ? (
        <p className="rounded-xl border border-success/40 bg-success-soft p-4 text-sm font-semibold text-success">
          {vazio}
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {expandirSempre
              ? visiveis.flatMap((g) =>
                  g.ocorrencias.map((o) => (
                    <LinhaOcorrencia key={o.chave} p={o} acao={acao} grupo={g} />
                  )),
                )
              : visiveis.map((g) => <LinhaGrupo key={g.chave} g={g} acao={acao} />)}
          </ul>
          {cortar && (
            <button
              type="button"
              onClick={() => setVerTodos(true)}
              className="mt-3 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold text-foreground hover:bg-accent"
            >
              Ver os outros {grupos.length - limite!} problemas
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** Linha do PROBLEMA — uma por item, com a contagem de ocorrências. */
function LinhaGrupo({ g, acao }: { g: GrupoPendencia; acao?: Acao }) {
  const [aberto, setAberto] = useState(false);

  return (
    <li
      className={cn(
        "rounded-xl border-2 p-4",
        g.reincidiuAposPlano
          ? "border-destructive bg-destructive-soft/60"
          : g.faixa === "acima30"
            ? "border-destructive/50 bg-destructive-soft/40"
            : "border-border bg-card",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-lg font-black leading-none",
            COR_FAIXA[g.faixa],
          )}
          title={`${g.qtd} ocorrências`}
        >
          <span className="text-lg">{g.qtd}×</span>
          <span className="text-[9px] font-bold opacity-80">vezes</span>
        </span>

        <div className="min-w-[240px] flex-1">
          <p className="font-bold leading-snug text-foreground">{g.titulo}</p>
          <p className="text-xs font-medium text-muted-foreground">{g.contexto}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {g.maquina} · {g.turnos.join(" e ")} · de {formatarDataBR(g.primeiraData)} a{" "}
            {formatarDataBR(g.ultimaData)} · mais antiga há{" "}
            <b className={g.idadeMaxDias > 30 ? "text-destructive" : undefined}>
              {g.idadeMaxDias} dias
            </b>
          </p>

          {g.reincidiuAposPlano && (
            <p className="mt-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground">
              Voltou a acontecer depois do plano aprovado — a causa não foi eliminada.
            </p>
          )}

          {g.plano && (
            <div className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-warning-foreground">
                Plano de ação
              </p>
              <p className="text-sm font-semibold text-foreground">{g.plano.oQue}</p>
              <p className="text-xs text-muted-foreground">
                {g.plano.quem} · prazo {formatarDataBR(g.plano.quando)}
                {g.plano.status === "nao_cumprido" && (
                  <b className="text-destructive"> · não cumprido, replanejar</b>
                )}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="mt-2 text-xs font-bold text-primary underline-offset-2 hover:underline"
          >
            {aberto ? "Ocultar" : `Ver as ${g.qtd} ocorrências`}
          </button>

          {aberto && (
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2">
              {g.ocorrencias.map((o) => (
                <li key={o.chave} className="text-xs text-muted-foreground">
                  <b className="text-foreground">{formatarDataBR(o.dataOrigem)}</b> · {o.turno}
                  {o.detalhe && ` · ${o.detalhe}`}
                </li>
              ))}
            </ul>
          )}
        </div>

        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground"
          title="Etapa do PDCA em que está parado"
        >
          {etapaDoPlano(g.plano)}
        </span>

        {acao && (
          <button
            type="button"
            onClick={() => acao.onClick(ocorrenciaRepresentante(g))}
            className={cn(
              "shrink-0 rounded-lg px-4 py-2.5 text-sm font-bold hover:brightness-110",
              acao.cor === "warning"
                ? "bg-warning text-warning-foreground"
                : "bg-primary text-primary-foreground",
            )}
          >
            {acao.rotulo(g)}
          </button>
        )}
      </div>
    </li>
  );
}

/** Linha de OCORRÊNCIA — usada na fila de validação, que é por turno. */
function LinhaOcorrencia({ p, acao, grupo }: { p: Pendencia; acao?: Acao; grupo: GrupoPendencia }) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border-2 p-4",
        p.idadeDias > 30 ? "border-destructive/50 bg-destructive-soft/40" : "border-border bg-card",
      )}
    >
      <span
        className={cn(
          "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg font-black leading-none",
          COR_FAIXA[p.idadeDias > 30 ? "acima30" : p.idadeDias > 7 ? "ate30" : "ate7"],
        )}
      >
        <span className="text-lg">{p.idadeDias}</span>
        <span className="text-[9px] font-bold opacity-80">
          {p.idadeDias === 1 ? "dia" : "dias"}
        </span>
      </span>

      <div className="min-w-[240px] flex-1">
        <p className="font-bold leading-snug text-foreground">{p.titulo}</p>
        <p className="text-xs font-medium text-muted-foreground">{p.contexto}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {p.maquina} · desde {formatarDataBR(p.dataOrigem)}
        </p>
        <p className="mt-1.5 text-sm text-foreground/80">{p.detalhe}</p>
      </div>

      {acao && (
        <button
          type="button"
          onClick={() => acao.onClick(p)}
          className={cn(
            "shrink-0 rounded-lg px-4 py-2.5 text-sm font-bold hover:brightness-110",
            acao.cor === "warning"
              ? "bg-warning text-warning-foreground"
              : "bg-primary text-primary-foreground",
          )}
        >
          {acao.rotulo(grupo)}
        </button>
      )}
    </li>
  );
}
