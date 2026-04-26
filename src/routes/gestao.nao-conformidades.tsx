import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, AlertOctagon, CheckCircle2, Clock3, Loader2, Undo2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { supabase } from "@/integrations/supabase/client";
import { limpezaTurnoFromRow, type LimpezaTurnoRow } from "@/lib/verso/mappers";
import type { LimpezaTurno } from "@/lib/verso/types";
import {
  agregarNcNr,
  type OrigemNcNr,
  type RegistroNcNr,
} from "@/lib/checklist/nao-conformidades";
import { formatarDataBR } from "@/lib/operacao/data-operacional";
import { formatarHora } from "@/lib/checklist/format";
import { useResolucoesNcNr } from "@/hooks/use-nc-resolucoes";
import {
  chaveRegistro,
  chaveResolucao,
  reabrir,
  type ResolucaoNcNr,
} from "@/lib/nao-conformidades/resolucoes";
import { NcResolverDialog } from "@/components/nc-resolver-dialog";
import {
  calcularAgingPendentes,
  calcularItensCronicos,
  calcularKpisTempo,
  calcularPerformanceTurno,
  formatarDias,
  tomAging,
  SLA_DIAS,
} from "@/lib/nao-conformidades/aging";
import { toast } from "sonner";

export const Route = createFileRoute("/gestao/nao-conformidades")({
  head: () => ({
    meta: [
      { title: "Não conformidades — Gestão Industrial" },
      {
        name: "description",
        content:
          "Análise de não conformidades do checklist e itens não realizados da limpeza, com fluxo de resolução pela gestão.",
      },
    ],
  }),
  component: NaoConformidadesPage,
});

const PERIODOS: { label: string; dias: number }[] = [
  { label: "Últimos 7 dias", dias: 7 },
  { label: "Últimos 30 dias", dias: 30 },
  { label: "Últimos 90 dias", dias: 90 },
];

type StatusFiltro = "todos" | "pendente" | "resolvida";

