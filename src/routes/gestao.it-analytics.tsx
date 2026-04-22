import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useItAnalyticsRealtime } from "@/hooks/use-it-analytics-realtime";
import {
  AlertCircle,
  BookOpen,
  Calendar,
  ChevronDown,
  Info,
  Loader2,
  Search,
  Users,
  ZoomIn,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Periodo = "hoje" | "7d" | "30d" | "90d";

interface FiltrosState {
  periodo: Periodo;
  documento: "todos" | "it002" | "it005";
  equipe: string;
  turno: string;
  porOperador: boolean;
}

interface EventoRow {
  id: number;
  sessao_id: string;
  documento: "it002" | "it005";
  tipo_evento: string;
  pagina: number | null;
  pagina_destino: number | null;
  tipo_entrada: string | null;
  label: string | null;
  termo_busca: string | null;
  duracao_ms: number | null;
  equipe: string | null;
  turno: string | null;
  operador_nome: string | null;
  operador_nome_canonico: string | null;
  device_id: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

interface SessaoRow {
  id: string;
  documento: "it002" | "it005";
  duracao_total_ms: number | null;
  duracao_efetiva_ms: number | null;
  iniciado_em: string;
  ultimo_evento_em: string | null;
  ativa_agora: boolean | null;
  equipe: string | null;
  turno: string | null;
  operador_nome: string | null;
  operador_nome_canonico: string | null;
  device_id: string | null;
}

interface DificuldadeRow {
  documento: "it002" | "it005";
  pagina: number;
  views: number;
  tempo_medio_ms: number;
  zooms: number;
  retornos: number;
  retries: number;
  buscas_que_levaram: number;
  score: number;
}

interface AlertaRow {
  tipo: "multi_device" | "trocas_rapidas";
  chave: string;
  detalhes: Record<string, unknown>;
}

const DOC_LABEL: Record<"it002" | "it005", string> = {
  it002: "IT Operação",
  it005: "IT Limpeza",
};

function periodoParaDataInicio(periodo: Periodo): string {
  const dias = periodo === "hoje" ? 1 : periodo === "7d" ? 7 : periodo === "30d" ? 30 : 90;
  const d = new Date();
  if (periodo === "hoje") {
    d.setHours(0, 0, 0, 0);
  } else {
    d.setDate(d.getDate() - dias);
  }
  return d.toISOString();
}

export const Route = createFileRoute("/gestao/it-analytics")({
  head: () => ({
    meta: [
      { title: "Inteligência de uso das ITs — Gestão" },
      {
        name: "description",
        content:
          "Análise de uso das Instruções de Trabalho da Linha 3 para identificar pontos de reforço de treinamento.",
      },
    ],
  }),
  component: ItAnalytics,
});

function ItAnalytics() {
  const { usuario, loading } = useGuard("gestao");
  const [filtros, setFiltros] = useState<FiltrosState>({
    periodo: "7d",
    documento: "todos",
    equipe: "todas",
    turno: "todos",
    porOperador: false,
  });

  const [sessoes, setSessoes] = useState<SessaoRow[]>([]);
  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [dificuldade, setDificuldade] = useState<DificuldadeRow[]>([]);
  const [alertas, setAlertas] = useState<AlertaRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [erroDificuldade, setErroDificuldade] = useState<string | null>(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const fetchAbortRef = useRef<{ cancelled: boolean } | null>(null);

  const carregarDados = useCallback(
    async (silent = false) => {
      if (!usuario) return;
      if (fetchAbortRef.current) fetchAbortRef.current.cancelled = true;
      const guard = { cancelled: false };
      fetchAbortRef.current = guard;

      if (!silent) setCarregando(true);
      setErro(null);
      setErroDificuldade(null);

      try {
        const dataInicio = periodoParaDataInicio(filtros.periodo);

        // Sessões — VIEW efetiva (duracao_efetiva_ms + ativa_agora)
        let qSes = (supabase.from as any)("it_consulta_sessoes_efetivas")
          .select(
            "id,documento,duracao_total_ms,duracao_efetiva_ms,iniciado_em,ultimo_evento_em,ativa_agora,equipe,turno,operador_nome,operador_nome_canonico,device_id",
          )
          .gte("iniciado_em", dataInicio)
          .order("iniciado_em", { ascending: false })
          .limit(5000);
        if (filtros.documento !== "todos")
          qSes = qSes.eq("documento", filtros.documento);
        if (filtros.equipe !== "todas") qSes = qSes.eq("equipe", filtros.equipe);
        if (filtros.turno !== "todos") qSes = qSes.eq("turno", filtros.turno);

        // Eventos
        let qEv = (supabase.from as any)("it_consulta_eventos")
          .select(
            "id,sessao_id,documento,tipo_evento,pagina,pagina_destino,tipo_entrada,label,termo_busca,duracao_ms,equipe,turno,operador_nome,operador_nome_canonico,device_id,metadata_json,created_at",
          )
          .gte("created_at", dataInicio)
          .order("created_at", { ascending: false })
          .limit(20000);
        if (filtros.documento !== "todos")
          qEv = qEv.eq("documento", filtros.documento);
        if (filtros.equipe !== "todas") qEv = qEv.eq("equipe", filtros.equipe);
        if (filtros.turno !== "todos") qEv = qEv.eq("turno", filtros.turno);

        // Dificuldade (view)
        let qDif = (supabase.from as any)("it_dificuldade_paginas")
          .select("*")
          .order("score", { ascending: false })
          .limit(50);
        if (filtros.documento !== "todos")
          qDif = qDif.eq("documento", filtros.documento);

        // Alertas de identidade (view)
        const qAlertas = (supabase.from as any)("it_alertas_identidade")
          .select("*")
          .limit(100);

        const [sesRes, evRes, difRes, alertRes] = await Promise.allSettled([
          qSes,
          qEv,
          qDif,
          qAlertas,
        ]);

        if (guard.cancelled) return;

        if (sesRes.status === "rejected") {
          throw sesRes.reason instanceof Error
            ? sesRes.reason
            : new Error(String(sesRes.reason));
        }
        if (sesRes.value.error) throw sesRes.value.error;

        if (evRes.status === "rejected") {
          throw evRes.reason instanceof Error
            ? evRes.reason
            : new Error(String(evRes.reason));
        }
        if (evRes.value.error) throw evRes.value.error;

        setSessoes((sesRes.value.data as SessaoRow[]) ?? []);
        setEventos((evRes.value.data as EventoRow[]) ?? []);

        if (difRes.status === "rejected") {
          setDificuldade([]);
          setErroDificuldade(
            difRes.reason instanceof Error
              ? difRes.reason.message
              : String(difRes.reason),
          );
        } else if (difRes.value.error) {
          setDificuldade([]);
          setErroDificuldade(difRes.value.error.message);
        } else {
          setDificuldade((difRes.value.data as DificuldadeRow[]) ?? []);
        }

        if (alertRes.status === "fulfilled" && !alertRes.value.error) {
          setAlertas((alertRes.value.data as AlertaRow[]) ?? []);
        } else {
          setAlertas([]);
        }

        setUltimaAtualizacao(new Date());
      } catch (e) {
        if (guard.cancelled) return;
        setErro(e instanceof Error ? e.message : "Erro ao carregar analytics.");
      } finally {
        if (!guard.cancelled && !silent) setCarregando(false);
      }
    },
    [usuario, filtros.periodo, filtros.documento, filtros.equipe, filtros.turno],
  );

  // Carregamento inicial / quando filtros mudam
  useEffect(() => {
    void carregarDados(false);
    return () => {
      if (fetchAbortRef.current) fetchAbortRef.current.cancelled = true;
    };
  }, [carregarDados]);

  // Realtime: refetch silencioso quando chegar evento/sessão nova (debounced)
  useItAnalyticsRealtime(!!usuario, () => {
    void carregarDados(true);
  });

  // Agregações memoizadas
  const kpis = useMemo(() => {
    const sessoesCount = sessoes.length;
    const consultas = eventos.filter((e) => e.tipo_evento === "page_view").length;
    const buscas = eventos.filter((e) => e.tipo_evento === "index_search").length;
    const zooms = eventos.filter((e) =>
      ["zoom_in", "zoom_out", "zoom_reset"].includes(e.tipo_evento),
    ).length;
    const retries = eventos.filter((e) => e.tipo_evento === "image_retry").length;
    const emConsultaAgora = sessoes.filter((s) => s.ativa_agora === true).length;
    return { sessoesCount, consultas, buscas, zooms, retries, emConsultaAgora };
  }, [sessoes, eventos]);

  const aberturasPorDoc = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessoes) {
      map.set(s.documento, (map.get(s.documento) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([documento, count]) => ({ documento, count }))
      .sort((a, b) => b.count - a.count);
  }, [sessoes]);

  const paginasMaisVistas = useMemo(() => {
    const map = new Map<string, { documento: string; pagina: number; count: number }>();
    for (const e of eventos) {
      if (e.tipo_evento !== "page_view" || e.pagina == null) continue;
      const k = `${e.documento}#${e.pagina}`;
      const cur = map.get(k);
      if (cur) cur.count++;
      else map.set(k, { documento: e.documento, pagina: e.pagina, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [eventos]);

  const passosMaisClicados = useMemo(() => {
    const map = new Map<
      string,
      { documento: string; label: string; pagina: number; count: number }
    >();
    for (const e of eventos) {
      if (
        e.tipo_evento !== "index_click" &&
        e.tipo_evento !== "index_search_result_click"
      )
        continue;
      if (!e.label) continue;
      const k = `${e.documento}#${e.label}`;
      const cur = map.get(k);
      if (cur) cur.count++;
      else
        map.set(k, {
          documento: e.documento,
          label: e.label,
          pagina: e.pagina_destino ?? 0,
          count: 1,
        });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [eventos]);

  const termosMaisBuscados = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of eventos) {
      if (e.tipo_evento !== "index_search" || !e.termo_busca) continue;
      map.set(e.termo_busca, (map.get(e.termo_busca) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([termo, count]) => ({ termo, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [eventos]);

  const segPorEquipe = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessoes) {
      const k = s.equipe ?? "—";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([equipe, count]) => ({ equipe, count }))
      .sort((a, b) => b.count - a.count);
  }, [sessoes]);

  const segPorTurno = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessoes) {
      const k = s.turno ?? "—";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([turno, count]) => ({ turno, count }))
      .sort((a, b) => b.count - a.count);
  }, [sessoes]);

  // Agrupamento por nome canônico (LUCAS, LUCAS MOREIRA, etc.)
  // Sub-linha mostra variantes brutas digitadas. Badge se multi-device.
  const segPorOperador = useMemo(() => {
    interface Acc {
      canonico: string;
      variantes: Set<string>;
      devices: Set<string>;
      count: number;
    }
    const map = new Map<string, Acc>();
    for (const s of sessoes) {
      const can = s.operador_nome_canonico ?? s.operador_nome ?? "—";
      const cur = map.get(can);
      if (cur) {
        cur.count++;
        if (s.operador_nome) cur.variantes.add(s.operador_nome);
        if (s.device_id) cur.devices.add(s.device_id);
      } else {
        map.set(can, {
          canonico: can,
          variantes: new Set(s.operador_nome ? [s.operador_nome] : []),
          devices: new Set(s.device_id ? [s.device_id] : []),
          count: 1,
        });
      }
    }
    return Array.from(map.values())
      .map((a) => ({
        canonico: a.canonico,
        variantes: Array.from(a.variantes).filter(
          (v) => v.toUpperCase() !== a.canonico,
        ),
        qtdDevices: a.devices.size,
        count: a.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [sessoes]);

  // Trocas de operador nas últimas 24h (client + servidor)
  const trocasOperador = useMemo(() => {
    const corteMs = Date.now() - 24 * 60 * 60 * 1000;
    return eventos
      .filter(
        (e) =>
          (e.tipo_evento === "identidade_trocada" ||
            e.tipo_evento === "identidade_trocada_servidor") &&
          Date.parse(e.created_at) >= corteMs,
      )
      .slice(0, 30);
  }, [eventos]);

  const equipesUnicas = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessoes) if (s.equipe) set.add(s.equipe);
    return Array.from(set).sort();
  }, [sessoes]);

  const turnosUnicos = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessoes) if (s.turno) set.add(s.turno);
    return Array.from(set).sort();
  }, [sessoes]);

  if (loading || !usuario) return <TelaCarregando />;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Inteligência de uso das ITs"
        subtitulo="Linha 3 — Enchedora 3"
        voltarPara="/gestao"
      />
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-10">
        {/* Banner não-punitivo + indicador ao vivo */}
        <Card className="mb-6 border-primary/30 bg-primary-soft/40">
          <CardContent className="flex items-start gap-3 p-4 md:p-5">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="flex-1">
              <p className="text-sm text-foreground md:text-base">
                Esta análise serve para identificar pontos da instrução que precisam
                de reforço de treinamento, <strong>não</strong> para avaliar
                operadores individualmente. O foco está em onde a operação encontra
                dificuldade — não em quem.
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                <span>
                  Atualização ao vivo
                  {ultimaAtualizacao && (
                    <>
                      {" · última: "}
                      {ultimaAtualizacao.toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </>
                  )}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filtros */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <FiltroSelect
              icon={<Calendar className="h-4 w-4" />}
              label="Período"
              value={filtros.periodo}
              onChange={(v) => setFiltros((f) => ({ ...f, periodo: v as Periodo }))}
              options={[
                { value: "hoje", label: "Hoje" },
                { value: "7d", label: "Últimos 7 dias" },
                { value: "30d", label: "Últimos 30 dias" },
                { value: "90d", label: "Últimos 90 dias" },
              ]}
            />
            <FiltroSelect
              icon={<BookOpen className="h-4 w-4" />}
              label="Documento"
              value={filtros.documento}
              onChange={(v) =>
                setFiltros((f) => ({
                  ...f,
                  documento: v as FiltrosState["documento"],
                }))
              }
              options={[
                { value: "todos", label: "Todos" },
                { value: "it002", label: "IT Operação" },
                { value: "it005", label: "IT Limpeza" },
              ]}
            />
            <FiltroSelect
              icon={<Users className="h-4 w-4" />}
              label="Equipe"
              value={filtros.equipe}
              onChange={(v) => setFiltros((f) => ({ ...f, equipe: v }))}
              options={[
                { value: "todas", label: "Todas" },
                ...equipesUnicas.map((e) => ({ value: e, label: e })),
              ]}
            />
            <FiltroSelect
              icon={<Calendar className="h-4 w-4" />}
              label="Turno"
              value={filtros.turno}
              onChange={(v) => setFiltros((f) => ({ ...f, turno: v }))}
              options={[
                { value: "todos", label: "Todos" },
                ...turnosUnicos.map((t) => ({ value: t, label: t })),
              ]}
            />
          </CardContent>
        </Card>

        {erro && (
          <Card className="mb-6 border-destructive/40">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-semibold text-destructive">
                  Não foi possível carregar os dados.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{erro}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {carregando ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
              <KpiCard titulo="Sessões" valor={kpis.sessoesCount} />
              <KpiCard titulo="Consultas (page views)" valor={kpis.consultas} />
              <KpiCard titulo="Buscas no índice" valor={kpis.buscas} />
              <KpiCard titulo="Usos de zoom" valor={kpis.zooms} />
              <KpiCard
                titulo="Tentativas de recarregar"
                valor={kpis.retries}
                destaque={kpis.retries > 0 ? "warning" : undefined}
              />
            </div>

            {/* Rankings */}
            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    ITs mais consultadas
                  </CardTitle>
                  <CardDescription>
                    Quantidade de aberturas no período
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {aberturasPorDoc.length === 0 ? (
                    <SemDados />
                  ) : (
                    <ul className="space-y-2">
                      {aberturasPorDoc.map((d) => (
                        <li
                          key={d.documento}
                          className="flex items-center justify-between rounded-md border border-border bg-card p-3"
                        >
                          <span className="text-sm font-medium">
                            {DOC_LABEL[d.documento as "it002" | "it005"] ??
                              d.documento}
                          </span>
                          <span className="text-sm font-bold text-primary">
                            {d.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Páginas mais consultadas
                  </CardTitle>
                  <CardDescription>Top 10 — page views</CardDescription>
                </CardHeader>
                <CardContent>
                  {paginasMaisVistas.length === 0 ? (
                    <SemDados />
                  ) : (
                    <ul className="space-y-1.5">
                      {paginasMaisVistas.map((p) => (
                        <li
                          key={`${p.documento}-${p.pagina}`}
                          className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                        >
                          <span className="truncate">
                            <span className="text-muted-foreground">
                              {DOC_LABEL[p.documento as "it002" | "it005"]}
                            </span>{" "}
                            · pág. {p.pagina}
                          </span>
                          <span className="shrink-0 font-semibold text-primary">
                            {p.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Passos / anexos mais clicados
                  </CardTitle>
                  <CardDescription>Top 10 — vindo do índice</CardDescription>
                </CardHeader>
                <CardContent>
                  {passosMaisClicados.length === 0 ? (
                    <SemDados />
                  ) : (
                    <ul className="space-y-1.5">
                      {passosMaisClicados.map((p, i) => (
                        <li
                          key={`${p.documento}-${p.label}-${i}`}
                          className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                        >
                          <span className="truncate">
                            <span className="text-muted-foreground">
                              {DOC_LABEL[p.documento as "it002" | "it005"]}
                            </span>{" "}
                            · {p.label}
                          </span>
                          <span className="shrink-0 font-semibold text-primary">
                            {p.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Search className="h-4 w-4" />
                    Termos mais buscados
                  </CardTitle>
                  <CardDescription>
                    Termos do índice (sanitizados, com debounce)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {termosMaisBuscados.length === 0 ? (
                    <SemDados />
                  ) : (
                    <ul className="space-y-1.5">
                      {termosMaisBuscados.map((t) => (
                        <li
                          key={t.termo}
                          className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                        >
                          <span className="truncate font-mono text-xs">
                            “{t.termo}”
                          </span>
                          <span className="shrink-0 font-semibold text-primary">
                            {t.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Score de dificuldade */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ZoomIn className="h-4 w-4" />
                  Páginas com maior score de dificuldade
                </CardTitle>
                <CardDescription>
                  Indicador presumido (0–100) — combina tempo médio, zoom,
                  retornos, buscas e retries.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="mb-3 h-8 gap-1.5">
                      <ChevronDown className="h-4 w-4" />
                      Como o score é calculado?
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                      <p className="mb-2 font-medium text-foreground">
                        Fórmula (cada componente normalizado 0–1 dentro do próprio
                        documento):
                      </p>
                      <pre className="whitespace-pre-wrap font-mono leading-relaxed">
{`score = round(100 × (
  0.30 × tempo_medio_normalizado
+ 0.25 × zooms_por_view_normalizado
+ 0.20 × retornos_por_view_normalizado
+ 0.15 × buscas_que_levaram_normalizado
+ 0.10 × retries_por_view_normalizado
))`}
                      </pre>
                      <p className="mt-2">
                        Score alto sugere uma página onde a operação tem
                        dificuldade — bom candidato para reforço de treinamento
                        ou revisão da própria instrução.
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {erroDificuldade ? (
                  <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
                    <div className="text-xs">
                      <p className="font-semibold text-foreground">
                        Score de dificuldade indisponível.
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        A view <code className="font-mono">it_dificuldade_paginas</code> ainda
                        não está disponível no banco. O restante do painel
                        continua funcionando normalmente.
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                        {erroDificuldade}
                      </p>
                    </div>
                  </div>
                ) : dificuldade.length === 0 ? (
                  <SemDados />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="pb-2 pr-2">IT</th>
                          <th className="pb-2 pr-2">Pág.</th>
                          <th className="pb-2 pr-2 text-right">Score</th>
                          <th className="pb-2 pr-2 text-right">Views</th>
                          <th className="pb-2 pr-2 text-right">Tempo médio</th>
                          <th className="pb-2 pr-2 text-right">Zooms</th>
                          <th className="pb-2 pr-2 text-right">Retornos</th>
                          <th className="pb-2 pr-2 text-right">Retries</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dificuldade.slice(0, 15).map((d) => (
                          <tr
                            key={`${d.documento}-${d.pagina}`}
                            className="border-b border-border/60"
                          >
                            <td className="py-2 pr-2 text-muted-foreground">
                              {DOC_LABEL[d.documento]}
                            </td>
                            <td className="py-2 pr-2 font-medium">{d.pagina}</td>
                            <td className="py-2 pr-2 text-right">
                              <span
                                className={cn(
                                  "inline-block min-w-[42px] rounded-md px-2 py-0.5 text-xs font-bold",
                                  d.score >= 70
                                    ? "bg-destructive/15 text-destructive"
                                    : d.score >= 40
                                      ? "bg-warning/20 text-warning-foreground"
                                      : "bg-muted text-muted-foreground",
                                )}
                              >
                                {d.score}
                              </span>
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums">
                              {d.views}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums">
                              {Math.round((d.tempo_medio_ms ?? 0) / 1000)}s
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums">
                              {d.zooms}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums">
                              {d.retornos}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums">
                              {d.retries}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Segmentação */}
            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sessões por equipe</CardTitle>
                </CardHeader>
                <CardContent>
                  {segPorEquipe.length === 0 ? (
                    <SemDados />
                  ) : (
                    <ul className="space-y-1.5">
                      {segPorEquipe.map((s) => (
                        <li
                          key={s.equipe}
                          className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
                        >
                          <span>{s.equipe}</span>
                          <span className="font-semibold text-primary">
                            {s.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sessões por turno</CardTitle>
                </CardHeader>
                <CardContent>
                  {segPorTurno.length === 0 ? (
                    <SemDados />
                  ) : (
                    <ul className="space-y-1.5">
                      {segPorTurno.map((s) => (
                        <li
                          key={s.turno}
                          className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
                        >
                          <span>{s.turno}</span>
                          <span className="font-semibold text-primary">
                            {s.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Toggle por operador (oculto por default) */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Visão por operador</CardTitle>
                  <CardDescription>
                    Apoio à coordenação. Use com cuidado — o foco principal são as
                    páginas, não as pessoas.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="por-operador"
                    checked={filtros.porOperador}
                    onCheckedChange={(v) =>
                      setFiltros((f) => ({ ...f, porOperador: v }))
                    }
                  />
                  <Label htmlFor="por-operador" className="text-sm">
                    Mostrar
                  </Label>
                </div>
              </CardHeader>
              {filtros.porOperador && (
                <CardContent>
                  {segPorOperador.length === 0 ? (
                    <SemDados />
                  ) : (
                    <ul className="space-y-1.5">
                      {segPorOperador.map((o) => (
                        <li
                          key={o.operador}
                          className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
                        >
                          <span>{o.operador}</span>
                          <span className="font-semibold text-primary">
                            {o.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function FiltroSelect({
  icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function KpiCard({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: number;
  destaque?: "warning" | "destructive";
}) {
  const cls =
    destaque === "destructive"
      ? "text-destructive"
      : destaque === "warning"
        ? "text-warning-foreground"
        : "text-primary";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <p className={cn("mt-1 text-3xl font-bold md:text-4xl", cls)}>{valor}</p>
    </div>
  );
}

function SemDados() {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">
      Sem dados no período selecionado.
    </p>
  );
}
