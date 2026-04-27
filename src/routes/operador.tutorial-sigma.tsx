import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  WifiOff,
  CheckCircle2,
  Wrench,
  ZoomIn,
  X,
  Plus,
  Minus,
  RotateCcw,
} from "lucide-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { AppHeader } from "@/components/app-header";
import { TelaCarregando } from "@/components/tela-carregando";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useGuard } from "@/hooks/use-guard";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { useTutorialSigma } from "@/hooks/use-tutorial-sigma";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/operador/tutorial-sigma")({
  head: () => ({
    meta: [
      { title: "Tutorial SIGMA — Registrar Anomalia" },
      {
        name: "description",
        content:
          "Passo a passo para abrir e fechar Ordem de Serviço no SIGMA Manutenção.",
      },
    ],
  }),
  component: TutorialSigmaPage,
});

function TutorialSigmaPage() {
  const { usuario, loading } = useGuard("operador");
  const { isOnline } = useConnectionStatus();
  const tutorial = useTutorialSigma();
  const [stepIndex, setStepIndex] = useState(0);
  const [imgStatus, setImgStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [imgRetry, setImgRetry] = useState(0);
  const [zoomAberto, setZoomAberto] = useState(false);

  // Sempre começa no passo 1 ao entrar
  useEffect(() => {
    setStepIndex(0);
  }, []);

  // Reseta status da imagem ao trocar de passo
  useEffect(() => {
    setImgStatus("loading");
    setImgRetry(0);
  }, [stepIndex]);

  // Pré-carrega imagens vizinhas (próxima e anterior)
  useEffect(() => {
    if (!tutorial.manifest) return;
    const total = tutorial.manifest.steps.length;
    const vizinhos = [stepIndex + 1, stepIndex - 1].filter(
      (i) => i >= 0 && i < total,
    );
    for (const i of vizinhos) {
      const s = tutorial.manifest.steps[i];
      const img = new Image();
      img.src = tutorial.getImageUrl(s.image);
    }
  }, [tutorial, stepIndex]);

  if (loading || !usuario) return <TelaCarregando />;

  // Loading
  if (tutorial.status === "loading" || tutorial.status === "idle") {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader
          titulo="Tutorial SIGMA"
          subtitulo="Carregando..."
          voltarPara="/operador"
        />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Carregando tutorial...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Erro
  if (tutorial.status === "error" || !tutorial.manifest) {
    const semCacheOffline = !isOnline && !tutorial.manifest;
    return (
      <div className="min-h-screen bg-background">
        <AppHeader titulo="Tutorial SIGMA" voltarPara="/operador" />
        <main className="mx-auto flex min-h-[60vh] max-w-[600px] flex-col items-center justify-center gap-4 px-4 text-center">
          {semCacheOffline ? (
            <>
              <WifiOff className="h-10 w-10 text-muted-foreground" />
              <p className="text-base font-semibold text-foreground">
                Sem conexão.
              </p>
              <p className="text-sm text-muted-foreground">
                Abra o tutorial ao menos uma vez com internet para
                disponibilizar o cache offline.
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-foreground">
                Não foi possível carregar o tutorial.
              </p>
              {tutorial.error && (
                <p className="text-xs text-muted-foreground">
                  {tutorial.error}
                </p>
              )}
            </>
          )}
          <Button onClick={() => void tutorial.recarregar()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </main>
      </div>
    );
  }

  const { manifest } = tutorial;
  const totalSteps = manifest.steps.length;
  const passo = manifest.steps[stepIndex];
  const ehUltimo = stepIndex === totalSteps - 1;
  const ehPrimeiro = stepIndex === 0;
  const progresso = ((stepIndex + 1) / totalSteps) * 100;

  const proximo = () => {
    if (!ehUltimo) setStepIndex((i) => i + 1);
  };
  const anterior = () => {
    if (!ehPrimeiro) setStepIndex((i) => i - 1);
  };

  const imgUrl = tutorial.getImageUrl(passo.image);
  const srcEfetivo = imgRetry === 0 ? imgUrl : `${imgUrl}?r=${imgRetry}`;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader
        titulo={manifest.title}
        subtitulo={manifest.subtitle}
        voltarPara="/operador"
      />

      {/* Barra de progresso */}
      <div className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto w-full max-w-[1000px] px-4 py-3 md:px-8">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wrench className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">
                  Passo {stepIndex + 1} de {totalSteps}
                </p>
                {tutorial.fromCache && (
                  <p className="text-[11px] text-muted-foreground">
                    Modo offline · cache
                  </p>
                )}
              </div>
            </div>
            <div className="text-xs font-semibold text-muted-foreground">
              {Math.round(progresso)}%
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>
      </div>

      {/* Conteúdo do passo */}
      <main className="flex-1 bg-muted/30 pb-28 md:pb-32">
        <div className="mx-auto w-full max-w-[1000px] px-4 py-6 md:px-8 md:py-8">
          {/* Título e descrição */}
          <div className="mb-6">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1">
              <span className="text-xs font-bold uppercase tracking-wide text-primary">
                Passo {passo.step}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-foreground md:text-3xl">
              {passo.title}
            </h2>
            <div className="mt-3 whitespace-pre-line text-base text-muted-foreground md:text-lg">
              {passo.description}
            </div>
          </div>

          {/* Imagem */}
          <div className="relative mb-6 overflow-hidden rounded-2xl border-2 border-border bg-card shadow-sm">
            {imgStatus === "loading" && (
              <div className="absolute inset-0 z-10 flex min-h-[300px] items-center justify-center bg-card/80">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            {imgStatus === "error" && (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <WifiOff className="h-10 w-10 text-muted-foreground" />
                <p className="text-base font-semibold text-foreground">
                  Não foi possível carregar a imagem deste passo
                </p>
                <Button
                  onClick={() => {
                    setImgStatus("loading");
                    setImgRetry((r) => r + 1);
                  }}
                  className="mt-1 gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Tentar novamente
                </Button>
              </div>
            )}
            <img
              key={`${stepIndex}-${imgRetry}`}
              src={srcEfetivo}
              alt={`Passo ${passo.step}: ${passo.title}`}
              className={cn(
                "block h-auto w-full cursor-zoom-in",
                imgStatus !== "ready" && "opacity-0",
              )}
              onClick={() => imgStatus === "ready" && setZoomAberto(true)}
              onLoad={() => setImgStatus("ready")}
              onError={() => setImgStatus("error")}
              loading="eager"
              decoding="async"
            />
            {imgStatus === "ready" && (
              <button
                type="button"
                onClick={() => setZoomAberto(true)}
                aria-label="Ampliar imagem"
                className="absolute bottom-3 right-3 z-20 flex min-h-[52px] min-w-[52px] items-center justify-center gap-2 rounded-xl bg-foreground/85 px-4 text-background shadow-lg backdrop-blur transition-all active:scale-[0.95] active:bg-foreground"
              >
                <ZoomIn className="h-5 w-5" />
                <span className="text-sm font-semibold">Ampliar</span>
              </button>
            )}
          </div>

          {/* Dialog de zoom em tela cheia (mesmo padrão das IT) */}
          <Dialog open={zoomAberto} onOpenChange={setZoomAberto}>
            <DialogContent
              className="h-[100dvh] max-h-[100dvh] w-screen max-w-none gap-0 border-0 bg-black/95 p-0 sm:rounded-none [&>button]:hidden"
            >
              <button
                type="button"
                onClick={() => setZoomAberto(false)}
                aria-label="Fechar zoom"
                className="absolute right-4 top-4 z-50 flex h-14 min-w-[120px] items-center justify-center gap-2 rounded-full bg-background px-5 font-semibold text-foreground shadow-xl transition-all hover:bg-background/90 active:scale-[0.95]"
              >
                <X className="h-5 w-5" />
                <span className="text-base">Fechar</span>
              </button>

              {/* Dica de uso (canto inferior esquerdo) */}
              <div className="pointer-events-none absolute bottom-4 left-4 z-40 hidden max-w-xs rounded-lg bg-background/85 px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur md:block">
                <p className="font-semibold">Como usar:</p>
                <p className="text-muted-foreground">
                  Scroll do mouse ou botões + / − para zoom · arraste para mover · ESC ou "Fechar" para sair
                </p>
              </div>
              <div className="relative h-full w-full">
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
                          src={srcEfetivo}
                          alt={`Passo ${passo.step}: ${passo.title} (ampliado)`}
                          className="max-h-full max-w-full select-none object-contain"
                          draggable={false}
                        />
                      </TransformComponent>

                      <div className="pointer-events-none absolute bottom-4 right-4 z-40 flex flex-col gap-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          onClick={() => zoomIn()}
                          aria-label="Aumentar zoom"
                          className="pointer-events-auto h-14 w-14 shadow-lg active:scale-[0.95]"
                        >
                          <Plus className="h-6 w-6" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          onClick={() => zoomOut()}
                          aria-label="Diminuir zoom"
                          className="pointer-events-auto h-14 w-14 shadow-lg active:scale-[0.95]"
                        >
                          <Minus className="h-6 w-6" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          onClick={() => resetTransform()}
                          aria-label="Resetar zoom"
                          className="pointer-events-auto h-14 w-14 shadow-lg active:scale-[0.95]"
                        >
                          <RotateCcw className="h-6 w-6" />
                        </Button>
                      </div>
                    </>
                  )}
                </TransformWrapper>
              </div>
            </DialogContent>
          </Dialog>

          {/* Bloco final no último passo */}
          {ehUltimo && (
            <div className="mb-6 rounded-2xl border-2 border-success/40 bg-success/10 p-5 md:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success/20 text-success">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground md:text-xl">
                    Tutorial concluído!
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground md:text-base">
                    Agora você sabe como abrir e fechar uma OS no SIGMA. Em
                    caso de dúvida, volte a esta tela quando quiser.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Rodapé de navegação */}
      <div className="sticky bottom-0 border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-[1000px] items-center justify-between gap-2 px-4 py-3 md:px-8 md:py-4">
          <Button
            variant="outline"
            size="lg"
            onClick={anterior}
            disabled={ehPrimeiro}
            className="min-h-[60px] flex-1 text-base font-semibold transition-all active:scale-[0.97] active:bg-muted active:shadow-inner"
          >
            <ChevronLeft className="mr-1 h-5 w-5" />
            Anterior
          </Button>
          {ehUltimo ? (
            <Button
              asChild
              size="lg"
              className="min-h-[60px] flex-1 text-base font-semibold transition-all active:scale-[0.97] active:shadow-inner"
            >
              <Link to="/operador">
                <CheckCircle2 className="mr-1 h-5 w-5" />
                Concluir
              </Link>
            </Button>
          ) : (
            <Button
              onClick={proximo}
              size="lg"
              className="min-h-[60px] flex-1 text-base font-semibold transition-all active:scale-[0.97] active:shadow-inner"
            >
              Próximo
              <ChevronRight className="ml-1 h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