function NaoConformidadesPage() {
  const { usuario, loading: authLoading } = useGuard("gestao");
  const { data: checklists, loading: l1 } = useChecklistsRemote({ realtime: true });
  const { data: resolucoes, refetch: refetchResolucoes } = useResolucoesNcNr(90);

  const [dias, setDias] = useState(30);
  const [origem, setOrigem] = useState<"todos" | OrigemNcNr>("todos");
  const [turnoFiltro, setTurnoFiltro] = useState<string>("todos");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("pendente");
  const [registroAbrindo, setRegistroAbrindo] = useState<RegistroNcNr | null>(null);

  const [turnosLimpeza, setTurnosLimpeza] = useState<LimpezaTurno[]>([]);
  const [l2, setL2] = useState(true);

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
        console.error("[gestao.nao-conformidades] limpeza fetch:", error);
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

  const ag = useMemo(
    () => agregarNcNr(checklists, turnosLimpeza, dias),
    [checklists, turnosLimpeza, dias],
  );

  // Mapa: chave do registro → resolução (se existir).
  const resolucoesPorChave = useMemo(() => {
    const m = new Map<string, ResolucaoNcNr>();
    for (const r of resolucoes) m.set(chaveResolucao(r), r);
    return m;
  }, [resolucoes]);

  // Registros enriquecidos com a resolução correspondente.
  const registrosComStatus = useMemo(() => {
    return ag.registros.map((r) => ({
      registro: r,
      resolucao: resolucoesPorChave.get(chaveRegistro(r)) ?? null,
    }));
  }, [ag.registros, resolucoesPorChave]);

  const turnosDisponiveis = useMemo(() => {
    return Array.from(new Set(ag.registros.map((r) => r.turno))).sort();
  }, [ag.registros]);

  const registrosFiltrados = useMemo(() => {
    return registrosComStatus.filter(({ registro: r, resolucao }) => {
      if (origem !== "todos" && r.origem !== origem) return false;
      if (turnoFiltro !== "todos" && r.turno !== turnoFiltro) return false;
      if (statusFiltro === "pendente" && resolucao) return false;
      if (statusFiltro === "resolvida" && !resolucao) return false;
      return true;
    });
  }, [registrosComStatus, origem, turnoFiltro, statusFiltro]);

  const topItens = useMemo(() => {
    const arr = Array.from(ag.porItem.entries()).map(([chave, v]) => ({
      chave,
      ...v,
    }));
    arr.sort((a, b) => b.qtd - a.qtd);
    return arr.slice(0, 10);
  }, [ag.porItem]);

  // Filtrados pelos mesmos filtros (origem/turno) — para análises industriais.
  const registrosParaAnalise = useMemo(() => {
    return registrosComStatus.filter(({ registro: r }) => {
      if (origem !== "todos" && r.origem !== origem) return false;
      if (turnoFiltro !== "todos" && r.turno !== turnoFiltro) return false;
      return true;
    });
  }, [registrosComStatus, origem, turnoFiltro]);

  const kpisTempo = useMemo(
    () => calcularKpisTempo(registrosParaAnalise),
    [registrosParaAnalise],
  );
  const agingPendentes = useMemo(
    () => calcularAgingPendentes(registrosParaAnalise),
    [registrosParaAnalise],
  );
  const itensCronicos = useMemo(
    () => calcularItensCronicos(registrosParaAnalise).slice(0, 10),
    [registrosParaAnalise],
  );
  const performanceTurno = useMemo(
    () => calcularPerformanceTurno(registrosParaAnalise),
    [registrosParaAnalise],
  );

  const totalGeral = ag.totalNc + ag.totalNr;
  const totalResolvidas = registrosComStatus.filter((x) => x.resolucao).length;
  const totalPendentes = totalGeral - totalResolvidas;

  const reabrirResolucao = async (r: ResolucaoNcNr) => {
    if (!confirm("Reabrir esta não conformidade? A resolução será apagada.")) return;
    try {
      await reabrir(r.id);
      toast.success("Reaberta.");
      void refetchResolucoes();
    } catch {
      toast.error("Não foi possível reabrir.");
    }
  };

  if (authLoading || !usuario) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Não conformidades"
        subtitulo="NC do checklist e NR da limpeza"
      />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6 flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/gestao">
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">
              Não conformidades e Não realizados
            </h1>
            <p className="text-sm text-muted-foreground">
              Marque como resolvida quando a gestão tratar o problema na linha.
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">
              Período
            </label>
            <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODOS.map((p) => (
                  <SelectItem key={p.dias} value={String(p.dias)}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">
              Origem
            </label>
            <Select value={origem} onValueChange={(v) => setOrigem(v as typeof origem)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="checklist">Checklist (NC)</SelectItem>
                <SelectItem value="limpeza">Limpeza (NR)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">
              Turno
            </label>
            <Select value={turnoFiltro} onValueChange={setTurnoFiltro}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os turnos</SelectItem>
                {turnosDisponiveis.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">
              Status
            </label>
            <Select
              value={statusFiltro}
              onValueChange={(v) => setStatusFiltro(v as StatusFiltro)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="resolvida">Resolvidas</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPIs */}
        <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-5">
          <KpiCard titulo="NC do checklist" valor={ag.totalNc} tom="destructive" />
          <KpiCard titulo="NR da limpeza" valor={ag.totalNr} tom="warning" />
          <KpiCard titulo="Pendentes" valor={totalPendentes} tom="destructive" />
          <KpiCard titulo="Resolvidas" valor={totalResolvidas} tom="success" />
          <KpiCard titulo="Total no período" valor={totalGeral} tom="muted" />
        </div>

        {/* KPIs de tempo / SLA */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
          <KpiCard
            titulo="Tempo médio resolução"
            valor={formatarDias(kpisTempo.tempoMedioResolucao)}
            tom="muted"
            legenda="das resolvidas no período"
          />
          <KpiCard
            titulo="Tempo médio em aberto"
            valor={formatarDias(kpisTempo.tempoMedioEmAberto)}
            tom={
              (kpisTempo.tempoMedioEmAberto ?? 0) > SLA_DIAS ? "destructive" : "warning"
            }
            legenda="pendentes hoje"
          />
          <KpiCard
            titulo="Mais antiga em aberto"
            valor={formatarDias(kpisTempo.maisAntigaDias)}
            tom={(kpisTempo.maisAntigaDias ?? 0) > SLA_DIAS ? "destructive" : "warning"}
            legenda={kpisTempo.maisAntigaItem ?? "—"}
          />
          <KpiCard
            titulo="Resolvidas em 24h"
            valor={
              kpisTempo.percentualEm24h === null
                ? "—"
                : `${Math.round(kpisTempo.percentualEm24h)}%`
            }
            tom="success"
            legenda="agilidade da gestão"
          />
          <KpiCard
            titulo={`SLA estourado (>${SLA_DIAS}d)`}
            valor={kpisTempo.slaEstourado}
            tom={kpisTempo.slaEstourado > 0 ? "destructive" : "success"}
            legenda="pendentes acima do prazo"
          />
        </div>

        {l1 || l2 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Aging — pendentes mais antigas */}
            <section className="mb-8">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">Aging — pendentes mais antigas</h2>
                {agingPendentes.length > 15 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatusFiltro("pendente")}
                  >
                    Ver todas as {agingPendentes.length}
                  </Button>
                )}
              </div>
              <div className="rounded-xl border border-border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aberta em</TableHead>
                      <TableHead className="text-right">Em aberto</TableHead>
                      <TableHead>Turno</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Operador</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agingPendentes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          Nenhuma pendência. 🎉
                        </TableCell>
                      </TableRow>
                    )}
                    {agingPendentes.slice(0, 15).map(({ registro: r, diasEmAberto }) => {
                      const tom = tomAging(diasEmAberto);
                      const cls =
                        tom === "destructive"
                          ? "bg-destructive/15 text-destructive hover:bg-destructive/20"
                          : tom === "warning"
                            ? "bg-warning/20 text-warning-foreground hover:bg-warning/30"
                            : "bg-success/15 text-success hover:bg-success/25";
                      return (
                        <TableRow key={`aging-${r.origem}-${r.origemId}-${r.itemNumero}`}>
                          <TableCell className="whitespace-nowrap">
                            <div className="font-medium">{formatarDataBR(r.data)}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatarHora(r.dataHora)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge className={cls}>{formatarDias(diasEmAberto)}</Badge>
                          </TableCell>
                          <TableCell>{r.turno}</TableCell>
                          <TableCell>
                            <BadgeOrigem origem={r.origem} />
                          </TableCell>
                          <TableCell className="max-w-[320px]">
                            <div className="font-semibold">
                              #{r.itemNumero} — {r.itemDescricao}
                            </div>
                            <div className="line-clamp-2 text-xs text-muted-foreground">
                              {r.observacao}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{r.operador}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => setRegistroAbrindo(r)}
                            >
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                              Resolver
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>

            {/* Itens crônicos / reincidência */}
            <section className="mb-8">
              <h2 className="mb-1 text-lg font-bold">Itens crônicos e reincidências</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Itens que mais se repetem, com pendências em aberto ou que voltam após
                já terem sido resolvidos. Foco para análise de causa raiz.
              </p>
              <div className="rounded-xl border border-border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Origem</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Ocorrências</TableHead>
                      <TableHead className="text-right">Pendentes</TableHead>
                      <TableHead className="text-right">Reincidências</TableHead>
                      <TableHead className="text-right">Tempo médio resolução</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itensCronicos.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          Nada no período.
                        </TableCell>
                      </TableRow>
                    )}
                    {itensCronicos.map((it) => (
                      <TableRow key={`cron-${it.chave}`}>
                        <TableCell>
                          <BadgeOrigem origem={it.origem} />
                        </TableCell>
                        <TableCell className="font-medium">
                          #{it.itemNumero} — {it.descricao}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {it.ocorrencias}
                        </TableCell>
                        <TableCell className="text-right">
                          {it.pendentes > 0 ? (
                            <Badge variant="destructive">{it.pendentes}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {it.reincidencias > 0 ? (
                            <Badge className="bg-warning/20 text-warning-foreground hover:bg-warning/30">
                              {it.reincidencias}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatarDias(it.tempoMedioResolucao)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            {/* Top itens recorrentes */}
            <section className="mb-8">
              <h2 className="mb-3 text-lg font-bold">Itens mais recorrentes</h2>
              <div className="rounded-xl border border-border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Origem</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">% do total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topItens.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          Nada no período.
                        </TableCell>
                      </TableRow>
                    )}
                    {topItens.map((it) => (
                      <TableRow key={it.chave}>
                        <TableCell>
                          <BadgeOrigem origem={it.origem} />
                        </TableCell>
                        <TableCell className="font-medium">{it.descricao}</TableCell>
                        <TableCell className="text-right font-bold">{it.qtd}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {totalGeral === 0
                            ? "—"
                            : `${Math.round((it.qtd / totalGeral) * 100)}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            {/* Distribuição por turno */}
            <section className="mb-8">
              <h2 className="mb-3 text-lg font-bold">Por turno</h2>
              <div className="rounded-xl border border-border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Turno</TableHead>
                      <TableHead className="text-right">NC checklist</TableHead>
                      <TableHead className="text-right">NR limpeza</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ag.porTurno.size === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          Nada no período.
                        </TableCell>
                      </TableRow>
                    )}
                    {Array.from(ag.porTurno.entries())
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([turno, v]) => (
                        <TableRow key={turno}>
                          <TableCell className="font-medium">{turno}</TableCell>
                          <TableCell className="text-right">{v.nc}</TableCell>
                          <TableCell className="text-right">{v.nr}</TableCell>
                          <TableCell className="text-right font-bold">{v.total}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            {/* Lista detalhada */}
            <section>
              <h2 className="mb-3 text-lg font-bold">
                Registros ({registrosFiltrados.length})
              </h2>
              <div className="rounded-xl border border-border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Turno</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Observação</TableHead>
                      <TableHead>Operador</TableHead>
                      <TableHead className="min-w-[220px]">Status / Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registrosFiltrados.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          Nenhum registro com os filtros atuais.
                        </TableCell>
                      </TableRow>
                    )}
                    {registrosFiltrados.map(({ registro: r, resolucao }, idx) => (
                      <TableRow
                        key={`${r.origem}-${r.origemId}-${r.itemNumero}-${idx}`}
                        className={resolucao ? "bg-success/5" : ""}
                      >
                        <TableCell className="whitespace-nowrap">
                          <div className="font-medium">{formatarDataBR(r.data)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatarHora(r.dataHora)}
                          </div>
                        </TableCell>
                        <TableCell>{r.turno}</TableCell>
                        <TableCell>
                          <BadgeOrigem origem={r.origem} />
                          {r.momento && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {r.momento}
                            </div>
                          )}
                          {r.grupo && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {r.grupo}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <div className="font-semibold">
                            #{r.itemNumero} — {r.itemDescricao}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[420px] whitespace-pre-wrap text-sm">
                          {r.observacao}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{r.operador}</TableCell>
                        <TableCell>
                          {resolucao ? (
                            <ResolvidaCelula
                              resolucao={resolucao}
                              onReabrir={() => void reabrirResolucao(resolucao)}
                            />
                          ) : (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => setRegistroAbrindo(r)}
                            >
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                              Marcar resolvida
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          </>
        )}

        <NcResolverDialog
          registro={registroAbrindo}
          usuario={usuario}
          onClose={() => setRegistroAbrindo(null)}
          onSaved={() => void refetchResolucoes()}
        />
      </main>
    </div>
  );
}

function ResolvidaCelula({
  resolucao,
  onReabrir,
}: {
  resolucao: ResolucaoNcNr;
  onReabrir: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Badge className="bg-success/20 text-success-foreground hover:bg-success/30">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Resolvida
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onReabrir}
          title="Reabrir"
        >
          <Undo2 className="mr-1 h-3 w-3" /> Reabrir
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        <Clock3 className="mr-1 inline h-3 w-3" />
        {formatarDataBR(resolucao.resolvidoEm.slice(0, 10))} ·{" "}
        {formatarHora(resolucao.resolvidoEm)} · {resolucao.resolvidoPorNome}
      </p>
      <p className="max-w-[260px] whitespace-pre-wrap text-xs text-foreground">
        {resolucao.oQueFoiFeito}
      </p>
    </div>
  );
}

function KpiCard({
  titulo,
  valor,
  tom,
}: {
  titulo: string;
  valor: number;
  tom: "destructive" | "warning" | "muted" | "success";
}) {
  const cls =
    tom === "destructive"
      ? "text-destructive"
      : tom === "warning"
        ? "text-warning-foreground"
        : tom === "success"
          ? "text-success"
          : "text-foreground";
  const icone =
    tom === "destructive" ? (
      <AlertOctagon className="h-5 w-5 text-destructive" />
    ) : tom === "success" ? (
      <CheckCircle2 className="h-5 w-5 text-success" />
    ) : null;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        {icone}
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {titulo}
        </p>
      </div>
      <p className={`mt-1 text-4xl font-bold ${cls}`}>{valor}</p>
    </div>
  );
}

function BadgeOrigem({ origem }: { origem: OrigemNcNr }) {
  if (origem === "checklist") {
    return <Badge variant="destructive">NC checklist</Badge>;
  }
  return (
    <Badge className="bg-warning/20 text-warning-foreground hover:bg-warning/30">
      NR limpeza
    </Badge>
  );
}
