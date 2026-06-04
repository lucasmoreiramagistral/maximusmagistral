import { createFileRoute } from "@tanstack/react-router";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useVersoRelatorioRemote } from "@/hooks/use-verso-relatorio";
import {
  calcularAlertasVerso,
  calcularDiagnosticoLimpeza,
  calcularDiagnosticoPtp,
  calcularResumoVersoRelatorio,
  construirReferenciaFrente,
  cruzarFrenteVerso,
  filtrarLimpezaDoRecorte,
  filtrarPtpDoRecorte,
  registrosVersoForaDoRecorte,
  type LinhaAderencia,
  type SituacaoVerso,
} from "@/lib/verso/reporting";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { FileBarChart2, Filter as FilterIcon, ClipboardList, ChevronDown, ChevronUp } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { TelaCarregando } from "@/components/tela-carregando";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGuard } from "@/hooks/use-guard";
import { useChecklistsRemote } from "@/hooks/use-storage";
import { useEdicoesPorPeriodo } from "@/hooks/use-edicoes-periodo";
import {
  calcularResumoExecutivo,
  calcularDisciplinaFM09,
  calcularFaixasHorarias,
  filtrarChecklists,
  type FiltrosRelatorio,
} from "@/lib/checklist/reporting";
import { MOMENTOS_CHECKLIST } from "@/lib/checklist/types";
import { supabase } from "@/integrations/supabase/client";
import { limpezaTurnoFromRow, type LimpezaTurnoRow } from "@/lib/verso/mappers";
import type { LimpezaTurno } from "@/lib/verso/types";
import { useResolucoesNcNr } from "@/hooks/use-nc-resolucoes";
import {
  agregarNcNr,
  type RegistroNcNr,
} from "@/lib/checklist/nao-conformidades";
import {
  chaveRegistro,
  chaveResolucao,
  type ResolucaoNcNr,
} from "@/lib/nao-conformidades/resolucoes";
import {
  calcularAgingPendentes,
  calcularItensCronicos,
  calcularKpisTempo,
  calcularPerformanceEquipe,
  calcularPerformanceTurno,
  formatarDias,
  tomAging,
  SLA_DIAS,
  type RegistroComStatus,
} from "@/lib/nao-conformidades/aging";

export const Route = createFileRoute("/gestao/relatorio")({
  head: () => ({
    meta: [
      { title: "Relatório de Não Conformidades e Não Realizadas — Linha 3" },
      {
        name: "description",
        content:
          "Análise gerencial de NC do checklist FM09 e itens não realizados na limpeza, com aging, SLA e reincidência.",
      },
    ],
  }),
  component: RelatorioPage,
});

