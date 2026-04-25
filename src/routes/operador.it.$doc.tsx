import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  List,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  WifiOff,
} from "lucide-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { AppHeader } from "@/components/app-header";
import { TelaCarregando } from "@/components/tela-carregando";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGuard } from "@/hooks/use-guard";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { useItDocument } from "@/hooks/use-it-document";
import { useItTelemetria } from "@/hooks/use-it-telemetria";
import { criarDebouncerBusca } from "@/lib/it/telemetria";
import {
  IT_DOC_TITULO,
  type IndiceEntry,
  type ItDocSlug,
} from "@/lib/it/types";
import { cn } from "@/lib/utils";

const SLUGS_VALIDOS: ItDocSlug[] = ["operacao", "limpeza"];

export const Route = createFileRoute("/operador/it/$doc")({
  head: ({ params }) => {
    const slug = params.doc as ItDocSlug;
    const titulo = SLUGS_VALIDOS.includes(slug)
      ? IT_DOC_TITULO[slug]
      : "Instrução de Trabalho";
    return {
      meta: [
        { title: `${titulo} — Operador` },
        { name: "description", content: `Visualizador da ${titulo}.` },
      ],
    };
  },
  component: OperadorItVisualizador,
});

function OperadorItVisualizador() {
  const { doc } = Route.useParams();
  const slug = doc as ItDocSlug;

  if (!SLUGS_VALIDOS.includes(slug)) {
    return <Navigate to="/operador/it" />;
  }

  return <Visualizador slug={slug} />;
}

function extrairNumero(entry: IndiceEntry): number | null {
  if (typeof entry.numero === "number") return entry.numero;
  if (typeof entry.numero === "string") {
    const n = parseInt(entry.numero, 10);
    if (!Number.isNaN(n)) return n;
  }
  const m = entry.label.match(/^Passo\s+(\d+)/i);
  if (m) return parseInt(m[1], 10);
  return null;
}

function montarLabelTopo(
  paginaAtual: number,
  totalPaginas: number,
  entradasDaPagina: IndiceEntry[],
): string {
  const fallback = `Página ${paginaAtual} de ${totalPaginas}`;
  const relevantes = entradasDaPagina.filter((e) => e.tipo !== "secao");
  if (relevantes.length === 0) return fallback;

  // Tipos especiais únicos
  const primeira = relevantes[0];
  if (relevantes.length === 1) {
    if (primeira.tipo === "capa") return `Página ${paginaAtual} · Capa`;
    if (primeira.tipo === "sumario")
      return `Página ${paginaAtual} · Sumário`;
    if (primeira.tipo === "anexo")
      return `Página ${paginaAtual} · ${primeira.label}`;
    if (primeira.tipo === "passo")
      return `Página ${paginaAtual} · ${primeira.label}`;
  }

  // Múltiplos passos
  const passos = relevantes.filter((e) => e.tipo === "passo");
  if (passos.length > 1) {
    const numeros = passos
      .map(extrairNumero)
      .filter((n): n is number => n !== null);
    if (numeros.length >= 2) {
      const min = Math.min(...numeros);
      const max = Math.max(...numeros);
      return `Página ${paginaAtual} · Passos ${min}–${max}`;
    }
  }

  if (primeira.label) return `Página ${paginaAtual} · ${primeira.label}`;
  return fallback;
}

