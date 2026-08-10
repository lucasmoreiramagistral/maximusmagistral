import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Farol } from "@/components/farol";
import { TelaCarregando } from "@/components/tela-carregando";
import { useGuard } from "@/hooks/use-guard";
import { useChecklistsRemote } from "@/hooks/use-storage";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  calcularCumprimentoPeriodo,
  montarFarol,
  type CumprimentoPeriodo,
} from "@/lib/farol/farol";
import { calcularDataOperacional, formatarDataBR } from "@/lib/operacao/data-operacional";
import { limpezaTurnoFromRow, type LimpezaTurnoRow } from "@/lib/verso/mappers";
import type { LimpezaTurno } from "@/lib/verso/types";

export const Route = createFileRoute("/supervisor/")({
  head: () => ({
    meta: [
      { title: "Farol Gerencial — Supervisão" },
      {
        name: "description",
        content:
          "Cumprimento da rotina do operador e do líder, e o farol para apresentar à Gestão Industrial.",
      },
    ],
  }),
  component: SupervisorHome,
});

const PERIODOS = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 15, rotulo: "15 dias" },
  { dias: 30, rotulo: "30 dias" },
] as const;

function somarDias(data: string, passos: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + passos);
  return d.toISOString().slice(0, 10);
}

function SupervisorHome() {
  const { usuario, loading } = useGuard("supervisor");
  const { data: checklists, loading: carregando } = useChecklistsRemote({ realtime: true });

  const [limpezas, setLimpezas] = useState<LimpezaTurno[]>([]);
  const [janela, setJanela] = useState<number>(7);

  const hoje = useMemo(
    () => calcularDataOperacional(usuario?.equipePadrao, usuario?.turnoPadrao),
    [usuario?.equipePadrao, usuario?.turnoPadrao],
  );
  const de = useMemo(() => somarDias(hoje, -(janela - 1)), [hoje, janela]);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const { data: linhas, error } = await supabase
        .from("limpeza_turnos" as never)
        .select("*")
        .gte("data_operacao", de);
      if (cancelado) return;
      if (error) {
        console.error("[supervisor] limpezas:", error);
        return;
      }
      setLimpezas(((linhas ?? []) as unknown as LimpezaTurnoRow[]).map(limpezaTurnoFromRow));
    })();
    return () => {
      cancelado = true;
    };
  }, [de]);

  const cumprimento = useMemo(
    () => calcularCumprimentoPeriodo(checklists, limpezas, de, hoje),
    [checklists, limpezas, de, hoje],
  );

  const farolHoje = useMemo(
    () => montarFarol({ checklists, limpezas, data: hoje, hoje }),
    [checklists, limpezas, hoje],
  );

  if (loading || !usuario) return <TelaCarregando />;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Supervisão / Coordenação"
        subtitulo={`Linha 3 · cumprimento da rotina · ${formatarDataBR(de)} a ${formatarDataBR(hoje)}`}
      />
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <>
            <Farol linhas={farolHoje} data={hoje} />

            <section className="mt-10" aria-label="Cumprimento da rotina">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-black tracking-tight text-foreground">
                    Cumprimento da rotina
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Operador e líder · o que era esperado contra o que foi feito
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {PERIODOS.map((p) => (
                    <button
                      key={p.dias}
                      type="button"
                      onClick={() => setJanela(p.dias)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm font-semibold",
                        janela === p.dias
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:bg-accent",
                      )}
                    >
                      {p.rotulo}
                    </button>
                  ))}
                </div>
              </div>

              <PainelCumprimento c={cumprimento} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function PainelCumprimento({ c }: { c: CumprimentoPeriodo }) {
  const maxEsperado = Math.max(1, ...c.dias.map((d) => d.esperado));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao
          rotulo="Cumprimento geral"
          valor={`${c.percentualGeral}%`}
          nota={`${c.totalRealizado} de ${c.totalEsperado} verificações`}
          tom={c.percentualGeral >= 90 ? "bom" : c.percentualGeral >= 70 ? "atencao" : "ruim"}
        />
        <Cartao
          rotulo="Não realizado"
          valor={c.totalEsperado - c.totalRealizado}
          nota="checklist que faltou"
          tom={c.totalEsperado - c.totalRealizado > 0 ? "ruim" : "bom"}
        />
        <Cartao
          rotulo="Sem validação do líder"
          valor={c.limpezasSemValidacao}
          nota="limpezas que o líder não fechou"
          tom={c.limpezasSemValidacao > 0 ? "ruim" : "bom"}
        />
        <Cartao
          rotulo="Dias sem produção"
          valor={c.diasSemNada}
          nota="fora da conta de cumprimento"
          tom="neutro"
        />
      </div>

      {c.porTurno.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Por turno — pior primeiro
          </h4>
          <div className="mt-2 space-y-2">
            {c.porTurno.map((t) => (
              <div
                key={t.turno}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <span className="w-32 shrink-0 text-sm font-bold text-foreground">
                  {t.turno}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      t.percentual >= 90
                        ? "bg-success"
                        : t.percentual >= 70
                          ? "bg-warning"
                          : "bg-destructive",
                    )}
                    style={{ width: `${t.percentual}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-sm text-muted-foreground">
                  <b className="text-foreground">{t.percentual}%</b> · {t.realizado}/
                  {t.esperado}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Dia a dia
        </h4>
        <div className="mt-2 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 text-left font-bold">Dia</th>
                <th className="px-3 py-2 text-right font-bold">Feito</th>
                <th className="px-3 py-2 text-right font-bold">Esperado</th>
                <th className="px-3 py-2 text-right font-bold">%</th>
                <th className="px-4 py-2 text-left font-bold">Validação</th>
              </tr>
            </thead>
            <tbody>
              {[...c.dias].reverse().map((d) => (
                <tr key={d.data} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-semibold">{formatarDataBR(d.data)}</td>
                  <td className="px-3 py-2 text-right">{d.realizado}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {d.esperado || "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-bold",
                      d.esperado === 0
                        ? "text-muted-foreground"
                        : d.percentual >= 90
                          ? "text-success"
                          : d.percentual >= 70
                            ? "text-warning-foreground"
                            : "text-destructive",
                    )}
                  >
                    {d.esperado === 0 ? "—" : `${d.percentual}%`}
                  </td>
                  <td className="px-4 py-2">
                    {d.limpezasSemValidacao > 0 ? (
                      <span className="rounded-full border border-destructive/40 bg-destructive-soft px-2 py-0.5 text-xs font-bold text-destructive">
                        {d.limpezasSemValidacao} sem validação
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">ok</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Dia com esperado <b>—</b> é dia sem produção: fica fora da conta em vez de contar
          como rotina não cumprida. O gráfico usa {maxEsperado} como referência de dia cheio.
        </p>
      </div>
    </>
  );
}

function Cartao({
  rotulo,
  valor,
  nota,
  tom,
}: {
  rotulo: string;
  valor: number | string;
  nota: string;
  tom: "bom" | "atencao" | "ruim" | "neutro";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          "mt-1 text-3xl font-black tracking-tight",
          tom === "ruim" && "text-destructive",
          tom === "atencao" && "text-warning-foreground",
          tom === "bom" && "text-success",
          tom === "neutro" && "text-foreground",
        )}
      >
        {valor}
      </p>
      <p className="text-xs text-muted-foreground">{nota}</p>
    </div>
  );
}
