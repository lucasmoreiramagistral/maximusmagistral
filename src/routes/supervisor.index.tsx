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
  ROTINA_ENCHEDORA_3,
  montarFarol,
  type CumprimentoPeriodo,
} from "@/lib/farol/farol";
import { levantarPendencias } from "@/lib/farol/pendencias";
import { buscarPlanos } from "@/lib/farol/planos-storage";
import type { PlanoAcao } from "@/lib/farol/planos-types";
import { PendenciasAbertas } from "@/components/pendencias-abertas";
import { MelhoriasERotina } from "@/components/melhorias-rotina";
import { PainelContingencias } from "@/components/painel-contingencias";
import { agruparPendencias } from "@/lib/farol/grupos";
import { avaliarMelhorias, avaliarRotinaLideranca } from "@/lib/farol/eficacia";
import { PlanoAcaoDialog } from "@/components/plano-acao-dialog";
import type { Pendencia } from "@/lib/farol/pendencias";
import { calcularDataOperacional, formatarDataBR } from "@/lib/operacao/data-operacional";
import {
  limpezaTurnoFromRow,
  ptpJanelaFromRow,
  type LimpezaTurnoRow,
  type PtpJanelaRow,
} from "@/lib/verso/mappers";
import type { LimpezaTurno, PtpJanela } from "@/lib/verso/types";

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
  const {
    data: checklists,
    loading: carregando,
    error: erroChecklists,
  } = useChecklistsRemote({ realtime: true });

  const [limpezas, setLimpezas] = useState<LimpezaTurno[]>([]);
  const [janela, setJanela] = useState<number>(7);
  const [planos, setPlanos] = useState<PlanoAcao[]>([]);
  const [pendenciaAberta, setPendenciaAberta] = useState<Pendencia | null>(null);
  const [recarga, setRecarga] = useState(0);

  // Ver o comentário em lider.index.tsx: sem estes dois, o gate cobre só os
  // checklists e as filas aparecem vazias antes de limpezas e planos chegarem.
  const [carregandoLimpezas, setCarregandoLimpezas] = useState(true);
  const [carregandoPlanos, setCarregandoPlanos] = useState(true);

  const [ptp, setPtp] = useState<PtpJanela[]>([]);
  const [carregandoPtp, setCarregandoPtp] = useState(true);
  const [erroLimpezas, setErroLimpezas] = useState("");
  const [erroPlanos, setErroPlanos] = useState("");
  const [erroPtp, setErroPtp] = useState("");

  const hoje = useMemo(
    () => calcularDataOperacional(usuario?.equipePadrao, usuario?.turnoPadrao),
    [usuario?.equipePadrao, usuario?.turnoPadrao],
  );
  const de = useMemo(() => somarDias(hoje, -(janela - 1)), [hoje, janela]);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      setErroLimpezas("");
      // SEM filtro de data: o passivo vai a 108 dias, muito alem da janela
      // de 7/15/30. calcularCumprimentoPeriodo filtra por dia internamente,
      // entao passar tudo nao afeta o percentual.
      const { data: linhas, error } = await supabase
        .from("limpeza_turnos" as never)
        .select("*")
        .order("data_operacao", { ascending: false });
      if (cancelado) return;
      if (error) {
        console.error("[supervisor] limpezas:", error);
        setErroLimpezas("Nao foi possivel carregar a limpeza operacional.");
        setCarregandoLimpezas(false);
        return;
      }
      setLimpezas(((linhas ?? []) as unknown as LimpezaTurnoRow[]).map(limpezaTurnoFromRow));
      setCarregandoLimpezas(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      setErroPlanos("");
      try {
        const p = await buscarPlanos();
        if (!cancelado) setPlanos(p);
      } catch (error) {
        console.error("[supervisor] planos:", error);
        if (!cancelado) setErroPlanos("Nao foi possivel carregar os planos de acao.");
      } finally {
        if (!cancelado) setCarregandoPlanos(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      setErroPtp("");
      const { data: linhasPtp, error } = await supabase
        .from("ptp_janelas" as never)
        .select("*")
        .gte("data_operacao", ROTINA_ENCHEDORA_3.vigenteDesde)
        .lte("data_operacao", hoje);
      if (cancelado) return;
      if (error) {
        console.error("[supervisor] ptp:", error);
        setErroPtp("Nao foi possivel carregar o PTP.");
        setCarregandoPtp(false);
        return;
      }
      setPtp(((linhasPtp ?? []) as unknown as PtpJanelaRow[]).map(ptpJanelaFromRow));
      setCarregandoPtp(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [hoje, recarga]);

  // Mesmo passivo que o lider e a GI enxergam. As tres telas TEM que contar
  // a mesma verdade: e o supervisor quem apresenta o farol para a GI.
  const pendencias = useMemo(
    () => levantarPendencias({ checklists, limpezas, ptp, planos, hoje }),
    [checklists, limpezas, ptp, planos, hoje],
  );

  // "Avaliar Melhorias" e "Análise cump. Rotina Sup/Coord." — as duas
  // tarefas do papel que ainda não tinham tela.
  const grupos = useMemo(() => agruparPendencias(pendencias, planos), [pendencias, planos]);

  // Ver o comentário igual em gestao.index.tsx: melhoria precisa do histórico
  // completo, senão o problema eliminado leva embora a prova de que foi.
  const gruposHistoricos = useMemo(
    () =>
      agruparPendencias(
        levantarPendencias({
          checklists,
          limpezas,
          ptp,
          planos,
          hoje,
          incluirEncerradas: true,
        }),
        planos,
      ),
    [checklists, limpezas, ptp, planos, hoje],
  );
  const melhorias = useMemo(
    () => avaliarMelhorias(gruposHistoricos, hoje),
    [gruposHistoricos, hoje],
  );
  const rotina = useMemo(
    () => avaliarRotinaLideranca(grupos, planos, hoje),
    [grupos, planos, hoje],
  );

  const cumprimento = useMemo(
    () =>
      calcularCumprimentoPeriodo(
        checklists,
        limpezas,
        de,
        hoje,
        ROTINA_ENCHEDORA_3,
        "Enchedora 3",
        [],
        hoje, // dia corrente fica fora: cumprimento é de dia fechado
      ),
    [checklists, limpezas, de, hoje],
  );

  const farolHoje = useMemo(
    () =>
      montarFarol({
        checklists,
        limpezas,
        ptp,
        data: hoje,
        hoje,
        pendencias,
        // O Sup/Coord cobra, não executa: a célula mostra o que está aberto
        // agora, não como foi o turno de ontem.
        modo: "estado",
      }),
    [checklists, limpezas, ptp, hoje, pendencias],
  );

  if (loading || !usuario) return <TelaCarregando />;

  const erroDados = erroChecklists || erroLimpezas || erroPlanos || erroPtp;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Supervisão / Coordenação"
        subtitulo={`Linha 3 · cumprimento da rotina · ${formatarDataBR(de)} a ${formatarDataBR(hoje)}`}
      />
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
        {erroDados ? (
          <section className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-bold">Farol indisponivel</p>
            <p className="mt-1">{erroDados} Nenhum numero sera mostrado como zero.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 rounded-lg bg-destructive px-3 py-2 font-semibold text-destructive-foreground"
            >
              Tentar novamente
            </button>
          </section>
        ) : carregando || carregandoLimpezas || carregandoPlanos || carregandoPtp ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <>
            <Farol linhas={farolHoje} data={hoje} modo="estado" />

            <PendenciasAbertas
              pendencias={pendencias}
              planos={planos}
              onAbrirPlano={setPendenciaAberta}
            />

            {pendenciaAberta && (
              <PlanoAcaoDialog
                pendencia={pendenciaAberta}
                usuario={usuario}
                onFechar={() => setPendenciaAberta(null)}
                onSalvo={() => setRecarga((n) => n + 1)}
              />
            )}

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

            {/* A contingência tem que ser contada por quem cobra a rotina.
                Remendo invisível vira o processo. */}
            <PainelContingencias de={de} ate={hoje} />

            <MelhoriasERotina
              melhorias={melhorias}
              rotina={rotina}
              usuario={usuario}
              onAtualizar={() => setRecarga((n) => n + 1)}
            />
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
          valor={c.totalEsperado - c.totalRealizado - c.totalSemInformacao}
          nota="turno rodou e pulou o momento"
          tom={c.totalEsperado - c.totalRealizado - c.totalSemInformacao > 0 ? "ruim" : "bom"}
        />
        {/* Substitui o antigo "Dias sem produção · fora da conta de
            cumprimento". Aquele cartão afirmava que a máquina não rodou; o
            banco não sabe disso. Dizer "não sei" é o número honesto, e é o
            que a liderança tem que atacar primeiro. */}
        <Cartao
          rotulo="Sem informação"
          valor={c.totalSemInformacao}
          nota="turno programado sem registro nenhum"
          tom={c.totalSemInformacao > 0 ? "ruim" : "bom"}
        />
        <Cartao
          rotulo="Sem validação do líder"
          valor={c.limpezasSemValidacao}
          nota="limpezas que o líder não fechou"
          tom={c.limpezasSemValidacao > 0 ? "ruim" : "bom"}
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
                <span className="w-32 shrink-0 text-sm font-bold text-foreground">{t.turno}</span>
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
                  <b className="text-foreground">{t.percentual}%</b> · {t.realizado}/{t.esperado}
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
        {/* A legenda antiga dizia que dia sem produção ficava fora da conta.
            Passou a ser o oposto — e legenda contradizendo o número logo acima
            é pior do que legenda nenhuma. */}
        <p className="mt-2 text-xs text-muted-foreground">
          O esperado vem da rotina programada ({ROTINA_ENCHEDORA_3.turnos.length} turnos × 3
          momentos), não dos registros encontrados: turno que não deu sinal nenhum conta como{" "}
          <b className="text-foreground">sem informação</b> e continua no denominador — se esquecer
          não doer no número, esquecer compensa. Só sai da conta parada com motivo registrado.
          {c.excluiuDiaEmAndamento && " O dia de hoje fica de fora enquanto não fecha."} O gráfico
          usa {maxEsperado} como referência de dia cheio.
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