function Visualizador({ slug }: { slug: ItDocSlug }) {
  const { usuario, loading } = useGuard("operador");
  const { isOnline } = useConnectionStatus();
  const itDoc = useItDocument();
  // docKey mantido por compat semântica do slug; identidade vem do login.
  const telemetria = useItTelemetria({ slug });
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [indiceOpen, setIndiceOpen] = useState(false);

  const docData = itDoc.getDoc(slug);
  const totalPaginas = docData?.total_paginas ?? 0;
  const tituloIt = IT_DOC_TITULO[slug];

  // Sempre inicia na página 1 (não persistir entre sessões)
  useEffect(() => {
    setPaginaAtual(1);
  }, [slug]);

  // ── telemetria: page_view a cada mudança de página (após manifest pronto) ──
  useEffect(() => {
    if (totalPaginas <= 0) return;
    if (!usuario?.userId) return;
    telemetria.trackPageView(paginaAtual);
  }, [paginaAtual, totalPaginas, telemetria, usuario?.userId]);

  // ── telemetria: cache_mode só em mudança real do par (isOnline, fromCache) ──
  const ultimoModoCacheRef = useRef<string | null>(null);
  useEffect(() => {
    if (totalPaginas <= 0) return;
    if (!usuario?.userId) return;
    const modo = !isOnline ? "offline" : itDoc.fromCache ? "cache" : "online";
    if (ultimoModoCacheRef.current === modo) return;
    ultimoModoCacheRef.current = modo;
    telemetria.trackEvento("cache_mode", { modo_cache: modo });
  }, [isOnline, itDoc.fromCache, totalPaginas, telemetria, usuario?.userId]);

  const paginaInfo = useMemo(() => {
    if (!docData) return null;
    return docData.paginas.find((p) => p.pagina === paginaAtual) ?? null;
  }, [docData, paginaAtual]);

  const indice = itDoc.getIndice(slug);
  const entradasDaPagina = useMemo(
    () => indice.filter((e) => e.pagina === paginaAtual),
    [indice, paginaAtual],
  );
  const labelTopo = useMemo(
    () => montarLabelTopo(paginaAtual, totalPaginas, entradasDaPagina),
    [paginaAtual, totalPaginas, entradasDaPagina],
  );

  // Pré-carregar próxima e anterior
  useEffect(() => {
    if (!docData) return;
    const vizinhas = [paginaAtual + 1, paginaAtual - 1];
    for (const n of vizinhas) {
      const p = docData.paginas.find((x) => x.pagina === n);
      if (!p) continue;
      const img = new Image();
      img.src = itDoc.getImageUrl(p.arquivo);
    }
  }, [docData, paginaAtual, itDoc]);

  if (loading || !usuario) return <TelaCarregando />;

  // Sem mais gate de identidade — o operador já está autenticado.
  // A ata de treinamento é controle separado (não bloqueia leitura da IT).

  // Estado de carregamento do manifest
  if (itDoc.status === "loading" || itDoc.status === "idle") {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader
          titulo={tituloIt}
          subtitulo="Carregando instrução..."
          voltarPara="/operador/it"
        />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Carregando instrução...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (itDoc.status === "error" || !docData) {
    const semCacheOffline = !isOnline && !itDoc.manifest;
    return (
      <div className="min-h-screen bg-background">
        <AppHeader titulo={tituloIt} voltarPara="/operador/it" />
        <main className="mx-auto flex min-h-[60vh] max-w-[600px] flex-col items-center justify-center gap-4 px-4 text-center">
          {semCacheOffline ? (
            <>
              <WifiOff className="h-10 w-10 text-muted-foreground" />
              <p className="text-base font-semibold text-foreground">
                Sem conexão.
              </p>
              <p className="text-sm text-muted-foreground">
                Abra a instrução ao menos uma vez com internet para
                disponibilizar o cache.
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-foreground">
                Não foi possível carregar a instrução de trabalho.
              </p>
              {itDoc.error && (
                <p className="text-xs text-muted-foreground">{itDoc.error}</p>
              )}
            </>
          )}
          <Button onClick={() => void itDoc.recarregar()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </main>
      </div>
    );
  }

  const irPara = (pag: number) => {
    if (pag < 1 || pag > totalPaginas) return;
    setPaginaAtual(pag);
    setIndiceOpen(false);
  };

  // Indicador discreto: offline (prioridade) ou cache
  const mostrarOffline = !isOnline;
  const mostrarCache = !mostrarOffline && itDoc.fromCache;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader titulo={tituloIt} voltarPara="/operador/it" />

      {/* Toolbar de navegação */}
      <div className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-2 px-3 py-2 md:px-6 md:py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => irPara(paginaAtual - 1)}
              disabled={paginaAtual <= 1}
              className="min-h-[40px]"
            >
              <ChevronLeft className="h-4 w-4 md:mr-1" />
              <span className="hidden md:inline">Anterior</span>
            </Button>

            <Select
              value={String(paginaAtual)}
              onValueChange={(v) => irPara(Number(v))}
            >
              <SelectTrigger className="h-10 min-w-[100px] md:min-w-[140px]">
                <SelectValue>
                  Pág. {paginaAtual} / {totalPaginas}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[60vh]">
                {docData.paginas.map((p) => (
                  <SelectItem key={p.pagina} value={String(p.pagina)}>
                    Página {p.pagina}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => irPara(paginaAtual + 1)}
              disabled={paginaAtual >= totalPaginas}
              className="min-h-[40px]"
            >
              <span className="hidden md:inline">Próxima</span>
              <ChevronRight className="h-4 w-4 md:ml-1" />
            </Button>
          </div>

          <div className="hidden flex-1 truncate px-4 text-center text-sm text-muted-foreground md:block">
            {labelTopo}
          </div>

          <Sheet
            open={indiceOpen}
            onOpenChange={(open) => {
              setIndiceOpen(open);
              if (open) {
                try {
                  telemetria.trackEvento("index_open");
                } catch {
                  /* ignore */
                }
              }
            }}
          >
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="min-h-[40px] gap-2">
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">Índice</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-[300px] flex-col overflow-hidden p-0 sm:w-[340px]"
            >
              <SheetHeader className="border-b border-border p-4">
                <SheetTitle>Índice</SheetTitle>
              </SheetHeader>
              <PainelIndice
                indice={indice}
                paginaAtual={paginaAtual}
                onSelect={irPara}
                aberto={indiceOpen}
                telemetria={telemetria}
              />
            </SheetContent>
          </Sheet>
        </div>

        {/* Indicador discreto offline / cache */}
        {(mostrarOffline || mostrarCache) && (
          <div
            className={cn(
              "flex items-center justify-center gap-1.5 px-3 py-1 text-[11px] font-medium",
              mostrarOffline
                ? "bg-destructive/10 text-destructive"
                : "bg-muted/60 text-muted-foreground",
            )}
            role="status"
          >
            {mostrarOffline ? (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Modo offline — usando dados em cache</span>
              </>
            ) : (
              <>
                <Database className="h-3 w-3" />
                <span>Consulta em cache</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Área da página */}
      <main className="flex-1 overflow-hidden bg-muted/30">
        {paginaInfo ? (
          <PaginaImagem
            key={`${slug}-${paginaInfo.pagina}`}
            url={itDoc.getImageUrl(paginaInfo.arquivo)}
            alt={`${tituloIt} — página ${paginaInfo.pagina}`}
            paginaNumero={paginaInfo.pagina}
            telemetria={telemetria}
          />
        ) : (
          <div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
            Página não encontrada.
          </div>
        )}
      </main>

      {/* Rodapé de navegação — visível em todas as larguras (tablet com luva) */}
      <div className="border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-2 px-3 py-2 md:px-6">
          <Button
            variant="outline"
            onClick={() => irPara(paginaAtual - 1)}
            disabled={paginaAtual <= 1}
            className="min-h-[44px] flex-1"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Anterior
          </Button>
          <Button
            onClick={() => irPara(paginaAtual + 1)}
            disabled={paginaAtual >= totalPaginas}
            className="min-h-[44px] flex-1"
          >
            Próxima
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

type ImagemStatus = "loading" | "ready" | "error";

function PaginaImagem({
  url,
  alt,
  paginaNumero,
  telemetria,
}: {
  url: string;
  alt: string;
  paginaNumero: number;
  telemetria: ReturnType<typeof useItTelemetria>;
}) {
  const [imagemStatus, setImagemStatus] = useState<ImagemStatus>("loading");
  const [tentativa, setTentativa] = useState(0);

  const srcEfetivo = tentativa === 0 ? url : `${url}?r=${tentativa}`;

  const tentarNovamente = () => {
    try {
      telemetria.trackEvento("image_retry", { pagina: paginaNumero });
    } catch {
      /* ignore */
    }
    setImagemStatus("loading");
    setTentativa((t) => t + 1);
  };

  const onErrorImg = () => {
    try {
      telemetria.trackEvento("image_error", { pagina: paginaNumero });
    } catch {
      /* ignore */
    }
    setImagemStatus("error");
  };

  const safeTrack = (tipo: "zoom_in" | "zoom_out" | "zoom_reset") => {
    try {
      telemetria.trackEvento(tipo, { pagina: paginaNumero });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative h-[calc(100vh-160px)] w-full md:h-[calc(100vh-200px)]">
      {imagemStatus === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
      {imagemStatus === "error" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <WifiOff className="h-10 w-10 text-muted-foreground" />
          <p className="text-base font-semibold text-foreground">
            Não foi possível carregar esta página
          </p>
          <p className="text-sm text-muted-foreground">
            Verifique sua conexão e tente novamente
          </p>
          <Button onClick={tentarNovamente} className="mt-1 gap-2">
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      )}
      <TransformWrapper
        initialScale={1}
        minScale={0.8}
        maxScale={5}
        doubleClick={{ mode: "toggle", step: 2.5 }}
        wheel={{ step: 0.15 }}
        pinch={{ step: 5 }}
        panning={{ velocityDisabled: true }}
        centerOnInit
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <TransformComponent
              wrapperClass="!h-full !w-full"
              contentClass="!h-full !w-full flex items-center justify-center"
            >
              <img
                key={tentativa}
                src={srcEfetivo}
                alt={alt}
                loading="eager"
                onLoad={() => setImagemStatus("ready")}
                onError={onErrorImg}
                className={cn(
                  "max-h-full max-w-full object-contain select-none transition-opacity",
                  imagemStatus === "error" && "opacity-0",
                )}
                draggable={false}
              />
            </TransformComponent>

            {imagemStatus === "ready" && (
              <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex flex-col gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={() => {
                    safeTrack("zoom_in");
                    zoomIn();
                  }}
                  aria-label="Aumentar zoom"
                  className="pointer-events-auto h-12 w-12 shadow-md"
                >
                  <Plus className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={() => {
                    safeTrack("zoom_out");
                    zoomOut();
                  }}
                  aria-label="Diminuir zoom"
                  className="pointer-events-auto h-12 w-12 shadow-md"
                >
                  <Minus className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={() => {
                    safeTrack("zoom_reset");
                    resetTransform();
                  }}
                  aria-label="Resetar zoom"
                  className="pointer-events-auto h-12 w-12 shadow-md"
                >
                  <RotateCcw className="h-5 w-5" />
                </Button>
              </div>
            )}
          </>
        )}
      </TransformWrapper>
    </div>
  );
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function PainelIndice({
  indice,
  paginaAtual,
  onSelect,
  aberto,
  telemetria,
}: {
  indice: IndiceEntry[];
  paginaAtual: number;
  onSelect: (pag: number) => void;
  aberto: boolean;
  telemetria: ReturnType<typeof useItTelemetria>;
}) {
  const [filtro, setFiltro] = useState("");
  const itemAtivoRef = useRef<HTMLLIElement | null>(null);
  const filtroNorm = normalizar(filtro);
  const filtroAtivo = filtroNorm.length > 0;

  // Auto-scroll para o item ativo quando o painel abre
  useEffect(() => {
    if (!aberto) return;
    if (filtroAtivo) return;
    const t = window.setTimeout(() => {
      itemAtivoRef.current?.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    }, 80);
    return () => window.clearTimeout(t);
  }, [aberto, filtroAtivo, paginaAtual]);

  // Reset do filtro ao fechar
  useEffect(() => {
    if (!aberto) setFiltro("");
  }, [aberto]);

  const entradasFiltradas = useMemo(() => {
    if (!filtroAtivo) return indice;
    return indice.filter((entry) => {
      if (entry.tipo === "secao") return false;
      const labelN = normalizar(entry.label);
      const numN = entry.numero != null ? normalizar(String(entry.numero)) : "";
      return labelN.includes(filtroNorm) || numN.includes(filtroNorm);
    });
  }, [indice, filtroAtivo, filtroNorm]);

  // Telemetria: index_search com debounce + sanitização
  const debouncerRef = useRef(criarDebouncerBusca(600));
  useEffect(() => {
    if (!aberto) return;
    if (!filtroAtivo) return;
    const qtd = entradasFiltradas.filter((e) => e.tipo !== "secao").length;
    debouncerRef.current.agendar(filtro, qtd, (termo, quantidade) => {
      try {
        telemetria.trackEvento("index_search", {
          termo_busca: termo,
          quantidade_resultados: quantidade,
        });
      } catch {
        /* ignore */
      }
    });
  }, [filtro, filtroAtivo, aberto, entradasFiltradas, telemetria]);

  // Reset do debouncer ao fechar
  useEffect(() => {
    if (!aberto) {
      debouncerRef.current.cancelar();
      debouncerRef.current.reset();
    }
  }, [aberto]);

  const semResultados = filtroAtivo && entradasFiltradas.length === 0;
  let primeiroAtivoEntregue = false;

  const handleSelect = (entry: IndiceEntry) => {
    try {
      const tipoEvento = filtroAtivo
        ? "index_search_result_click"
        : "index_click";
      telemetria.trackEvento(tipoEvento, {
        pagina_destino: entry.pagina,
        tipo_entrada: entry.tipo,
        label: entry.label,
        numero: entry.numero != null ? String(entry.numero) : null,
        termo_busca: filtroAtivo
          ? (filtro.trim().toLowerCase().slice(0, 100) || null)
          : null,
      });
    } catch {
      /* ignore */
    }
    onSelect(entry.pagina);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar passo, anexo ou palavra..."
            className="h-10 pl-9"
            aria-label="Buscar no índice"
          />
        </div>
      </div>

      {semResultados ? (
        <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum item encontrado
        </div>
      ) : (
        <ul className="flex flex-1 flex-col overflow-y-auto py-2">
          {entradasFiltradas.map((entry, i) => {
            if (entry.tipo === "secao") {
              return (
                <li
                  key={`secao-${i}`}
                  className="mt-3 px-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground first:mt-0"
                >
                  {entry.label}
                </li>
              );
            }
            const ativo = entry.pagina === paginaAtual;
            const ehPrimeiroAtivo = ativo && !primeiroAtivoEntregue;
            if (ehPrimeiroAtivo) primeiroAtivoEntregue = true;
            return (
              <li
                key={`${entry.tipo}-${i}`}
                ref={ehPrimeiroAtivo ? itemAtivoRef : undefined}
              >
                <button
                  type="button"
                  onClick={() => handleSelect(entry)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted",
                    ativo &&
                      "border-l-2 border-primary/40 bg-primary/10 text-foreground",
                  )}
                >
                  <span className="flex-1 truncate">{entry.label}</span>
                  <span
                    className={cn(
                      "shrink-0 text-xs text-muted-foreground",
                      ativo && "text-foreground/70",
                    )}
                  >
                    p. {entry.pagina}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SemTreinamentoBloqueio({
  nome,
  tituloIt,
}: {
  nome: string;
  tituloIt: string;
}) {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader titulo={tituloIt} voltarPara="/operador/it" />
      <main className="mx-auto flex min-h-[70vh] w-full max-w-xl items-center px-4 py-8">
        <div className="w-full rounded-2xl border-2 border-warning/40 bg-card p-6 text-center md:p-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/15">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-8 w-8 text-warning-foreground"
            >
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-foreground md:text-2xl">
            Acesso bloqueado
          </h2>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">
            <strong className="text-foreground">{nome}</strong>, você ainda não
            tem ata de treinamento cadastrada para esta IT.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Para liberar o acesso, cadastre a Ata de Treinamento na Função com a
            assinatura do instrutor que te ensinou.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <a
              href="/operador/it/ata"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              Cadastrar Ata de Treinamento
            </a>
            <a
              href="/operador/it"
              className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-border bg-background px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Voltar
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
