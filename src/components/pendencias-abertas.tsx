/**
 * PENDÊNCIAS ABERTAS — o passivo, com aging.
 *
 * "O farol é você conseguir enxergar o que tem que ser resolvido e como tá
 * a situação atual da fábrica." O farol acima responde a segunda parte; esta
 * lista responde a primeira.
 *
 * Mais velha primeiro, de propósito: é a que envergonha e a que tem que sair.
 */

import { cn } from "@/lib/utils";
import { agruparPorIdade, faixaIdade, type Pendencia } from "@/lib/farol/pendencias";
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
}: {
  pendencias: Pendencia[];
  onAbrirPlano?: (p: Pendencia) => void;
}) {
  if (pendencias.length === 0) {
    return (
      <section className="mt-8">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Pendências abertas
        </h3>
        <p className="mt-2 rounded-xl border border-success/40 bg-success-soft p-4 text-sm font-semibold text-success">
          Nenhuma pendência em aberto. Nada arrastando.
        </p>
      </section>
    );
  }

  const faixas = agruparPorIdade(pendencias);
  const maisVelha = pendencias[0];

  return (
    <section className="mt-8" aria-label="Pendências abertas">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-2xl font-black tracking-tight text-foreground">
            Pendências abertas
          </h3>
          <p className="text-sm text-muted-foreground">
            De qualquer data — só saem quando forem resolvidas
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {faixas.map((f) => (
            <span
              key={f.faixa}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-bold",
                COR_FAIXA[f.faixa],
              )}
            >
              {f.rotulo}: {f.qtd}
            </span>
          ))}
        </div>
      </div>

      {maisVelha.idadeDias > 30 && (
        <div className="mb-3 rounded-xl border-2 border-destructive bg-destructive-soft px-4 py-3">
          <p className="text-sm font-bold text-destructive">
            A mais antiga está aberta há {maisVelha.idadeDias} dias — desde{" "}
            {formatarDataBR(maisVelha.dataOrigem)}.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {pendencias.map((p) => {
          const faixa = faixaIdade(p.idadeDias);
          const etapa = etapaDoPlano(p.plano);
          return (
            <li
              key={p.chave}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-xl border-2 p-4",
                faixa === "acima30"
                  ? "border-destructive/50 bg-destructive-soft/40"
                  : "border-border bg-card",
              )}
            >
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg text-xs font-black leading-none",
                  COR_FAIXA[faixa],
                )}
                title={`Aberta há ${p.idadeDias} dias`}
              >
                <span className="text-base">{p.idadeDias}</span>
                <span className="text-[9px] font-bold opacity-80">dias</span>
              </span>

              <div className="min-w-[220px] flex-1">
                <p className="font-bold text-foreground">{p.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {p.maquina} · {p.turno} · desde {formatarDataBR(p.dataOrigem)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{p.detalhe}</p>
                {p.plano && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Plano: <b className="text-foreground">{p.plano.oQue}</b> ·{" "}
                    {p.plano.quem} · prazo {formatarDataBR(p.plano.quando)}
                    {p.plano.status === "nao_cumprido" && (
                      <b className="text-destructive"> · não cumprido, replanejar</b>
                    )}
                  </p>
                )}
              </div>

              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
                {etapa}
              </span>

              {onAbrirPlano && (
                <button
                  type="button"
                  onClick={() => onAbrirPlano(p)}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
                >
                  {p.plano && p.plano.status !== "nao_cumprido"
                    ? "Checar"
                    : p.plano
                      ? "Replanejar"
                      : "Abrir plano de ação"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
