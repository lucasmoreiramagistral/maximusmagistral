import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Flame,
  Info,
  LayoutDashboard,
  Loader2,
  Repeat,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useChecklistsRemote } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { useResolucoesNcNr } from "@/hooks/use-nc-resolucoes";
import { supabase } from "@/integrations/supabase/client";
import { limpezaTurnoFromRow, type LimpezaTurnoRow } from "@/lib/verso/mappers";
import type { LimpezaTurno } from "@/lib/verso/types";
import {
  agregarNcNr,
  type OrigemNcNr,
} from "@/lib/checklist/nao-conformidades";
import {
  calcularAgingPendentes,
  calcularItensCronicos,
  calcularKpisTempo,
  calcularPerformanceEquipe,
  calcularPerformanceTurno,
  chaveRegistro,
  formatarDias,
  tomAging,
  SLA_DIAS,
  type RegistroComStatus,
} from "@/lib/nao-conformidades/aging";
import {
  calcularHeatmapTurnoOrigem,
  calcularSerieDiaria,
  gerarAlertas,
  intensidadeHeat,
  type Alerta,
  type SeveridadeAlerta,
} from "@/lib/nao-conformidades/dashboard";
import {
  chaveResolucao,
  type ResolucaoNcNr,
} from "@/lib/nao-conformidades/resolucoes";
import { formatarDataBR } from "@/lib/operacao/data-operacional";

export const Route = createFileRoute("/gestao/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard Gestão — Linha 3" },
      {
        name: "description",
        content:
          "Visão executiva em tempo real de não conformidades, aging, reincidência, performance por turno e equipe da Linha 3.",
      },
    ],
  }),
  component: DashboardGestao,
});

const PERIODOS: { label: string; dias: number }[] = [
  { label: "Hoje", dias: 1 },
  { label: "7 dias", dias: 7 },
  { label: "30 dias", dias: 30 },
];