// ──────────────── Helpers de data Manaus ────────────────
function hojeManausYMD(offsetDias = 0): string {
  const agora = new Date();
  const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60_000;
  const manaus = new Date(utcMs - 4 * 60 * 60_000);
  manaus.setDate(manaus.getDate() + offsetDias);
  const y = manaus.getFullYear();
  const m = String(manaus.getMonth() + 1).padStart(2, "0");
  const d = String(manaus.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function primeiroDiaMesYMD(): string {
  return `${hojeManausYMD().slice(0, 7)}-01`;
}

type AtalhoId = "hoje" | "ontem" | "7d" | "30d" | "mes";

const FILTROS_PADRAO: FiltrosRelatorio = {
  dataInicio: hojeManausYMD(-29),
  dataFim: hojeManausYMD(),
  turno: "Todos",
  equipe: "Todas",
  momento: "Todos",
  statusAnomalia: "Todos",
  criticidade: "Todas",
  categoria: "Todas",
  equipamentoAfetado: "Todos",
};

function diffDiasYMD(de: string, ate: string): number {
  const a = new Date(de + "T00:00:00").getTime();
  const b = new Date(ate + "T00:00:00").getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function RelatorioPage() {
  const { usuario, loading } = useGuard("gestao");
  const { data: checklists } = useChecklistsRemote({ realtime: true });
  const { data: resolucoes } = useResolucoesNcNr(180);

  const [rascunho, setRascunho] = useState<FiltrosRelatorio>(FILTROS_PADRAO);
  const [aplicado, setAplicado] = useState<FiltrosRelatorio>(FILTROS_PADRAO);
  const [agingFiltro, setAgingFiltro] = useState<"todas" | "sla">("todas");

  // Carregamento de turnos de limpeza para NR (mesmo padrão da tela /gestao/nao-conformidades)
  const [turnosLimpeza, setTurnosLimpeza] = useState<LimpezaTurno[]>([]);
  useEffect(() => {
    let cancelado = false;
    const desde = new Date();
    desde.setDate(desde.getDate() - 180);
    const dataIso = desde.toISOString().slice(0, 10);
    void (async () => {
      const { data, error } = await supabase
        .from("limpeza_turnos" as never)
        .select("*")
        .gte("data_operacao", dataIso);
      if (cancelado) return;
      if (error) {
        console.error("[gestao.relatorio] limpeza fetch:", error);
        setTurnosLimpeza([]);
      } else {
        setTurnosLimpeza(
          ((data ?? []) as unknown as LimpezaTurnoRow[]).map(limpezaTurnoFromRow),
        );
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const { counts: edicoesPeriodo } = useEdicoesPorPeriodo(
    aplicado.dataInicio,
    aplicado.dataFim,
  );

  // Listas dinâmicas a partir dos checklists
  const equipesDisponiveis = useMemo(() => {
    const s = new Set<string>();
    checklists.forEach((c) => s.add(c.contexto.equipe));
    return Array.from(s).sort();
  }, [checklists]);

  const turnosDisponiveis = useMemo(() => {
    const s = new Set<string>();
    checklists.forEach((c) => s.add(c.contexto.turno));
    return Array.from(s).sort();
  }, [checklists]);

  // Dados filtrados
  const checklistsFiltrados = useMemo(
    () => filtrarChecklists(checklists, aplicado),
    [checklists, aplicado],
  );

  // Janela em dias que cobre o intervalo selecionado
  const diasJanela = useMemo(
    () => diffDiasYMD(aplicado.dataInicio, aplicado.dataFim),
    [aplicado.dataInicio, aplicado.dataFim],
  );

  // Agregação NC + NR (filtragem por período da janela; depois aplicamos filtros)
  const agregado = useMemo(
    () => agregarNcNr(checklists, turnosLimpeza, diasJanela),
    [checklists, turnosLimpeza, diasJanela],
  );

  const resolucoesPorChave = useMemo(() => {
    const m = new Map<string, ResolucaoNcNr>();
    for (const r of resolucoes) m.set(chaveResolucao(r), r);
    return m;
  }, [resolucoes]);

  // Aplicar filtros (data início/fim, turno, equipe, momento) sobre os registros
  const registrosComStatus = useMemo<RegistroComStatus[]>(() => {
    return agregado.registros
      .filter((r) => {
        if (r.data < aplicado.dataInicio) return false;
        if (r.data > aplicado.dataFim) return false;
        if (aplicado.turno && aplicado.turno !== "Todos" && r.turno !== aplicado.turno)
          return false;
        if (
          aplicado.equipe &&
          aplicado.equipe !== "Todas" &&
          r.equipe !== aplicado.equipe
        )
          return false;
        if (
          aplicado.momento &&
          aplicado.momento !== "Todos" &&
          r.origem === "checklist" &&
          r.momento !== aplicado.momento
        )
          return false;
        return true;
      })
      .map((r) => ({
        registro: r,
        resolucao: resolucoesPorChave.get(chaveRegistro(r)) ?? null,
      }));
  }, [agregado.registros, aplicado, resolucoesPorChave]);

  const totalNc = useMemo(
    () => registrosComStatus.filter((x) => x.registro.origem === "checklist").length,
    [registrosComStatus],
  );
  const totalNr = useMemo(
    () => registrosComStatus.filter((x) => x.registro.origem === "limpeza").length,
    [registrosComStatus],
  );
  const pendentes = useMemo(
    () => registrosComStatus.filter((x) => !x.resolucao).length,
    [registrosComStatus],
  );
  const resolvidasCount = useMemo(
    () => registrosComStatus.filter((x) => x.resolucao).length,
    [registrosComStatus],
  );

  const kpisTempo = useMemo(
    () => calcularKpisTempo(registrosComStatus),
    [registrosComStatus],
  );

  const agingTodas = useMemo(
    () => calcularAgingPendentes(registrosComStatus),
    [registrosComStatus],
  );
  const agingFiltrado = useMemo(
    () => (agingFiltro === "sla" ? agingTodas.filter((x) => x.estouroSla) : agingTodas),
    [agingTodas, agingFiltro],
  );

  const cronicos = useMemo(
    () => calcularItensCronicos(registrosComStatus),
    [registrosComStatus],
  );
  const perfTurno = useMemo(
    () => calcularPerformanceTurno(registrosComStatus),
    [registrosComStatus],
  );
  const perfEquipe = useMemo(
    () => calcularPerformanceEquipe(registrosComStatus),
    [registrosComStatus],
  );

  // Resumo executivo de checklist (somente parte de NC/observações)
  const resumo = useMemo(
    () => calcularResumoExecutivo(checklistsFiltrados, []),
    [checklistsFiltrados],
  );
  const disciplina = useMemo(
    () => calcularDisciplinaFM09(checklistsFiltrados, [], edicoesPeriodo),
    [checklistsFiltrados, edicoesPeriodo],
  );
  const faixas = useMemo(
    () => calcularFaixasHorarias(checklistsFiltrados, []),
    [checklistsFiltrados],
  );

  // Ações imediatas (regras locais focadas em NC/NR)
  const acoes = useMemo(() => {
    const itens: { texto: string; destaque: "destructive" | "warning" | "primary" }[] =
      [];
    if (kpisTempo.slaEstourado > 0) {
      itens.push({
        texto: `${kpisTempo.slaEstourado} pendência(s) com SLA estourado (>${SLA_DIAS} dias).`,
        destaque: "destructive",
      });
    }
    const reincidentes = cronicos.filter((c) => c.reincidencias >= 2);
    if (reincidentes.length > 0) {
      itens.push({
        texto: `${reincidentes.length} item(ns) crônico(s) com reincidência ≥ 2 — investigar causa raiz.`,
        destaque: "warning",
      });
    }
    const turnoCarga = [...perfTurno].sort((a, b) => b.pendentes - a.pendentes)[0];
    if (turnoCarga && turnoCarga.pendentes > 0) {
      itens.push({
        texto: `Turno ${turnoCarga.turno} concentra a maior carga pendente (${turnoCarga.pendentes}).`,
        destaque: "warning",
      });
    }
    const faixaTop = [...faixas].sort((a, b) => b.nc - a.nc)[0];
    if (faixaTop && faixaTop.nc > 0) {
      itens.push({
        texto: `Faixa ${faixaTop.label} concentra a maior incidência de NC (${faixaTop.nc}).`,
        destaque: "primary",
      });
    }
    const total = pendentes + resolvidasCount;
    if (total > 0) {
      const pct = (pendentes / total) * 100;
      if (pct >= 60) {
        itens.push({
          texto: `${pct.toFixed(0)}% dos registros do período seguem pendentes — risco de acúmulo.`,
          destaque: "destructive",
        });
      }
    }
    if (kpisTempo.maisAntigaDias !== null && kpisTempo.maisAntigaDias > SLA_DIAS) {
      itens.push({
        texto: `Pendência mais antiga: ${formatarDias(kpisTempo.maisAntigaDias)} — ${kpisTempo.maisAntigaItem ?? "—"}.`,
        destaque: "destructive",
      });
    }
    return itens;
  }, [kpisTempo, cronicos, perfTurno, faixas, pendentes, resolvidasCount]);

  // ─── Verso (PTP + Limpeza) ──────────────────────────────────────────
  const versoRel = useVersoRelatorioRemote(aplicado.dataInicio, aplicado.dataFim);
  const referenciaFrente = useMemo(
    () => construirReferenciaFrente(checklistsFiltrados),
    [checklistsFiltrados],
  );
  const aderencia = useMemo(
    () => cruzarFrenteVerso(referenciaFrente, versoRel.ptp, versoRel.limpeza),
    [referenciaFrente, versoRel.ptp, versoRel.limpeza],
  );
  const ptpDoRecorte = useMemo(
    () => filtrarPtpDoRecorte(referenciaFrente, versoRel.ptp),
    [referenciaFrente, versoRel.ptp],
  );
  const limpezaDoRecorte = useMemo(
    () => filtrarLimpezaDoRecorte(referenciaFrente, versoRel.limpeza),
    [referenciaFrente, versoRel.limpeza],
  );
  const resumoVerso = useMemo(
    () => calcularResumoVersoRelatorio(aderencia),
    [aderencia],
  );
  const diagPtp = useMemo(
    () => calcularDiagnosticoPtp(ptpDoRecorte, referenciaFrente),
    [ptpDoRecorte, referenciaFrente],
  );
  const diagLimp = useMemo(
    () => calcularDiagnosticoLimpeza(limpezaDoRecorte, resumoVerso.limpezasEsperadas),
    [limpezaDoRecorte, resumoVerso.limpezasEsperadas],
  );
  const alertasVerso = useMemo(
    () => calcularAlertasVerso({ aderencia, resumo: resumoVerso, diagPtp, diagLimp }),
    [aderencia, resumoVerso, diagPtp, diagLimp],
  );
  const fora = useMemo(
    () => registrosVersoForaDoRecorte(referenciaFrente, versoRel.ptp, versoRel.limpeza),
    [referenciaFrente, versoRel.ptp, versoRel.limpeza],
  );

  if (loading || !usuario) return <TelaCarregando />;

  const aplicarAtalho = (id: AtalhoId) => {
    let inicio = rascunho.dataInicio;
    let fim = rascunho.dataFim;
    if (id === "hoje") inicio = fim = hojeManausYMD();
    else if (id === "ontem") inicio = fim = hojeManausYMD(-1);
    else if (id === "7d") {
      inicio = hojeManausYMD(-6);
      fim = hojeManausYMD();
    } else if (id === "30d") {
      inicio = hojeManausYMD(-29);
      fim = hojeManausYMD();
    } else if (id === "mes") {
      inicio = primeiroDiaMesYMD();
      fim = hojeManausYMD();
    }
    setRascunho({ ...rascunho, dataInicio: inicio, dataFim: fim });
  };

  const aplicarFiltros = () => setAplicado(rascunho);
  const limparFiltros = () => {
    setRascunho(FILTROS_PADRAO);
    setAplicado(FILTROS_PADRAO);
  };

  const semDados = checklistsFiltrados.length === 0 && registrosComStatus.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Relatório de NC e NR"
        subtitulo="Linha 3 — Não conformidades do checklist e itens não realizados na limpeza"
        voltarPara="/gestao"
      />

      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10 print:px-0">
        {/* Filtros */}
        <section className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6 print:hidden">
          <div className="mb-4 flex items-center gap-2">
            <FilterIcon className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Filtros</h2>
          </div>

          {/* Atalhos */}
          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                ["hoje", "Hoje", hojeManausYMD(), hojeManausYMD()],
                ["ontem", "Ontem", hojeManausYMD(-1), hojeManausYMD(-1)],
                ["7d", "Últimos 7 dias", hojeManausYMD(-6), hojeManausYMD()],
                ["30d", "Últimos 30 dias", hojeManausYMD(-29), hojeManausYMD()],
                ["mes", "Este mês", primeiroDiaMesYMD(), hojeManausYMD()],
              ] as const
            ).map(([id, label, ini, fim]) => {
              const ativo =
                rascunho.dataInicio === ini && rascunho.dataFim === fim;
              return (
                <Button
                  key={id}
                  variant={ativo ? "default" : "outline"}
                  size="sm"
                  onClick={() => aplicarAtalho(id)}
                  className="transition-transform active:scale-95"
                >
                  {label}
                </Button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="ini">Data inicial</Label>
              <Input
                id="ini"
                type="date"
                value={rascunho.dataInicio}
                onChange={(e) =>
                  setRascunho({ ...rascunho, dataInicio: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="fim">Data final</Label>
              <Input
                id="fim"
                type="date"
                value={rascunho.dataFim}
                onChange={(e) => setRascunho({ ...rascunho, dataFim: e.target.value })}
              />
            </div>

            <FiltroSelect
              label="Turno"
              value={String(rascunho.turno ?? "Todos")}
              onChange={(v) =>
                setRascunho({ ...rascunho, turno: v as FiltrosRelatorio["turno"] })
              }
              opcoes={["Todos", ...turnosDisponiveis]}
            />
            <FiltroSelect
              label="Equipe"
              value={String(rascunho.equipe ?? "Todas")}
              onChange={(v) =>
                setRascunho({ ...rascunho, equipe: v as FiltrosRelatorio["equipe"] })
              }
              opcoes={["Todas", ...equipesDisponiveis]}
            />
            <FiltroSelect
              label="Momento do checklist"
              value={String(rascunho.momento ?? "Todos")}
              onChange={(v) =>
                setRascunho({ ...rascunho, momento: v as FiltrosRelatorio["momento"] })
              }
              opcoes={["Todos", ...MOMENTOS_CHECKLIST]}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              onClick={aplicarFiltros}
              className="transition-transform active:scale-95"
            >
              <FileBarChart2 className="mr-2 h-4 w-4" />
              Gerar Relatório
            </Button>
            <Button
              variant="outline"
              onClick={limparFiltros}
              className="transition-transform active:scale-95"
            >
              Limpar filtros
            </Button>
          </div>
        </section>

        {semDados ? (
          <EstadoVazio />
        ) : (
          <>
            {/* BLOCO 1 — Resumo executivo NC/NR */}
            <Bloco titulo="1 · Resumo Executivo (NC e NR)">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi titulo="Folhas registradas" valor={resumo.folhasRegistradas} />
                <Kpi
                  titulo="Folhas completas"
                  valor={`${resumo.folhasCompletas}`}
                  sub={`${resumo.taxaCompletude}% de completude`}
                />
                <Kpi titulo="Itens avaliados" valor={resumo.itensAvaliados} />
                <Kpi
                  titulo="% Conformes"
                  valor={`${resumo.pctConformes}%`}
                  sub={`${resumo.pctNaoConformes}% NC`}
                  destaque="success"
                />
                <Kpi
                  titulo="Não conformidades"
                  valor={totalNc}
                  destaque={totalNc > 0 ? "destructive" : undefined}
                />
                <Kpi
                  titulo="Não realizadas"
                  valor={totalNr}
                  destaque={totalNr > 0 ? "warning" : undefined}
                />
                <Kpi
                  titulo="Pendentes"
                  valor={pendentes}
                  destaque={pendentes > 0 ? "destructive" : "success"}
                />
                <Kpi titulo="Resolvidas" valor={resolvidasCount} destaque="success" />
                <Kpi
                  titulo="Tempo médio resolução"
                  valor={formatarDias(kpisTempo.tempoMedioResolucao)}
                />
                <Kpi
                  titulo="% resolvidas em ≤ 24h"
                  valor={
                    kpisTempo.percentualEm24h === null
                      ? "—"
                      : `${kpisTempo.percentualEm24h.toFixed(0)}%`
                  }
                  destaque="success"
                />
                <Kpi
                  titulo="Pendência mais antiga"
                  valor={formatarDias(kpisTempo.maisAntigaDias)}
                  sub={kpisTempo.maisAntigaItem ?? undefined}
                  destaque={
                    (kpisTempo.maisAntigaDias ?? 0) > SLA_DIAS ? "destructive" : undefined
                  }
                />
                <Kpi
                  titulo={`SLA estourado (>${SLA_DIAS}d)`}
                  valor={kpisTempo.slaEstourado}
                  destaque={kpisTempo.slaEstourado > 0 ? "destructive" : "success"}
                />
              </div>
            </Bloco>

            {/* BLOCO 2 — Disciplina FM09 */}
            <Bloco titulo="2 · Disciplina do Checklist FM09">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TabelaSimples
                  titulo="Cumprimento por turno"
                  colunas={["Turno", "Folhas", "Completas", "Taxa"]}
                  linhas={disciplina.porTurno.map((r) => [
                    r.chave,
                    r.folhasRegistradas,
                    r.folhasCompletas,
                    `${r.taxaCompletude}%`,
                  ])}
                />
                <TabelaSimples
                  titulo="Cumprimento por equipe"
                  colunas={["Equipe", "Folhas", "Completas", "Taxa"]}
                  linhas={disciplina.porEquipe.map((r) => [
                    r.chave,
                    r.folhasRegistradas,
                    r.folhasCompletas,
                    `${r.taxaCompletude}%`,
                  ])}
                />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TabelaSimples
                  titulo="Cumprimento por momento"
                  colunas={["Momento", "Concluídos", "Pendentes"]}
                  linhas={disciplina.porMomento.map((r) => [
                    r.momento,
                    r.concluidos,
                    r.pendentes,
                  ])}
                />
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-medium text-muted-foreground">
                    Auditoria de checklist
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-3xl font-bold text-foreground">
                        {disciplina.checklistsAlterados}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Checklists alterados
                      </p>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-foreground">
                        {disciplina.totalAlteracoes}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Total de alterações
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <h4 className="mb-2 text-sm font-semibold text-foreground">
                  Top 5 itens com mais NC
                </h4>
                <GraficoBarrasItens
                  dados={disciplina.topItensNC}
                  cor="var(--color-destructive)"
                />
              </div>
            </Bloco>

            {/* BLOCO 3 — Aging das pendências */}
            <Bloco titulo="3 · Aging das Pendências (NC e NR)">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  Pendências ordenadas da mais antiga para a mais recente. SLA = {SLA_DIAS}{" "}
                  dias.
                </p>
                <div className="flex gap-1.5 rounded-lg border border-border bg-muted/40 p-1">
                  <button
                    onClick={() => setAgingFiltro("todas")}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      agingFiltro === "todas"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Todas ({agingTodas.length})
                  </button>
                  <button
                    onClick={() => setAgingFiltro("sla")}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      agingFiltro === "sla"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    SLA estourado ({agingTodas.filter((x) => x.estouroSla).length})
                  </button>
                </div>
              </div>

              {agingFiltrado.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                  {agingFiltro === "sla"
                    ? "Nenhuma pendência acima do SLA. ✅"
                    : "Sem pendências no período. ✅"}
                </p>
              ) : (
                <TabelaAging linhas={agingFiltrado.slice(0, 20)} />
              )}
            </Bloco>

            {/* BLOCO 4 — Faixas horárias */}
            <Bloco titulo="4 · Faixas Horárias Críticas (NC)">
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={faixas}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="label"
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                    />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                      }}
                    />
                    <Legend />
                    <Bar dataKey="nc" name="NC" fill="var(--color-destructive)" />
                    <Bar
                      dataKey="observacoes"
                      name="Observações"
                      fill="var(--color-chart-3)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Bloco>

            {/* BLOCO 5 — Itens crônicos */}
            <Bloco titulo="5 · Itens Crônicos e Reincidência">
              {cronicos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sem itens crônicos no período.
                </p>
              ) : (
                <TabelaSimples
                  titulo="Top 15 itens com mais ocorrências"
                  colunas={[
                    "Origem",
                    "Item",
                    "Descrição",
                    "Ocorrências",
                    "Pendentes",
                    "Reincidências",
                    "T. médio resol.",
                  ]}
                  linhas={cronicos.slice(0, 15).map((c) => [
                    c.origem === "checklist" ? "NC" : "NR",
                    `Item ${c.itemNumero}`,
                    c.descricao,
                    c.ocorrencias,
                    c.pendentes,
                    c.reincidencias,
                    formatarDias(c.tempoMedioResolucao),
                  ])}
                />
              )}
            </Bloco>

            {/* BLOCO 6 — Performance por turno e equipe */}
            <Bloco titulo="6 · Performance de Resolução">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TabelaSimples
                  titulo="Por turno"
                  colunas={[
                    "Turno",
                    "Total",
                    "Resolv.",
                    "Pend.",
                    "% Resolv.",
                    "T. médio",
                    "Acima SLA",
                  ]}
                  linhas={perfTurno.map((r) => [
                    r.turno,
                    r.total,
                    r.resolvidas,
                    r.pendentes,
                    `${r.percentualResolvido.toFixed(0)}%`,
                    formatarDias(r.tempoMedioResolucao),
                    r.pendentesAcimaSla,
                  ])}
                />
                <TabelaSimples
                  titulo="Por equipe"
                  colunas={[
                    "Equipe",
                    "Total",
                    "Resolv.",
                    "Pend.",
                    "% Resolv.",
                    "T. médio",
                    "Acima SLA",
                  ]}
                  linhas={perfEquipe.map((r) => [
                    r.equipe,
                    r.total,
                    r.resolvidas,
                    r.pendentes,
                    `${r.percentualResolvido.toFixed(0)}%`,
                    formatarDias(r.tempoMedioResolucao),
                    r.pendentesAcimaSla,
                  ])}
                />
              </div>
            </Bloco>

            {/* BLOCO 7 — Ação imediata */}
            <Bloco titulo="7 · O que exige ação imediata">
              {acoes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum ponto crítico identificado no período.
                </p>
              ) : (
                <ul className="space-y-2">
                  {acoes.map((a, i) => (
                    <li
                      key={i}
                      className={`flex items-start gap-3 rounded-lg border p-3 ${
                        a.destaque === "destructive"
                          ? "border-destructive/30 bg-destructive/5"
                          : a.destaque === "warning"
                            ? "border-warning/30 bg-warning/5"
                            : "border-border bg-muted/30"
                      }`}
                    >
                      <span
                        className={`mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                          a.destaque === "destructive"
                            ? "bg-destructive"
                            : a.destaque === "warning"
                              ? "bg-warning"
                              : "bg-primary"
                        }`}
                      />
                      <span className="text-sm font-medium text-foreground">
                        {a.texto}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Bloco>

            {/* ── BLOCOS 8–12 · VERSO (PTP + Limpeza) ─────────────────── */}
            <VersoErrorBoundary>
              {versoRel.error ? (
                <Bloco titulo="Verso da folha — PTP e Limpeza">
                  <p className="text-sm text-muted-foreground">
                    Não foi possível carregar os dados do verso.
                  </p>
                </Bloco>
              ) : referenciaFrente.length === 0 ? (
                <Bloco titulo="Verso da folha — PTP e Limpeza">
                  <p className="text-sm text-muted-foreground">
                    Sem turnos da frente no recorte para avaliar verso.
                  </p>
                </Bloco>
              ) : (
                <>
                  {/* BLOCO 8 — Resumo do verso */}
                  <Bloco titulo="8 · Verso da folha — Resumo">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <Kpi titulo="Turnos da frente" valor={resumoVerso.turnosFrente} />
                      <Kpi
                        titulo="Verso completo"
                        valor={resumoVerso.turnosVersoCompleto}
                        sub={`${resumoVerso.taxaAderencia}% de aderência`}
                        destaque="success"
                      />
                      <Kpi titulo="PTP esperadas" valor={resumoVerso.ptpEsperadas} />
                      <Kpi titulo="PTP registradas" valor={resumoVerso.ptpRegistradas} />
                      <Kpi
                        titulo="PTP pendentes"
                        valor={resumoVerso.ptpPendentes}
                        destaque={resumoVerso.ptpPendentes > 0 ? "warning" : undefined}
                      />
                      <Kpi
                        titulo="PTP c/ ocorrência"
                        valor={resumoVerso.ptpComOcorrencia}
                        destaque={
                          resumoVerso.ptpComOcorrencia > 0 ? "destructive" : undefined
                        }
                      />
                      <Kpi titulo="Não rodou" valor={resumoVerso.ptpNaoRodou} />
                      <Kpi
                        titulo="Limpezas esperadas"
                        valor={resumoVerso.limpezasEsperadas}
                      />
                      <Kpi
                        titulo="Validadas"
                        valor={resumoVerso.limpezasValidadas}
                        destaque="success"
                      />
                      <Kpi
                        titulo="Aguardando líder"
                        valor={resumoVerso.limpezasAguardandoLider}
                        destaque={
                          resumoVerso.limpezasAguardandoLider > 0 ? "warning" : undefined
                        }
                      />
                      <Kpi
                        titulo="Pendentes/rascunho"
                        valor={resumoVerso.limpezasPendentesOuRascunho}
                        destaque={
                          resumoVerso.limpezasPendentesOuRascunho > 0
                            ? "warning"
                            : undefined
                        }
                      />
                      <Kpi
                        titulo="Análise de Ângulo"
                        valor={`${resumoVerso.analiseAnguloRealizadas} / ${resumoVerso.analiseAnguloEsperadas}`}
                        sub="verificações realizadas"
                      />
                      <Kpi
                        titulo="% Aderência Ângulo"
                        valor={`${resumoVerso.taxaAnaliseAngulo}%`}
                        destaque={
                          resumoVerso.analiseAnguloEsperadas === 0
                            ? undefined
                            : resumoVerso.taxaAnaliseAngulo >= 70
                              ? "success"
                              : resumoVerso.taxaAnaliseAngulo >= 40
                                ? "warning"
                                : "destructive"
                        }
                      />
                      <Kpi
                        titulo="Pendências Ângulo"
                        valor={resumoVerso.analiseAnguloPendentes}
                        destaque={
                          resumoVerso.analiseAnguloPendentes > 0 ? "warning" : undefined
                        }
                      />
                    </div>
                  </Bloco>

                  {/* BLOCO 9 — Aderência frente × verso */}
                  <Bloco titulo="9 · Aderência documental Frente × Verso">
                    <TabelaAderenciaVerso linhas={aderencia} />
                    {(fora.ptp.length > 0 || fora.limpeza.length > 0) && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Registros do verso fora do recorte documental da frente:{" "}
                        {fora.ptp.length} janela(s) PTP, {fora.limpeza.length}{" "}
                        limpeza(s). Não entram no denominador de aderência.
                      </p>
                    )}
                  </Bloco>

                  {/* BLOCO 10 — Diagnóstico PTP */}
                  <Bloco titulo="10 · Diagnóstico PTP">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <TabelaSimples
                        titulo="Distribuição por status das janelas"
                        colunas={["Status", "Total"]}
                        linhas={diagPtp.porStatus.map((r) => [r.chave, r.total])}
                      />
                      <TabelaSimples
                        titulo="Top itens (ocorrências reais)"
                        colunas={["Item", "Ocorrências"]}
                        linhas={diagPtp.topItens.map((r) => [r.nome, r.ocorrencias])}
                      />
                    </div>
                    <div className="mt-4">
                      <h4 className="mb-2 text-sm font-semibold text-foreground">
                        Ocorrências por janela (J01..J12)
                      </h4>
                      <GraficoBarras
                        dados={diagPtp.porJanela}
                        cor="var(--color-chart-1)"
                      />
                    </div>

                    <TabelaSimples
                      titulo="Detalhamento das ocorrências (PTP)"
                      colunas={["Data", "Turno", "Horário", "Item", "Qtd", "Motivo"]}
                      linhas={diagPtp.ocorrenciasLista.slice(0, 50).map((o) => [
                        o.dataOperacao.split("-").reverse().join("/"),
                        o.turno,
                        o.horario.includes("T")
                          ? o.horario.split("T")[1].slice(0, 5)
                          : o.horario,
                        o.itemNome,
                        o.quantidade,
                        o.motivo || "—",
                      ])}
                    />

                    {diagPtp.comObservacao.length > 0 && (

                      <TabelaSimples
                        titulo="Janelas com observação registrada"
                        colunas={["Data", "Turno", "Janela", "Observação"]}
                        linhas={diagPtp.comObservacao
                          .slice(0, 20)
                          .map((r) => [
                            r.dataOperacao,
                            r.turno,
                            r.janelaCodigo,
                            r.observacao,
                          ])}
                      />
                    )}
                    {diagPtp.analiseAnguloPorJanela.length > 0 && (
                      <div className="mt-4">
                        <TabelaAnaliseAngulo linhas={diagPtp.analiseAnguloPorJanela} />
                      </div>
                    )}
                  </Bloco>

                  {/* BLOCO 11 — Diagnóstico Limpeza */}
                  <Bloco titulo="11 · Diagnóstico Limpeza">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <Kpi
                        titulo="Validação do líder"
                        valor={`${diagLimp.taxaValidacaoLider}%`}
                        destaque="success"
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <TabelaSimples
                        titulo="Distribuição por status do turno"
                        colunas={["Status", "Total"]}
                        linhas={diagLimp.porStatus.map((r) => [r.chave, r.total])}
                      />
                      <TabelaSimples
                        titulo="Top 5 itens não realizados"
                        colunas={["Item", "Descrição", "Total"]}
                        linhas={diagLimp.topItensNaoRealizados.map((r) => [
                          `Item ${r.codigo}`,
                          r.descricao,
                          r.total,
                        ])}
                      />
                    </div>
                    {diagLimp.serieDiariaNaoRealizados.length > 0 && (
                      <div className="mt-4">
                        <GraficoNaoRealizadosPorDia
                          dados={diagLimp.serieDiariaNaoRealizados}
                        />
                      </div>
                    )}
                  </Bloco>

                  {/* BLOCO 12 — Alertas operacionais do verso */}
                  <Bloco titulo="12 · Alertas operacionais do verso">
                    {alertasVerso.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum alerta no período.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {alertasVerso.map((a, i) => (
                          <li
                            key={i}
                            className={`flex items-start gap-3 rounded-lg border p-3 ${
                              a.destaque === "destructive"
                                ? "border-destructive/30 bg-destructive/5"
                                : a.destaque === "warning"
                                  ? "border-warning/30 bg-warning/5"
                                  : "border-border bg-muted/30"
                            }`}
                          >
                            <span
                              className={`mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                                a.destaque === "destructive"
                                  ? "bg-destructive"
                                  : a.destaque === "warning"
                                    ? "bg-warning"
                                    : "bg-primary"
                              }`}
                            />
                            <span className="text-sm font-medium text-foreground">
                              {a.texto}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Bloco>
                </>
              )}
            </VersoErrorBoundary>
          </>
        )}
      </main>
    </div>
  );
}

// ──────────────── Subcomponentes ────────────────
function FiltroSelect({
  label,
  value,
  onChange,
  opcoes,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opcoes: string[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6 print:break-inside-avoid">
      <h3 className="mb-4 text-base font-bold text-foreground md:text-lg">{titulo}</h3>
      {children}
    </section>
  );
}

function Kpi({
  titulo,
  valor,
  sub,
  destaque,
}: {
  titulo: string;
  valor: number | string;
  sub?: string;
  destaque?: "destructive" | "warning" | "success" | "primary";
}) {
  const cor =
    destaque === "destructive"
      ? "text-destructive"
      : destaque === "warning"
        ? "text-warning-foreground"
        : destaque === "success"
          ? "text-success"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <p className={`mt-1 text-2xl font-bold md:text-3xl ${cor}`}>{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function TabelaSimples({
  titulo,
  colunas,
  linhas,
}: {
  titulo: string;
  colunas: string[];
  linhas: (string | number)[][];
}) {
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-border bg-background">
      <div className="border-b border-border bg-muted/30 px-3 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {titulo}
        </h4>
      </div>
      {linhas.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">Sem dados.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/20">
              <tr>
                {colunas.map((c) => (
                  <th
                    key={c}
                    className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} className="border-t border-border">
                  {l.map((v, j) => (
                    <td key={j} className="px-3 py-2 text-foreground">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ──────────────── Tabela de Aging ────────────────
type AgingItemProp = {
  registro: RegistroNcNr;
  diasEmAberto: number;
  estouroSla: boolean;
};

function TabelaAging({ linhas }: { linhas: AgingItemProp[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                Origem
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                Data
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                Turno
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                Item
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                Descrição
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                Observação
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                Em aberto
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((x, i) => {
              const tom = tomAging(x.diasEmAberto);
              const cls =
                tom === "success"
                  ? "border-success/30 bg-success/10 text-success"
                  : tom === "warning"
                    ? "border-warning/30 bg-warning/10 text-warning-foreground"
                    : "border-destructive/30 bg-destructive/10 text-destructive";
              return (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2">
                    <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {x.registro.origem === "checklist" ? "NC" : "NR"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-foreground">
                    {x.registro.data}
                  </td>
                  <td className="px-3 py-2 text-foreground">{x.registro.turno}</td>
                  <td className="px-3 py-2 text-foreground">
                    #{x.registro.itemNumero}
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    {x.registro.itemDescricao}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {x.registro.observacao.length > 80
                      ? x.registro.observacao.slice(0, 80) + "…"
                      : x.registro.observacao}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
                    >
                      {formatarDias(x.diasEmAberto)}
                      {x.estouroSla ? " · SLA" : ""}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GraficoNaoRealizadosPorDia({
  dados,
}: {
  dados: { data: string; total: number }[];
}) {
  const serie = useMemo(
    () => [...dados].sort((a, b) => a.data.localeCompare(b.data)),
    [dados],
  );
  const totalNc = serie.reduce((s, r) => s + r.total, 0);
  const pico = serie.reduce((max, r) => (r.total > max.total ? r : max), serie[0]);
  const media = serie.length > 0 ? totalNc / serie.length : 0;

  const formatarData = (iso: string) => {
    const [, m, d] = iso.split("-");
    return d && m ? `${d}/${m}` : iso;
  };

  const corPorTotal = (total: number): string => {
    if (total === 0) return "var(--color-success)";
    if (pico.total <= 0) return "var(--color-success)";
    const ratio = total / pico.total;
    if (ratio <= 0.34) return "var(--color-success)";
    if (ratio <= 0.67) return "var(--color-warning)";
    return "var(--color-destructive)";
  };

  const dadosChart = serie.map((r) => ({
    dataLabel: formatarData(r.data),
    total: r.total,
    cor: corPorTotal(r.total),
  }));

  const larguraPorBarra = 56;
  const larguraMin = serie.length * larguraPorBarra + 60;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">
          Itens não realizados por dia
        </h4>
        <span className="text-xs text-muted-foreground">
          {serie.length} dia{serie.length > 1 ? "s" : ""} · {totalNc} no total
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Cada barra é um dia. Quanto mais alta e mais vermelha, pior. Pico em{" "}
        <span className="font-medium text-foreground">{formatarData(pico.data)}</span> (
        {pico.total}).
      </p>

      <div className="overflow-x-auto">
        <div style={{ minWidth: larguraMin, height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dadosChart}
              margin={{ top: 20, right: 12, bottom: 8, left: 0 }}
              barCategoryGap={6}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                vertical={false}
              />
              <XAxis
                dataKey="dataLabel"
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "var(--color-border)" }}
              />
              <YAxis
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                allowDecimals={false}
                width={28}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number) => [value, "Itens não realizados"]}
                labelFormatter={(label: string) => `Dia ${label}`}
              />
              {media > 0 && (
                <ReferenceLine
                  y={media}
                  stroke="var(--color-muted-foreground)"
                  strokeDasharray="4 4"
                  label={{
                    value: `média ${media.toFixed(1)}`,
                    position: "right",
                    fill: "var(--color-muted-foreground)",
                    fontSize: 10,
                  }}
                />
              )}
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                {dadosChart.map((d, i) => (
                  <Cell key={i} fill={d.cor} />
                ))}
                <LabelList
                  dataKey="total"
                  position="top"
                  fill="var(--color-foreground)"
                  fontSize={11}
                  fontWeight={600}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-success" /> Tranquilo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-warning" /> Atenção
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-destructive" /> Crítico
        </span>
      </div>
    </div>
  );
}

function GraficoBarras({
  dados,
  cor,
  formatarChave,
  rotuloValor = "Total",
  larguraEixoY = 110,
}: {
  dados: { chave: string; total: number }[];
  cor: string;
  formatarChave?: (chave: string) => string;
  rotuloValor?: string;
  larguraEixoY?: number;
}) {
  if (dados.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem dados.</p>;
  }
  const dadosFormatados = dados.map((d) => ({
    ...d,
    chaveLabel: formatarChave ? formatarChave(d.chave) : d.chave,
  }));
  const maxTotal = Math.max(...dadosFormatados.map((d) => d.total), 0);
  const alturaPorBarra = 36;
  const altura = Math.max(220, dadosFormatados.length * alturaPorBarra + 40);
  return (
    <div className="w-full" style={{ height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={dadosFormatados}
          layout="vertical"
          margin={{ top: 8, right: 32, bottom: 8, left: 8 }}
          barCategoryGap={8}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
            horizontal={false}
          />
          <XAxis
            type="number"
            stroke="var(--color-muted-foreground)"
            fontSize={11}
            allowDecimals={false}
            domain={[0, Math.max(1, Math.ceil(maxTotal * 1.15))]}
          />
          <YAxis
            type="category"
            dataKey="chaveLabel"
            stroke="var(--color-muted-foreground)"
            fontSize={12}
            width={larguraEixoY}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number) => [value, rotuloValor]}
            labelFormatter={(label: string) => label}
          />
          <Bar dataKey="total" fill={cor} radius={[0, 6, 6, 0]} name={rotuloValor}>
            <LabelList
              dataKey="total"
              position="right"
              fill="var(--color-foreground)"
              fontSize={12}
              fontWeight={600}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function GraficoBarrasItens({
  dados,
  cor,
}: {
  dados: { numero: number; descricao: string; total: number }[];
  cor: string;
}) {
  const transformados = dados.map((d) => ({
    chave: `Item ${d.numero}`,
    total: d.total,
    descricao: d.descricao,
  }));
  return <GraficoBarras dados={transformados} cor={cor} />;
}

function EstadoVazio() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center">
      <ClipboardList className="mb-3 h-10 w-10 text-muted-foreground" />
      <p className="text-base font-medium text-foreground">
        Nenhum dado encontrado para os filtros selecionados.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Ajuste o período ou os filtros e clique em Gerar Relatório.
      </p>
    </div>
  );
}

// ──────────────── Verso ────────────────

const SITUACAO_LABEL: Record<SituacaoVerso, string> = {
  completo: "Completo",
  ptp_pendente: "PTP pendente",
  limpeza_pendente: "Limpeza pendente",
  verso_incompleto: "Verso incompleto",
  frente_sem_verso: "Frente sem verso",
};

const LIMP_LABEL: Record<string, string> = {
  pendente: "Pendente",
  rascunho: "Rascunho",
  aguardando_validacao: "Aguardando líder",
  validado: "Validado",
  ausente: "Não iniciada",
};

function TabelaAderenciaVerso({ linhas }: { linhas: LinhaAderencia[] }) {
  return (
    <TabelaSimples
      titulo="Aderência por turno da frente"
      colunas={["Data", "Turno", "Equipe", "PTP", "Limpeza", "Situação"]}
      linhas={linhas.map((r) => [
        r.dataOperacao,
        r.turno,
        r.equipe,
        `${r.ptpRealizadas}/${r.ptpEsperadas}`,
        LIMP_LABEL[r.limpezaStatus] ?? r.limpezaStatus,
        SITUACAO_LABEL[r.situacao],
      ])}
    />
  );
}

class VersoErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[VersoErrorBoundary]", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <section className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
          <h3 className="mb-2 text-base font-bold text-foreground md:text-lg">
            Verso da folha — PTP e Limpeza
          </h3>
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar os dados do verso.
          </p>
        </section>
      );
    }
    return this.props.children;
  }
}

// ──────────────── Tabela: Análise de Ângulo por Janela ────────────────
type AnaliseAnguloLinha = {
  dataOperacao: string;
  turno: string;
  janelaCodigo: string;
  janelaRotulo: string;
  v1Realizada: boolean;
  v2Realizada: boolean;
  realizadas: number;
  esperadas: number;
  status: "completa" | "parcial" | "pendente" | "nao_rodou";
};

function TabelaAnaliseAngulo({ linhas }: { linhas: AnaliseAnguloLinha[] }) {
  const [expandido, setExpandido] = useState(false);
  const totalLinhas = linhas.length;
  const LIMITE_LINHAS = 5;

  const formatarData = (iso: string) => {
    const [, m, d] = iso.split("-");
    return d && m ? `${d}/${m}` : iso;
  };

  const renderMarca = (realizada: boolean, naoRodou: boolean) => {
    if (naoRodou) {
      return <span className="font-mono text-xs text-muted-foreground">NR</span>;
    }
    return realizada ? (
      <span className="font-mono text-base text-success" aria-label="Realizada">
        ✓
      </span>
    ) : (
      <span
        className="font-mono text-base text-muted-foreground"
        aria-label="Não realizada"
      >
        —
      </span>
    );
  };

  const renderStatus = (s: AnaliseAnguloLinha["status"]) => {
    const cls =
      s === "completa"
        ? "border-success/30 bg-success/10 text-success"
        : s === "parcial"
          ? "border-warning/30 bg-warning/10 text-warning-foreground"
          : s === "nao_rodou"
            ? "border-border bg-muted/40 text-muted-foreground"
            : "border-destructive/30 bg-destructive/10 text-destructive";
    const label =
      s === "completa"
        ? "Completa"
        : s === "parcial"
          ? "Parcial"
          : s === "nao_rodou"
            ? "Não rodou"
            : "Pendente";
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
      >
        {label}
      </span>
    );
  };

  const linhasExibidas = expandido ? linhas : linhas.slice(0, LIMITE_LINHAS);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Análise de Ângulo por Janela
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Verificação de aderência (não conta como defeito). 2 verificações por janela.
          </p>
        </div>
        {totalLinhas > LIMITE_LINHAS && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpandido(!expandido)}
            className="h-8 px-2 text-xs text-primary hover:text-primary/80"
          >
            {expandido ? (
              <>
                Recolher <ChevronUp className="ml-1 h-3 w-3" />
              </>
            ) : (
              <>
                Clique aqui para expandir ({totalLinhas} itens){" "}
                <ChevronDown className="ml-1 h-3 w-3" />
              </>
            )}
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Turno</th>
              <th className="px-3 py-2 font-medium">Janela</th>
              <th className="px-3 py-2 text-center font-medium">V1</th>
              <th className="px-3 py-2 text-center font-medium">V2</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {linhasExibidas.map((r, i) => {
              const naoRodou = r.status === "nao_rodou";
              return (
                <tr
                  key={`${r.dataOperacao}-${r.turno}-${r.janelaCodigo}-${i}`}
                  className="border-b border-border/60 last:border-b-0"
                >
                  <td className="px-3 py-2 text-foreground">
                    {formatarData(r.dataOperacao)}
                  </td>
                  <td className="px-3 py-2 text-foreground">{r.turno}</td>
                  <td className="px-3 py-2 text-foreground">
                    <span className="font-mono text-xs">{r.janelaCodigo}</span>{" "}
                    <span className="text-xs text-muted-foreground">{r.janelaRotulo}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {renderMarca(r.v1Realizada, naoRodou)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {renderMarca(r.v2Realizada, naoRodou)}
                  </td>
                  <td className="px-3 py-2">{renderStatus(r.status)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!expandido && totalLinhas > LIMITE_LINHAS && (
        <div className="border-t border-border bg-muted/10 px-3 py-2 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpandido(true)}
            className="h-6 w-full text-[10px] text-muted-foreground hover:text-primary"
          >
            Mostrando {LIMITE_LINHAS} de {totalLinhas} itens. Clique para ver todos.
          </Button>
        </div>
      )}
    </div>
  );
}
