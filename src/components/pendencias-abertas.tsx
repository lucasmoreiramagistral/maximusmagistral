/**
 * PENDÊNCIAS ABERTAS — duas filas, porque são duas naturezas.
 *
 * Eu tinha feito uma lista só, e o Lucas apontou: aparecia "sem validação"
 * com botão "Abrir plano de ação". Não faz sentido planejar uma validação —
 * o líder simplesmente valida.
 *
 * O papel do gerente já separa as duas linhas:
 *   "VERIFICAR EXECUÇÃO / VALIDAÇÃO"  → fila 1, ação = validar
 *   "Itens NC → Plano Ação"           → fila 2, ação = planejar
 *
 * E em toda linha o item aparece por extenso: o líder tem que saber o que é
 * sem precisar abrir nada.
 */

import { cn } from "@/lib/utils";
import { faixaIdade, type Pendencia } from "@/lib/farol/pendencias";
import { etapaDoPlano } from "@/lib/farol/planos-types";
import { formatarDataBR } from "@/lib/operacao/data-operacional";

const COR_FAIXA: Record<string, string> = {
  acima30: "border-destructive bg-destructive-soft text-destructive",
  ate30: "border-warning/50 bg-warning/15 text-warning-foreground",
  ate7: "border-primary/40 bg-primary-soft text-primary",
  hoje: "border-border bg-muted text-muted-foreground",
};

export function PendenciasAbertas({
  pendencias,
  onAbrirPlano,
  onValidar,
}: {
  pendencias: Pendencia[];
  onAbrirPlano?: (p: Pendencia) => void;
  onValidar?: (p: Pendencia) => void;
}) {
  const validacoes = pendencias.filter((p) => p.tipo === "validacao");
  const problemas = pendencias.filter((p) => p.tipo === "nc");

  return (
    <>
      <Fila
        titulo="Aguardando a sua validação"
        subtitulo="O operador fechou e assinou. Falta você conferir e assinar."
        vazio="Nada aguardando validação."
        itens={validacoes}
        acao={
          onValidar
            ? { rotulo: () => "Validar", onClick: onValidar, cor: "warning" as const }
            : undefined
        }
      />

      <Fila
        titulo="Itens fora do padrão — precisam de plano de ação"
        subtitulo="Não conformidade do checklist e item de limpeza não realizado."
        vazio="Nenhum item fora do padrão em aberto."
        itens={problemas}
        acao={
          onAbrirPlano
            ? {
                rotulo: (p: Pendencia) =>
                  !p.plano
                    ? "Abrir plano de ação"
                    : p.plano.status === "nao_cumprido"
                      ? "Replanejar"
                      : "Checar resultado",
                onClick: onAbrirPlano,
                cor: "primary" as const,
              }
            : undefined
        }
      />
    </>
  );
}

function Fila({
  titulo,
  subtitulo,
  vazio,
  itens,
  acao,
}: {
  titulo: string;
  subtitulo: string;
  vazio: string;
  itens: Pendencia[];
  acao?: {
    rotulo: (p: Pendencia) => string;
    onClick: (p: Pendencia) => void;
    cor: "primary" | "warning";
  };
}) {
  const maisVelha = itens[0];

  return (
    <section className="mt-8" aria-label={titulo}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-2xl font-black tracking-tight text-foreground">
            {titulo}
            {itens.length > 0 && (
              <span className="ml-2 rounded-full bg-destructive px-3 py-0.5 align-middle text-base font-black text-destructive-foreground">
                {itens.length}
              </span>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">{subtitulo}</p>
        </div>
      </div>

      {itens.length === 0 ? (
        <p className="rounded-xl border border-success/40 bg-success-soft p-4 text-sm font-semibold text-success">
          {vazio}
        </p>
      ) : (
        <>
          {maisVelha.idadeDias > 30 && (
            <div className="mb-3 rounded-xl border-2 border-destructive bg-destructive-soft px-4 py-3">
              <p className="text-sm font-bold text-destructive">
                A mais antiga está aberta há {maisVelha.idadeDias} dias — desde{" "}
                {formatarDataBR(maisVelha.dataOrigem)}.
              </p>
            </div>
          )}

          <ul className="space-y-2">
            {itens.map((p) => (
              <ItemPendencia key={p.chave} p={p} acao={acao} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ItemPendencia({
  p,
  acao,
}: {
  p: Pendencia;
  acao?: {
    rotulo: (p: Pendencia) => string;
    onClick: (p: Pendencia) => void;
    cor: "primary" | "warning";
  };
}) {
  const faixa = faixaIdade(p.idadeDias);

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border-2 p-4",
        faixa === "acima30"
          ? "border-destructive/50 bg-destructive-soft/40"
          : "border-border bg-card",
      )}
    >
      <span
        className={cn(
          "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg font-black leading-none",
          COR_FAIXA[faixa],
        )}
        title={`Aberta há ${p.idadeDias} dias`}
      >
        <span className="text-lg">{p.idadeDias}</span>
        <span className="text-[9px] font-bold opacity-80">
          {p.idadeDias === 1 ? "dia" : "dias"}
        </span>
      </span>

      <div className="min-w-[240px] flex-1">
        {/* O QUE É — sempre por extenso, sem precisar abrir nada. */}
        <p className="font-bold leading-snug text-foreground">{p.titulo}</p>
        <p className="text-xs font-medium text-muted-foreground">{p.contexto}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {p.maquina} · {p.turno} · desde {formatarDataBR(p.dataOrigem)}
        </p>
        <p className="mt-1.5 text-sm text-foreground/80">{p.detalhe}</p>

        {p.plano && (
          <div className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-warning-foreground">
              Plano de ação
            </p>
            <p className="text-sm font-semibold text-foreground">{p.plano.oQue}</p>
            <p className="text-xs text-muted-foreground">
              {p.plano.quem} · prazo {formatarDataBR(p.plano.quando)}
              {p.plano.status === "nao_cumprido" && (
                <b className="text-destructive"> · não cumprido, replanejar</b>
              )}
            </p>
          </div>
        )}
      </div>

      {p.tipo === "nc" && (
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground"
          title="Etapa do PDCA em que está parado"
        >
          {etapaDoPlano(p.plano)}
        </span>
      )}

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
          {acao.rotulo(p)}
        </button>
      )}
    </li>
  );
}