function DashboardGestao() {
  const { usuario, loading: authLoading } = useGuard("gestao");
  const { data: checklists, loading: l1 } = useChecklistsRemote({ realtime: true });
  const { data: resolucoes } = useResolucoesNcNr(90);

  const [dias, setDias] = useState(7);
  const [turnosLimpeza, setTurnosLimpeza] = useState<LimpezaTurno[]>([]);
  const [l2, setL2] = useState(true);
  const [agora, setAgora] = useState(() => new Date());

  // relógio leve, atualiza a cada 60s
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // carrega últimos 90 dias de limpeza (usado para tendência e aging)
  useEffect(() => {
    let cancelado = false;
    setL2(true);
    const desde = new Date();
    desde.setDate(desde.getDate() - 90);
    const dataIso = desde.toISOString().slice(0, 10);
    void (async () => {
      const { data, error } = await supabase
        .from("limpeza_turnos" as never)
        .select("*")
        .gte("data_operacao", dataIso);
      if (cancelado) return;
      if (error) {
        console.error("[gestao.dashboard] limpeza fetch:", error);
        setTurnosLimpeza([]);
      } else {
        setTurnosLimpeza(
          ((data ?? []) as unknown as LimpezaTurnoRow[]).map(limpezaTurnoFromRow),
        );
      }
      setL2(false);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  // --- DADOS DERIVADOS ---------------------------------------------------
  const ag = useMemo(
    () => agregarNcNr(checklists, turnosLimpeza, dias),
    [checklists, turnosLimpeza, dias],
  );

  const resolucoesPorChave = useMemo(() => {
    const m = new Map<string, ResolucaoNcNr>();
    for (const r of resolucoes) m.set(chaveResolucao(r), r);
    return m;
  }, [resolucoes]);

  const registros: RegistroComStatus[] = useMemo(
    () =>
      ag.registros.map((r) => ({
        registro: r,
        resolucao: resolucoesPorChave.get(chaveRegistro(r)) ?? null,
      })),
    [ag.registros, resolucoesPorChave],
  );

  // KPIs principais
  const kpisTempo = useMemo(() => calcularKpisTempo(registros), [registros]);
  const totalGeral = registros.length;
  const totalResolvidas = registros.filter((x) => x.resolucao).length;
  const totalPendentes = totalGeral - totalResolvidas;

  // Saúde operacional do dia (hoje)
  const hojeIso = useMemo(() => agora.toISOString().slice(0, 10), [agora]);
  const saudeHoje = useMemo(() => {
    const checklistsHoje = checklists.filter((c) => c.contexto.data === hojeIso);
    const folhasCompletas = checklistsHoje.filter(
      (c) => c.respostas.length > 0 && c.respostas.every((r) => !!r.resposta),
    ).length;
    const completude =
      checklistsHoje.length === 0
        ? null
        : (folhasCompletas / checklistsHoje.length) * 100;

    const turnosHoje = turnosLimpeza.filter((t) => t.dataOperacao === hojeIso);
    let totalItens = 0;
    let realizados = 0;
    for (const t of turnosHoje) {
      for (const it of t.itens) {
        totalItens += 1;
        if (it.status === "realizado") realizados += 1;
      }
    }
    const aderencia = totalItens === 0 ? null : (realizados / totalItens) * 100;

    return {
      checklists: checklistsHoje.length,
      folhasCompletas,
      completude,
      itensLimpeza: totalItens,
      itensRealizados: realizados,
      aderenciaLimpeza: aderencia,
      turnosLimpezaHoje: turnosHoje.length,
    };
  }, [checklists, turnosLimpeza, hojeIso]);

  // Heatmap, série, crônicos, aging, performance, alertas
  const heatmap = useMemo(() => calcularHeatmapTurnoOrigem(registros), [registros]);
  const heatmapMax = useMemo(
    () => Math.max(1, ...heatmap.flatMap((c) => [c.nc, c.nr])),
    [heatmap],
  );
  const serie14 = useMemo(
    () => calcularSerieDiaria(registros, 14, agora.toISOString()),
    [registros, agora],
  );
  const serieMax = useMemo(
    () => Math.max(1, ...serie14.flatMap((p) => [p.abertas, p.resolvidas])),
    [serie14],
  );
  const cronicos = useMemo(
    () => calcularItensCronicos(registros).slice(0, 5),
    [registros],
  );
  const aging = useMemo(
    () => calcularAgingPendentes(registros, agora.toISOString()).slice(0, 8),
    [registros, agora],
  );
  const perfTurno = useMemo(
    () => calcularPerformanceTurno(registros, agora.toISOString()).slice(0, 4),
    [registros, agora],
  );
  const perfEquipe = useMemo(
    () => calcularPerformanceEquipe(registros, agora.toISOString()).slice(0, 6),
    [registros, agora],
  );
  const alertas = useMemo(
    () => gerarAlertas(registros, agora.toISOString()),
    [registros, agora],
  );

  if (authLoading || !usuario) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const carregando = l1 || l2;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Dashboard Gestão"
        subtitulo="Visão executiva — Linha 3"
      />
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-10">
        {/* Topo */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/gestao">
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <LayoutDashboard className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold leading-tight md:text-2xl">
                  Dashboard Gestão
                </h1>
                <p className="text-xs text-muted-foreground md:text-sm">
                  Tempo real ·{" "}
                  {agora.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </div>
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-sm">
            {PERIODOS.map((p) => (
              <Button
                key={p.dias}
                size="sm"
                variant={dias === p.dias ? "default" : "ghost"}
                className="h-9"
                onClick={() => setDias(p.dias)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {carregando ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* BLOCO 1 — Faixa de status */}
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <KpiSemaforo
                titulo="Pendências abertas"
                valor={totalPendentes}
                subtexto={`de ${totalGeral} no período`}
                icone={<AlertOctagon className="h-5 w-5" />}
                tom={
                  totalPendentes === 0
                    ? "success"
                    : totalPendentes > 10
                      ? "destructive"
                      : "warning"
                }
              />
              <Link to="/gestao/nao-conformidades">
                <KpiSemaforo
                  titulo={`SLA estourado (>${SLA_DIAS}d)`}
                  valor={kpisTempo.slaEstourado}
                  subtexto={
                    kpisTempo.slaEstourado > 0 ? "Clique para tratar" : "Tudo no prazo"
                  }
                  icone={<Flame className="h-5 w-5" />}
                  tom={kpisTempo.slaEstourado > 0 ? "destructive" : "success"}
                  hover
                />
              </Link>
              <KpiSemaforo
                titulo="Resolvidas em 24h"
                valor={
                  kpisTempo.percentualEm24h === null
                    ? "—"
                    : `${Math.round(kpisTempo.percentualEm24h)}%`
                }
                subtexto="agilidade da gestão"
                icone={<CheckCircle2 className="h-5 w-5" />}
                tom={
                  kpisTempo.percentualEm24h === null
                    ? "muted"
                    : kpisTempo.percentualEm24h >= 70
                      ? "success"
                      : kpisTempo.percentualEm24h >= 40
                        ? "warning"
                        : "destructive"
                }
              />
              <KpiSemaforo
                titulo="Tempo médio resolução"
                valor={formatarDias(kpisTempo.tempoMedioResolucao)}
                subtexto="das resolvidas"
                icone={<Clock3 className="h-5 w-5" />}
                tom={
                  kpisTempo.tempoMedioResolucao === null
                    ? "muted"
                    : kpisTempo.tempoMedioResolucao <= 1
                      ? "success"
                      : kpisTempo.tempoMedioResolucao <= SLA_DIAS
                        ? "warning"
                        : "destructive"
                }
              />
            </section>

            {/* BLOCO 2 — Saúde operacional do dia */}
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Saúde operacional · hoje ({formatarDataBR(hojeIso)})
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <CardProgresso
                  titulo="Completude do checklist"
                  valor={saudeHoje.completude}
                  detalhe={`${saudeHoje.folhasCompletas} de ${saudeHoje.checklists} folha(s)`}
                />
                <CardProgresso
                  titulo="Aderência da limpeza"
                  valor={saudeHoje.aderenciaLimpeza}
                  detalhe={`${saudeHoje.itensRealizados} de ${saudeHoje.itensLimpeza} item(ns)`}
                />
                <CardProgresso
                  titulo="Turnos de limpeza registrados"
                  valor={saudeHoje.turnosLimpezaHoje > 0 ? 100 : 0}
                  detalhe={`${saudeHoje.turnosLimpezaHoje} turno(s) com registro`}
                  ocultarBarra
                />
              </div>
            </section>

            {/* BLOCO 3 + 6 lado a lado em desktop */}
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Heatmap */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-1 flex items-center gap-2 text-base font-bold">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Onde dói mais
                </h2>
                <p className="mb-4 text-xs text-muted-foreground">
                  Turno × origem · intensidade pelo volume
                </p>
                {heatmap.length === 0 ? (
                  <EmptyMini texto="Sem registros no período." />
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                      <div>Turno</div>
                      <div className="w-24 text-center">NC</div>
                      <div className="w-24 text-center">NR</div>
                      <div className="w-20 text-right">Pend.</div>
                    </div>
                    {heatmap.map((c) => (
                      <div
                        key={c.turno}
                        className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2"
                      >
                        <div className="font-semibold">{c.turno}</div>
                        <CelulaHeat valor={c.nc} max={heatmapMax} tom="destructive" />
                        <CelulaHeat valor={c.nr} max={heatmapMax} tom="warning" />
                        <div className="w-20 text-right">
                          <Badge
                            className={
                              c.pendentes === 0
                                ? "bg-success-soft text-success"
                                : "bg-destructive/15 text-destructive"
                            }
                          >
                            {c.pendentes}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tendência 14 dias */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-1 flex items-center gap-2 text-base font-bold">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Tendência · últimos 14 dias
                </h2>
                <p className="mb-4 text-xs text-muted-foreground">
                  <span className="mr-3 inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-destructive" /> Abertas
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-success" /> Resolvidas
                  </span>
                </p>
                <div className="flex h-40 items-end gap-1">
                  {serie14.map((p) => (
                    <div
                      key={p.data}
                      className="flex flex-1 flex-col items-center gap-1"
                      title={`${p.rotulo} — Abertas: ${p.abertas} · Resolvidas: ${p.resolvidas}`}
                    >
                      <div className="flex h-32 w-full items-end gap-0.5">
                        <div
                          className="flex-1 rounded-t bg-destructive"
                          style={{
                            height: `${(p.abertas / serieMax) * 100}%`,
                            minHeight: p.abertas > 0 ? 2 : 0,
                          }}
                        />
                        <div
                          className="flex-1 rounded-t bg-success"
                          style={{
                            height: `${(p.resolvidas / serieMax) * 100}%`,
                            minHeight: p.resolvidas > 0 ? 2 : 0,
                          }}
                        />
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {p.rotulo}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* BLOCO 4 + 5 lado a lado */}
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Crônicos */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-1 flex items-center gap-2 text-base font-bold">
                  <Repeat className="h-4 w-4 text-primary" />
                  Top 5 itens crônicos
                </h2>
                <p className="mb-4 text-xs text-muted-foreground">
                  Itens com mais ocorrências e reincidências
                </p>
                {cronicos.length === 0 ? (
                  <EmptyMini texto="Sem dados suficientes." />
                ) : (
                  <ol className="space-y-3">
                    {cronicos.map((c, i) => {
                      const max = cronicos[0].ocorrencias || 1;
                      return (
                        <li key={c.chave} className="flex items-center gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                            {i + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <BadgeOrigemMini origem={c.origem} />
                              <span className="truncate text-sm font-semibold">
                                #{c.itemNumero} — {c.descricao}
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${(c.ocorrencias / max) * 100}%` }}
                              />
                            </div>
                            <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                              <span>{c.ocorrencias} ocorr.</span>
                              {c.reincidencias > 0 && (
                                <span className="font-semibold text-destructive">
                                  {c.reincidencias} reincid.
                                </span>
                              )}
                              {c.pendentes > 0 && (
                                <span>{c.pendentes} pendente(s)</span>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              {/* Aging */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-base font-bold">
                    <Clock3 className="h-4 w-4 text-primary" />
                    Mais antigas em aberto
                  </h2>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/gestao/nao-conformidades">
                      Ver todas <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
                {aging.length === 0 ? (
                  <EmptyMini texto="Nenhuma pendência. 🎉" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-9">Item</TableHead>
                        <TableHead className="h-9">Turno</TableHead>
                        <TableHead className="h-9 text-right">Aberto há</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aging.map(({ registro: r, diasEmAberto }) => {
                        const tom = tomAging(diasEmAberto);
                        const cls =
                          tom === "destructive"
                            ? "bg-destructive/15 text-destructive"
                            : tom === "warning"
                              ? "bg-warning/20 text-warning-foreground"
                              : "bg-success/15 text-success";
                        return (
                          <TableRow
                            key={`ag-${r.origem}-${r.origemId}-${r.itemNumero}`}
                          >
                            <TableCell className="max-w-[220px]">
                              <div className="flex items-center gap-2">
                                <BadgeOrigemMini origem={r.origem} />
                                <span className="truncate text-sm font-medium">
                                  #{r.itemNumero} — {r.itemDescricao}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{r.turno}</TableCell>
                            <TableCell className="text-right">
                              <Badge className={cls}>{formatarDias(diasEmAberto)}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </section>

            {/* BLOCO 7 — Performance turno + equipe */}
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <TabelaPerformance
                titulo="Performance por turno"
                colunaPrimeira="Turno"
                linhas={perfTurno.map((p) => ({
                  rotulo: p.turno,
                  total: p.total,
                  pctResolvido: p.percentualResolvido,
                  tempoMedio: p.tempoMedioResolucao,
                  acimaSla: p.pendentesAcimaSla,
                }))}
              />
              <TabelaPerformance
                titulo="Performance por equipe"
                colunaPrimeira="Equipe"
                linhas={perfEquipe.map((p) => ({
                  rotulo: p.equipe,
                  total: p.total,
                  pctResolvido: p.percentualResolvido,
                  tempoMedio: p.tempoMedioResolucao,
                  acimaSla: p.pendentesAcimaSla,
                }))}
              />
            </section>

            {/* BLOCO 8 — Alertas */}
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-4 w-4" /> Alertas inteligentes
              </h2>
              {alertas.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                  Sem registros suficientes para gerar alertas.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {alertas.map((a) => (
                    <CardAlerta key={a.id} alerta={a} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

// =====================================================================
// Componentes locais
// =====================================================================

type Tom = "destructive" | "warning" | "success" | "muted";

function classesTom(tom: Tom) {
  switch (tom) {
    case "destructive":
      return {
        borda: "border-destructive/30",
        fundo: "bg-destructive-soft/40",
        icone: "bg-destructive text-destructive-foreground",
        valor: "text-destructive",
      };
    case "warning":
      return {
        borda: "border-warning/40",
        fundo: "bg-warning/10",
        icone: "bg-warning text-warning-foreground",
        valor: "text-warning-foreground",
      };
    case "success":
      return {
        borda: "border-success/30",
        fundo: "bg-success-soft/50",
        icone: "bg-success text-success-foreground",
        valor: "text-success",
      };
    default:
      return {
        borda: "border-border",
        fundo: "bg-card",
        icone: "bg-muted text-foreground",
        valor: "text-foreground",
      };
  }
}

function KpiSemaforo({
  titulo,
  valor,
  subtexto,
  icone,
  tom,
  hover,
}: {
  titulo: string;
  valor: number | string;
  subtexto?: string;
  icone: React.ReactNode;
  tom: Tom;
  hover?: boolean;
}) {
  const c = classesTom(tom);
  return (
    <div
      className={`rounded-xl border-2 ${c.borda} ${c.fundo} p-4 shadow-sm transition-all md:p-5 ${
        hover ? "hover:shadow-md" : ""
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground md:text-sm">
          {titulo}
        </p>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.icone}`}>
          {icone}
        </div>
      </div>
      <p className={`text-3xl font-bold md:text-4xl ${c.valor}`}>{valor}</p>
      {subtexto && (
        <p className="mt-1 text-xs text-muted-foreground">{subtexto}</p>
      )}
    </div>
  );
}

function CardProgresso({
  titulo,
  valor,
  detalhe,
  ocultarBarra,
}: {
  titulo: string;
  valor: number | null;
  detalhe: string;
  ocultarBarra?: boolean;
}) {
  const pct = valor === null ? null : Math.max(0, Math.min(100, valor));
  const tom: Tom =
    pct === null
      ? "muted"
      : pct >= 90
        ? "success"
        : pct >= 70
          ? "warning"
          : "destructive";
  const c = classesTom(tom);
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className={`text-3xl font-bold ${c.valor}`}>
          {pct === null ? "—" : `${Math.round(pct)}%`}
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>
      {!ocultarBarra && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full ${
              tom === "success"
                ? "bg-success"
                : tom === "warning"
                  ? "bg-warning"
                  : tom === "destructive"
                    ? "bg-destructive"
                    : "bg-muted-foreground"
            }`}
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
      )}
    </div>
  );
}

function CelulaHeat({
  valor,
  max,
  tom,
}: {
  valor: number;
  max: number;
  tom: "destructive" | "warning";
}) {
  const intensidade = intensidadeHeat(valor, max);
  const base =
    tom === "destructive"
      ? "bg-destructive text-destructive-foreground"
      : "bg-warning text-warning-foreground";
  return (
    <div
      className={`flex h-9 w-24 items-center justify-center rounded-md text-sm font-bold ${
        valor === 0 ? "bg-muted text-muted-foreground" : base
      }`}
      style={valor > 0 ? { opacity: 0.35 + intensidade * 0.65 } : undefined}
    >
      {valor}
    </div>
  );
}

function BadgeOrigemMini({ origem }: { origem: OrigemNcNr }) {
  return origem === "checklist" ? (
    <Badge className="bg-destructive/15 text-destructive">NC</Badge>
  ) : (
    <Badge className="bg-warning/20 text-warning-foreground">NR</Badge>
  );
}

function EmptyMini({ texto }: { texto: string }) {
  return (
    <div className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
      {texto}
    </div>
  );
}

interface LinhaPerf {
  rotulo: string;
  total: number;
  pctResolvido: number;
  tempoMedio: number | null;
  acimaSla: number;
}

function TabelaPerformance({
  titulo,
  colunaPrimeira,
  linhas,
}: {
  titulo: string;
  colunaPrimeira: string;
  linhas: LinhaPerf[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-base font-bold">{titulo}</h2>
      {linhas.length === 0 ? (
        <EmptyMini texto="Sem dados no período." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-9">{colunaPrimeira}</TableHead>
              <TableHead className="h-9 text-right">Total</TableHead>
              <TableHead className="h-9 text-right">% Resolvido</TableHead>
              <TableHead className="h-9 text-right">T. médio</TableHead>
              <TableHead className="h-9 text-right">SLA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={l.rotulo}>
                <TableCell className="font-semibold">{l.rotulo}</TableCell>
                <TableCell className="text-right">{l.total}</TableCell>
                <TableCell className="text-right">
                  <span
                    className={
                      l.pctResolvido >= 80
                        ? "text-success font-semibold"
                        : l.pctResolvido >= 50
                          ? "text-warning-foreground"
                          : "text-destructive font-semibold"
                    }
                  >
                    {Math.round(l.pctResolvido)}%
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {formatarDias(l.tempoMedio)}
                </TableCell>
                <TableCell className="text-right">
                  {l.acimaSla > 0 ? (
                    <Badge className="bg-destructive/15 text-destructive">
                      {l.acimaSla}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function CardAlerta({ alerta }: { alerta: Alerta }) {
  const tom: Tom =
    alerta.severidade === "alta"
      ? "destructive"
      : alerta.severidade === "media"
        ? "warning"
        : "muted";
  const c = classesTom(tom);
  const Icone = iconePorSeveridade(alerta.severidade);
  return (
    <div className={`rounded-xl border-2 ${c.borda} ${c.fundo} p-4 shadow-sm`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.icone}`}>
          <Icone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-bold ${c.valor}`}>{alerta.titulo}</p>
          <p className="mt-1 text-sm text-muted-foreground">{alerta.detalhe}</p>
          {alerta.link && (
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link to={alerta.link.to}>
                {alerta.link.label} <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function iconePorSeveridade(s: SeveridadeAlerta) {
  if (s === "alta") return AlertOctagon;
  if (s === "media") return AlertTriangle;
  return Info;
}
