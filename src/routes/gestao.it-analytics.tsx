import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useItAnalyticsRealtime } from "@/hooks/use-it-analytics-realtime";
import {
  AlertCircle,
  BookOpen,
  Calendar,
  ChevronDown,
  ClipboardCheck,
  Info,
  Loader2,
  Search,
  UserCheck,
  UserX,
  Users,
  ZoomIn,
} from "lucide-react";
import { escalaExataPorTurnoEquipe } from "@/lib/operacao/escalas";
import type { Equipe, Turno } from "@/lib/checklist/types";
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
  user_id: string | null;
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
  user_id: string | null;
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

interface OperadorAtivoRow {
  id: string;
  nome: string;
  equipe_padrao: string | null;
  turno_padrao: string | null;
}

interface AtaRow {
  operador_user_id: string | null;
  operador_nome_canonico: string;
  documento: "it002" | "it005";
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
  const [operadoresAtivos, setOperadoresAtivos] = useState<OperadorAtivoRow[]>([]);
  const [atas, setAtas] = useState<AtaRow[]>([]);
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
            "id,documento,duracao_total_ms,duracao_efetiva_ms,iniciado_em,ultimo_evento_em,ativa_agora,equipe,turno,operador_nome,operador_nome_canonico,user_id",
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
            "id,sessao_id,documento,tipo_evento,pagina,pagina_destino,tipo_entrada,label,termo_busca,duracao_ms,equipe,turno,operador_nome,operador_nome_canonico,user_id,device_id,metadata_json,created_at",
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

        // Operadores ativos (perfil = "operador", active = true)
        const qOps = supabase
          .from("profiles")
          .select("id,nome,equipe_padrao,turno_padrao")
          .eq("perfil", "operador")
          .eq("active", true);

        // Atas de treinamento — usadas para cobertura ata x uso da IT
        const qAtas = (supabase.from as any)("it_atas_treinamento")
          .select("operador_user_id,operador_nome_canonico,documento")
          .limit(5000);

