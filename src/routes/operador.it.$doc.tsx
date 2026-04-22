import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  WifiOff,
} from "lucide-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { AppHeader } from "@/components/app-header";
import { TelaCarregando } from "@/components/tela-carregando";
import { Button } from "@/components/ui/button";
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
  entradasDaPagina: IndiceEntry[],
): string {
  const relevantes = entradasDaPagina.filter((e) => e.tipo !== "secao");
  if (relevantes.length === 0) return `Página ${paginaAtual}`;

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

  return `Página ${paginaAtual} · ${primeira.label}`;
}

function Visualizador({ slug }: { slug: ItDocSlug }) {
  const { usuario, loading } = useGuard("operador");
  const { isOnline } = useConnectionStatus();
  const itDoc = useItDocument();
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [indiceOpen, setIndiceOpen] = useState(false);

  const docData = itDoc.getDoc(slug);
  const totalPaginas = docData?.total_paginas ?? 0;
  const tituloIt = IT_DOC_TITULO[slug];

  // Sempre inicia na página 1 (não persistir entre sessões)
  useEffect(() => {
    setPaginaAtual(1);
  }, [slug]);

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
    () => montarLabelTopo(paginaAtual, entradasDaPagina),
    [paginaAtual, entradasDaPagina],
  );

  // Pré-carregar próxima página
  useEffect(() => {
    if (!docData) return;
    const proxima = docData.paginas.find((p) => p.pagina === paginaAtual + 1);
    if (!proxima) return;
    const img = new Image();
    img.src = itDoc.getImageUrl(proxima.arquivo);
  }, [docData, paginaAtual, itDoc]);

  if (loading || !usuario) return <TelaCarregando />;

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

          <Sheet open={indiceOpen} onOpenChange={setIndiceOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="min-h-[40px] gap-2">
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">Índice</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[300px] overflow-y-auto p-0 sm:w-[320px]"
            >
              <SheetHeader className="border-b border-border p-4">
                <SheetTitle>Índice</SheetTitle>
              </SheetHeader>
              <PainelIndice
                indice={indice}
                paginaAtual={paginaAtual}
                onSelect={irPara}
              />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Área da página */}
      <main className="flex-1 overflow-hidden bg-muted/30">
        {paginaInfo ? (
          <PaginaImagem
            key={`${slug}-${paginaInfo.pagina}`}
            url={itDoc.getImageUrl(paginaInfo.arquivo)}
            alt={`${tituloIt} — página ${paginaInfo.pagina}`}
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

function PaginaImagem({ url, alt }: { url: string; alt: string }) {
  const [imagemStatus, setImagemStatus] = useState<ImagemStatus>("loading");

  return (
    <div className="relative h-[calc(100vh-160px)] w-full md:h-[calc(100vh-200px)]">
      {imagemStatus === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
      {imagemStatus === "error" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <WifiOff className="h-10 w-10 text-muted-foreground" />
          <p className="text-base font-semibold text-foreground">
            Não foi possível carregar esta página
          </p>
          <p className="text-sm text-muted-foreground">
            Verifique sua conexão e tente novamente
          </p>
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
                src={url}
                alt={alt}
                loading="eager"
                onLoad={() => setImagemStatus("ready")}
                onError={() => setImagemStatus("error")}
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
                  onClick={() => zoomIn()}
                  aria-label="Aumentar zoom"
                  className="pointer-events-auto h-12 w-12 shadow-md"
                >
                  <Plus className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={() => zoomOut()}
                  aria-label="Diminuir zoom"
                  className="pointer-events-auto h-12 w-12 shadow-md"
                >
                  <Minus className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={() => resetTransform()}
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

function PainelIndice({
  indice,
  paginaAtual,
  onSelect,
}: {
  indice: IndiceEntry[];
  paginaAtual: number;
  onSelect: (pag: number) => void;
}) {
  return (
    <ul className="flex flex-col py-2">
      {indice.map((entry, i) => {
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
        return (
          <li key={`${entry.tipo}-${i}`}>
            <button
              type="button"
              onClick={() => onSelect(entry.pagina)}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted",
                ativo &&
                  "border-l-2 border-primary/40 bg-primary/8 text-foreground",
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
  );
}
