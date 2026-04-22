import { createFileRoute } from "@tanstack/react-router";
import { Component, useMemo, useState, type ReactNode } from "react";
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { FileBarChart2, Filter as FilterIcon, AlertTriangle, ClipboardList } from "lucide-react";
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
import { useChecklistsRemote, useAnomaliasRemote } from "@/hooks/use-storage";
import { useEdicoesPorPeriodo } from "@/hooks/use-edicoes-periodo";
import {
  calcularResumoExecutivo,
  calcularDisciplinaFM09,
  calcularAnomaliasTratativa,
  calcularFaixasHorarias,
  calcularRecorrencia,
  calcularComparativos,
  calcularAcoesImediatas,
  filtrarAnomalias,
  filtrarChecklists,
  reportFmt,
  type FiltrosRelatorio,
} from "@/lib/checklist/reporting";
import { MOMENTOS_CHECKLIST } from "@/lib/checklist/types";

export const Route = createFileRoute("/gestao/relatorio")({
  head: () => ({
    meta: [
      { title: "Relatório Gerencial Operacional — Linha 3" },
      {
        name: "description",
        content:
          "Consolidação de checklist FM09, anomalias, tratativa e recorrências da Linha 3.",
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

function RelatorioPage() {
  const { usuario, loading } = useGuard("gestao");
  const { data: checklists } = useChecklistsRemote({ realtime: true });
  const { data: anomalias } = useAnomaliasRemote({ realtime: true });

  const [rascunho, setRascunho] = useState<FiltrosRelatorio>(FILTROS_PADRAO);
  const [aplicado, setAplicado] = useState<FiltrosRelatorio>(FILTROS_PADRAO);

  const { counts: edicoesPeriodo } = useEdicoesPorPeriodo(
    aplicado.dataInicio,
    aplicado.dataFim,
  );

  // Listas dinâmicas a partir dos dados carregados
  const equipesDisponiveis = useMemo(() => {
    const s = new Set<string>();
    checklists.forEach((c) => s.add(c.contexto.equipe));
    anomalias.forEach((a) => s.add(a.equipe));
    return Array.from(s).sort();
  }, [checklists, anomalias]);

  const turnosDisponiveis = useMemo(() => {
    const s = new Set<string>();
    checklists.forEach((c) => s.add(c.contexto.turno));
    anomalias.forEach((a) => s.add(a.turno));
    return Array.from(s).sort();
  }, [checklists, anomalias]);

  const categoriasDisponiveis = useMemo(() => {
    const s = new Set<string>();
    anomalias.forEach((a) => s.add(a.categoria));
    return Array.from(s).sort();
  }, [anomalias]);

  const equipamentosDisponiveis = useMemo(() => {
    const s = new Set<string>();
    anomalias.forEach((a) => s.add(a.equipamentoAfetado ?? "Enchedora 3"));
    return Array.from(s).sort();
  }, [anomalias]);

  // Dados filtrados
  const checklistsFiltrados = useMemo(
    () => filtrarChecklists(checklists, aplicado),
    [checklists, aplicado],
  );
  const anomaliasFiltradas = useMemo(
    () => filtrarAnomalias(anomalias, aplicado),
    [anomalias, aplicado],
  );

  const resumo = useMemo(
    () => calcularResumoExecutivo(checklistsFiltrados, anomaliasFiltradas),
    [checklistsFiltrados, anomaliasFiltradas],
  );
  const disciplina = useMemo(
    () => calcularDisciplinaFM09(checklistsFiltrados, anomaliasFiltradas, edicoesPeriodo),
    [checklistsFiltrados, anomaliasFiltradas, edicoesPeriodo],
  );
  const tratativa = useMemo(
    () => calcularAnomaliasTratativa(anomaliasFiltradas),
    [anomaliasFiltradas],
  );
  const faixas = useMemo(
    () => calcularFaixasHorarias(checklistsFiltrados, anomaliasFiltradas),
    [checklistsFiltrados, anomaliasFiltradas],
  );
  const recorrencia = useMemo(
    () => calcularRecorrencia(checklistsFiltrados, anomaliasFiltradas),
    [checklistsFiltrados, anomaliasFiltradas],
  );
  const comparativos = useMemo(
    () => calcularComparativos(checklistsFiltrados, anomaliasFiltradas),
    [checklistsFiltrados, anomaliasFiltradas],
  );
  const acoes = useMemo(
    () =>
      calcularAcoesImediatas(anomaliasFiltradas, recorrencia, faixas, comparativos),
    [anomaliasFiltradas, recorrencia, faixas, comparativos],
  );

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
  const diagPtp = useMemo(() => calcularDiagnosticoPtp(ptpDoRecorte), [ptpDoRecorte]);
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
  const filtrosIncompativeisAtivos =
    (aplicado.statusAnomalia && aplicado.statusAnomalia !== "Todos") ||
    (aplicado.criticidade && aplicado.criticidade !== "Todas") ||
    (aplicado.categoria && aplicado.categoria !== "Todas") ||
    (aplicado.momento && aplicado.momento !== "Todos") ||
    (aplicado.equipamentoAfetado && aplicado.equipamentoAfetado !== "Todos");

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

  const semDados =
    checklistsFiltrados.length === 0 && anomaliasFiltradas.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Relatório Gerencial Operacional"
        subtitulo="Linha 3 — Checklist FM09, não conformidades, anomalias e tratativa"
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
            <FiltroSelect
              label="Status da anomalia"
              value={String(rascunho.statusAnomalia ?? "Todos")}
              onChange={(v) =>
                setRascunho({
                  ...rascunho,
                  statusAnomalia: v as FiltrosRelatorio["statusAnomalia"],
                })
              }
              opcoes={["Todos", "Aberta", "Em andamento", "Resolvida"]}
            />
            <FiltroSelect
              label="Criticidade"
              value={String(rascunho.criticidade ?? "Todas")}
              onChange={(v) =>
                setRascunho({
                  ...rascunho,
                  criticidade: v as FiltrosRelatorio["criticidade"],
                })
              }
              opcoes={["Todas", "Crítica", "Alta", "Média", "Baixa"]}
            />
            <FiltroSelect
              label="Categoria"
              value={String(rascunho.categoria ?? "Todas")}
              onChange={(v) => setRascunho({ ...rascunho, categoria: v })}
              opcoes={["Todas", ...categoriasDisponiveis]}
            />
            <FiltroSelect
              label="Equipamento afetado"
              value={String(rascunho.equipamentoAfetado ?? "Todos")}
              onChange={(v) => setRascunho({ ...rascunho, equipamentoAfetado: v })}
              opcoes={["Todos", ...equipamentosDisponiveis]}
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
            {/* BLOCO 1 */}
            <Bloco titulo="1 · Resumo Executivo">
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
                <Kpi titulo="Anomalias" valor={resumo.totalAnomalias} />
                <Kpi
                  titulo="Abertas"
                  valor={resumo.abertas}
                  destaque="destructive"
                />
                <Kpi
                  titulo="Em andamento"
                  valor={resumo.emAndamento}
                  destaque="warning"
                />
                <Kpi
                  titulo="Resolvidas"
                  valor={resumo.resolvidas}
                  sub={`${resumo.pctResolvidasMesmoDia}% no mesmo dia`}
                  destaque="success"
                />
                <Kpi
                  titulo="Tempo médio até iniciar"
                  valor={reportFmt.fmtHoras(resumo.tempoMedioInicioHoras)}
                />
                <Kpi
                  titulo="Tempo médio de resolução"
                  valor={reportFmt.fmtHoras(resumo.tempoMedioResolucaoHoras)}
                />
              </div>
            </Bloco>

            {/* BLOCO 2 */}
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
                <GraficoBarrasItens dados={disciplina.topItensNC} cor="var(--color-destructive)" />
              </div>

              {disciplina.topItensObservados.length > 0 && (
                <TabelaSimples
                  titulo="Top 5 itens com observações"
                  colunas={["Item", "Descrição", "Observações"]}
                  linhas={disciplina.topItensObservados.map((r) => [
                    `Item ${r.numero}`,
                    r.descricao,
                    r.total,
                  ])}
                />
              )}
            </Bloco>

            {/* BLOCO 3 */}
            <Bloco titulo="3 · Anomalias e Tratativa">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {tratativa.porStatus.map((s) => (
                  <Kpi
                    key={s.chave}
                    titulo={s.chave}
                    valor={s.total}
                    destaque={
                      s.chave === "Aberta"
                        ? "destructive"
                        : s.chave === "Em andamento"
                          ? "warning"
                          : "success"
                    }
                  />
                ))}
                <Kpi
                  titulo="Tempo médio até iniciar"
                  valor={reportFmt.fmtHoras(tratativa.tempoMedioInicioHoras)}
                />
                <Kpi
                  titulo="Tempo médio de resolução"
                  valor={reportFmt.fmtHoras(tratativa.tempoMedioResolucaoHoras)}
                />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-foreground">
                    Anomalias por categoria
                  </h4>
                  <GraficoBarras
                    dados={tratativa.porCategoria}
                    cor="var(--color-chart-1)"
                  />
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-foreground">
                    Por equipamento afetado
                  </h4>
                  <GraficoBarras
                    dados={tratativa.porEquipamento}
                    cor="var(--color-chart-2)"
                  />
                </div>
              </div>

              {tratativa.abertasMais24h.length > 0 && (
                <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <h4 className="text-sm font-semibold text-destructive">
                      Abertas há mais de 24h ({tratativa.abertasMais24h.length})
                    </h4>
                  </div>
                  <ul className="space-y-1 text-sm text-foreground">
                    {tratativa.abertasMais24h.slice(0, 8).map((a) => (
                      <li key={a.id} className="flex items-start gap-2">
                        <span className="text-muted-foreground">
                          {new Date(a.criadoEm).toLocaleString("pt-BR", {
                            timeZone: "America/Manaus",
                          })}
                        </span>
                        <span>—</span>
                        <span className="flex-1">{a.descricao}</span>
                        <span className="text-xs text-muted-foreground">
                          {a.criticidade}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {tratativa.topItensGeradores.length > 0 && (
                <TabelaSimples
                  titulo="Top 5 itens que mais geraram anomalia"
                  colunas={["Item", "Descrição", "Anomalias"]}
                  linhas={tratativa.topItensGeradores.map((r) => [
                    `Item ${r.numero}`,
                    r.descricao,
                    r.total,
                  ])}
                />
              )}
            </Bloco>

            {/* BLOCO 4 */}
            <Bloco titulo="4 · Faixas Horárias Críticas">
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
                    <Bar
                      dataKey="anomalias"
                      name="Anomalias"
                      fill="var(--color-warning)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Bloco>

            {/* BLOCO 5 */}
            <Bloco titulo="5 · Causas, Equipamentos e Recorrência">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TabelaSimples
                  titulo="Top categorias"
                  colunas={["Categoria", "Total"]}
                  linhas={recorrencia.topCategorias.map((r) => [r.chave, r.total])}
                />
                <TabelaSimples
                  titulo="Top equipamentos afetados"
                  colunas={["Equipamento", "Total"]}
                  linhas={recorrencia.topEquipamentos.map((r) => [r.chave, r.total])}
                />
                <TabelaSimples
                  titulo="Descrições recorrentes"
                  colunas={["Descrição", "Ocorrências"]}
                  linhas={recorrencia.topDescricoes.map((r) => [r.descricao, r.total])}
                />
                <TabelaSimples
                  titulo="Itens FM09 mais reincidentes"
                  colunas={["Item", "Descrição", "Total"]}
                  linhas={recorrencia.topItensReincidentes.map((r) => [
                    `Item ${r.numero}`,
                    r.descricao,
                    r.total,
                  ])}
                />
              </div>
              {recorrencia.itemCategoria.length > 0 && (
                <TabelaSimples
                  titulo="Item × Categoria — top 5"
                  colunas={["Item", "Categoria", "Ocorrências"]}
                  linhas={recorrencia.itemCategoria.map((r) => [
                    r.item,
                    r.categoria,
                    r.total,
                  ])}
                />
              )}
            </Bloco>

            {/* BLOCO 6 */}
            <Bloco titulo="6 · Comparativo por Equipe e Turno">
              <TabelaComparativa titulo="Por equipe" linhas={comparativos.porEquipe} />
              <TabelaComparativa titulo="Por turno" linhas={comparativos.porTurno} />
            </Bloco>

            {/* BLOCO 7 */}
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
                  {filtrosIncompativeisAtivos && (
                    <p className="mb-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      Indicadores do verso seguem data/turno/equipe da frente e não
                      variam por filtros específicos de anomalias.
                    </p>
                  )}

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
                        titulo="Top itens (marcações × ocorrências)"
                        colunas={["Item", "Marcações", "Ocorrências"]}
                        linhas={diagPtp.topItens.map((r) => [
                          r.nome,
                          r.marcacoes,
                          r.ocorrencias,
                        ])}
                      />
                    </div>
                    <div className="mt-4">
                      <h4 className="mb-2 text-sm font-semibold text-foreground">
                        Marcações por janela (J01..J12)
                      </h4>
                      <GraficoBarras
                        dados={diagPtp.porJanela}
                        cor="var(--color-chart-1)"
                      />
                    </div>
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
                        <h4 className="mb-2 text-sm font-semibold text-foreground">
                          Itens não realizados por dia
                        </h4>
                        <GraficoBarras
                          dados={diagLimp.serieDiariaNaoRealizados.map((r) => ({
                            chave: r.data,
                            total: r.total,
                          }))}
                          cor="var(--color-warning)"
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

function GraficoBarras({
  dados,
  cor,
}: {
  dados: { chave: string; total: number }[];
  cor: string;
}) {
  if (dados.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem dados.</p>;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} />
          <YAxis
            type="category"
            dataKey="chave"
            stroke="var(--color-muted-foreground)"
            fontSize={11}
            width={120}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
            }}
          />
          <Bar dataKey="total" fill={cor} radius={[0, 4, 4, 0]} />
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

function TabelaComparativa({
  titulo,
  linhas,
}: {
  titulo: string;
  linhas: {
    chave: string;
    folhasRegistradas: number;
    taxaCompletude: number;
    ncPorFolha: number;
    anomaliasPorFolha: number;
    tempoMedioResolucaoHoras: number;
    pctResolvidasMesmoDia: number;
  }[];
}) {
  return (
    <TabelaSimples
      titulo={titulo}
      colunas={[
        "Chave",
        "Folhas",
        "Completude",
        "NC/folha",
        "Anom./folha",
        "T. médio resol.",
        "% mesmo dia",
      ]}
      linhas={linhas.map((r) => [
        r.chave,
        r.folhasRegistradas,
        `${r.taxaCompletude}%`,
        r.ncPorFolha,
        r.anomaliasPorFolha,
        reportFmt.fmtHoras(r.tempoMedioResolucaoHoras),
        `${r.pctResolvidasMesmoDia}%`,
      ])}
    />
  );
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