        const [sesRes, evRes, difRes, opsRes, atasRes] = await Promise.allSettled([
          qSes,
          qEv,
          qDif,
          qOps,
          qAtas,
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

        if (opsRes.status === "fulfilled" && !opsRes.value.error) {
          setOperadoresAtivos((opsRes.value.data as OperadorAtivoRow[]) ?? []);
        } else {
          setOperadoresAtivos([]);
        }

        if (atasRes.status === "fulfilled" && !atasRes.value.error) {
          setAtas((atasRes.value.data as AtaRow[]) ?? []);
        } else {
          setAtas([]);
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

  useEffect(() => {
    void carregarDados(false);
    return () => {
      if (fetchAbortRef.current) fetchAbortRef.current.cancelled = true;
    };
  }, [carregarDados]);

  useItAnalyticsRealtime(!!usuario, () => {
    void carregarDados(true);
  });

  const sessoesFiltradas = sessoes;
  const eventosFiltrados = eventos;

  // ────────── Agregações ──────────

  const kpis = useMemo(() => {
    const sessoesCount = sessoesFiltradas.length;
    const consultas = eventosFiltrados.filter((e) => e.tipo_evento === "page_view").length;
    const buscas = eventosFiltrados.filter((e) => e.tipo_evento === "index_search").length;
    const zooms = eventosFiltrados.filter((e) =>
      ["zoom_in", "zoom_out", "zoom_reset"].includes(e.tipo_evento),
    ).length;
    const retries = eventosFiltrados.filter((e) => e.tipo_evento === "image_retry").length;
    const emConsultaAgora = sessoesFiltradas.filter((s) => s.ativa_agora === true).length;
    // Operadores únicos no período: prioridade para user_id, fallback nome canônico.
    const setOps = new Set<string>();
    for (const s of sessoesFiltradas) {
      const k = s.user_id ?? (s.operador_nome_canonico ? `c:${s.operador_nome_canonico}` : null);
      if (k) setOps.add(k);
    }
    return {
      sessoesCount,
      consultas,
      buscas,
      zooms,
      retries,
      emConsultaAgora,
      operadoresUnicos: setOps.size,
    };
  }, [sessoesFiltradas, eventosFiltrados]);

  const aberturasPorDoc = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessoesFiltradas) {
      map.set(s.documento, (map.get(s.documento) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([documento, count]) => ({ documento, count }))
      .sort((a, b) => b.count - a.count);
  }, [sessoesFiltradas]);

  const paginasMaisVistas = useMemo(() => {
    const map = new Map<string, { documento: string; pagina: number; count: number }>();
    for (const e of eventosFiltrados) {
      if (e.tipo_evento !== "page_view" || e.pagina == null) continue;
      const k = `${e.documento}#${e.pagina}`;
      const cur = map.get(k);
      if (cur) cur.count++;
      else map.set(k, { documento: e.documento, pagina: e.pagina, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [eventosFiltrados]);

  const passosMaisClicados = useMemo(() => {
    const map = new Map<
      string,
      { documento: string; label: string; pagina: number; count: number }
    >();
    for (const e of eventosFiltrados) {
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
  }, [eventosFiltrados]);

  const termosMaisBuscados = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of eventosFiltrados) {
      if (e.tipo_evento !== "index_search" || !e.termo_busca) continue;
      map.set(e.termo_busca, (map.get(e.termo_busca) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([termo, count]) => ({ termo, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [eventosFiltrados]);

  const segPorEquipe = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessoesFiltradas) {
      const k = s.equipe ?? "—";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([equipe, count]) => ({ equipe, count }))
      .sort((a, b) => b.count - a.count);
  }, [sessoesFiltradas]);

  const segPorTurno = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessoesFiltradas) {
      const k = s.turno ?? "—";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([turno, count]) => ({ turno, count }))
      .sort((a, b) => b.count - a.count);
  }, [sessoesFiltradas]);

  // Visão por operador — agora usa user_id como chave principal.
  // Fallback: sessões antigas sem user_id agrupam por nome canônico.
  const segPorOperador = useMemo(() => {
    interface Acc {
      key: string;
      userId: string | null;
      nome: string;
      count: number;
    }
    const map = new Map<string, Acc>();
    for (const s of sessoesFiltradas) {
      const userId = s.user_id;
      const nome = s.operador_nome ?? s.operador_nome_canonico ?? "—";
      const key = userId ? `u:${userId}` : `c:${s.operador_nome_canonico ?? nome}`;
      const cur = map.get(key);
      if (cur) cur.count++;
      else map.set(key, { key, userId, nome, count: 1 });
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);
  }, [sessoesFiltradas]);

  // Operadores que NÃO consultaram a IT no período.
  // Cruzamento estritamente contra perfil = "operador" e active = true.
  const operadoresSemConsulta = useMemo(() => {
    const idsQueConsultaram = new Set<string>();
    for (const s of sessoesFiltradas) {
      if (s.user_id) idsQueConsultaram.add(s.user_id);
    }
    return operadoresAtivos
      .filter((op) => !idsQueConsultaram.has(op.id))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [sessoesFiltradas, operadoresAtivos]);

  // Cobertura: consultaram com ata vs. consultaram sem ata.
  // Ata existe se: it_atas_treinamento.operador_user_id = user_id (preferido)
  // OU operador_nome_canonico bate (fallback p/ atas antigas sem user_id).
  // Cruzamento por documento (ata é por IT).
  const coberturaAta = useMemo(() => {
    const atasPorUser = new Map<string, Set<"it002" | "it005">>();
    const atasPorCanonico = new Map<string, Set<"it002" | "it005">>();
    for (const a of atas) {
      if (a.operador_user_id) {
        const cur = atasPorUser.get(a.operador_user_id) ?? new Set();
        cur.add(a.documento);
        atasPorUser.set(a.operador_user_id, cur);
      }
      if (a.operador_nome_canonico) {
        const cur = atasPorCanonico.get(a.operador_nome_canonico) ?? new Set();
        cur.add(a.documento);
        atasPorCanonico.set(a.operador_nome_canonico, cur);
      }
    }

    interface OpResumo {
      key: string;
      nome: string;
      documentosConsultados: Set<"it002" | "it005">;
      temAtaNoDoc: Map<"it002" | "it005", boolean>;
    }
    const map = new Map<string, OpResumo>();
    for (const s of sessoesFiltradas) {
      const userId = s.user_id;
      const canonico = s.operador_nome_canonico ?? null;
      const nome = s.operador_nome ?? canonico ?? "—";
      const key = userId ? `u:${userId}` : `c:${canonico ?? nome}`;
      let cur = map.get(key);
      if (!cur) {
        cur = {
          key,
          nome,
          documentosConsultados: new Set(),
          temAtaNoDoc: new Map(),
        };
        map.set(key, cur);
      }
      cur.documentosConsultados.add(s.documento);
      const docsComAta =
        (userId && atasPorUser.get(userId)) ||
        (canonico && atasPorCanonico.get(canonico)) ||
        new Set<"it002" | "it005">();
      cur.temAtaNoDoc.set(s.documento, docsComAta.has(s.documento));
    }

    let comAta = 0;
    let semAta = 0;
    const detalheSemAta: { nome: string; docs: ("it002" | "it005")[] }[] = [];
    for (const op of map.values()) {
      const docsSemAta: ("it002" | "it005")[] = [];
      for (const doc of op.documentosConsultados) {
        if (op.temAtaNoDoc.get(doc)) {
          comAta++;
        } else {
          semAta++;
          docsSemAta.push(doc);
        }
      }
      if (docsSemAta.length > 0) {
        detalheSemAta.push({ nome: op.nome, docs: docsSemAta });
      }
    }
    detalheSemAta.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return { comAta, semAta, detalheSemAta, totalOperadores: map.size };
  }, [sessoesFiltradas, atas]);

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
              <p className="mt-2 text-xs text-muted-foreground">
                Dados anteriores ao login individual podem estar incompletos.
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

        {/* Atalho para Operadores com treinamento (Atas) */}
        <Link
          to="/gestao/it-treinamentos"
          className="group mb-6 flex items-center gap-4 rounded-2xl border-2 border-primary/30 bg-card p-4 shadow-sm transition-all hover:border-primary hover:shadow-md md:p-5"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ClipboardCheck className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className="text-base font-bold text-foreground md:text-lg">
              Operadores com treinamento
            </p>
            <p className="text-sm text-muted-foreground">
              Atas de treinamento na função (IT 002 e IT 005) com nome, turno e
              assinatura do instrutor — exporta para o formulário oficial FM 01
              PSGQ 05.
            </p>
          </div>
          <span className="hidden text-sm font-semibold text-primary md:inline">
            Abrir →
          </span>
        </Link>

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
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              <KpiCard
                titulo="Em consulta agora"
                valor={kpis.emConsultaAgora}
                destaque={kpis.emConsultaAgora > 0 ? "success" : undefined}
              />
              <KpiCard titulo="Operadores únicos" valor={kpis.operadoresUnicos} />
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

            {/* Cobertura: consultaram x sem consulta + ata x uso */}
            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <UserX className="h-4 w-4" />
                    Operadores sem consulta no período
                  </CardTitle>
                  <CardDescription>
                    Operadores ativos que não abriram nenhuma IT no recorte
                    selecionado. Útil para incentivar consulta antes do trabalho.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {operadoresAtivos.length === 0 ? (
                    <p className="py-2 text-xs text-muted-foreground">
                      Nenhum operador ativo cadastrado.
                    </p>
                  ) : operadoresSemConsulta.length === 0 ? (
                    <p className="py-2 text-sm text-success">
                      ✓ Todos os {operadoresAtivos.length} operadores ativos
                      consultaram a IT no período.
                    </p>
                  ) : (
                    <>
                      <p className="mb-2 text-xs text-muted-foreground">
                        {operadoresSemConsulta.length} de {operadoresAtivos.length}{" "}
                        operador(es) ativo(s) sem consulta.
                      </p>
                      <ul className="max-h-72 space-y-1 overflow-y-auto">
                        {operadoresSemConsulta.map((op) => (
                          <li
                            key={op.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                          >
                            <span className="truncate">{op.nome}</span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {[op.equipe_padrao, op.turno_padrao]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <UserCheck className="h-4 w-4" />
                    Cobertura de Ata × Uso da IT
                  </CardTitle>
                  <CardDescription>
                    A ata é controle de treinamento (não trava acesso). Aqui você
                    vê quem consultou e ainda não tem ata cadastrada.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-success/30 bg-success/10 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Consultaram com ata
                      </p>
                      <p className="mt-0.5 text-2xl font-bold text-success">
                        {coberturaAta.comAta}
                      </p>
                    </div>
                    <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Consultaram sem ata
                      </p>
                      <p className="mt-0.5 text-2xl font-bold text-warning-foreground">
                        {coberturaAta.semAta}
                      </p>
                    </div>
                  </div>
                  {coberturaAta.detalheSemAta.length === 0 ? (
                    <p className="py-2 text-xs text-muted-foreground">
                      Nenhum operador consultou IT sem ata correspondente no
                      período.
                    </p>
                  ) : (
                    <ul className="max-h-56 space-y-1 overflow-y-auto">
                      {coberturaAta.detalheSemAta.map((op) => (
                        <li
                          key={op.nome}
                          className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                        >
                          <span className="truncate">{op.nome}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            sem ata em: {op.docs.map((d) => DOC_LABEL[d]).join(", ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
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

            {/* Visão por operador (oculto por default) */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Visão por operador</CardTitle>
                  <CardDescription>
                    Apoio à coordenação. Ranking de quem mais consultou as IT no
                    período.
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
                          key={o.key}
                          className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                        >
                          <span className="flex items-center gap-2 font-medium">
                            {o.nome}
                            {!o.userId && (
                              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                histórico
                              </span>
                            )}
                          </span>
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
  destaque?: "warning" | "destructive" | "success";
}) {
  const cls =
    destaque === "destructive"
      ? "text-destructive"
      : destaque === "warning"
        ? "text-warning-foreground"
        : destaque === "success"
          ? "text-success"
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
