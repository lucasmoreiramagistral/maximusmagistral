import { useEffect, useRef, useState, useCallback } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SignaturePadProps {
  /** dataURL atual (PNG base64) — controlado pelo pai. */
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label: string;
  /** Texto auxiliar exibido abaixo do label. */
  ajuda?: string;
  /** Altura em px do canvas (largura é 100%). */
  altura?: number;
}

/**
 * Pad de assinatura digital com suporte a mouse + touch (dedo).
 * Exporta a assinatura como PNG base64 (data URL) ao soltar.
 */
export function SignaturePad({
  value,
  onChange,
  label,
  ajuda,
  altura = 180,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const desenhandoRef = useRef(false);
  const ultimoPontoRef = useRef<{ x: number; y: number } | null>(null);
  const [vazio, setVazio] = useState<boolean>(!value);

  const getCtx = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return null;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0a0a0a";
    ctx.lineWidth = 2.2;
    return ctx;
  }, []);

  // Ajusta DPR e dimensões do canvas, e redesenha valor existente.
  const reset = useCallback(() => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = altura;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
      };
      img.src = value;
      setVazio(false);
    } else {
      setVazio(true);
    }
  }, [altura, value]);

  useEffect(() => {
    reset();
    const onResize = () => reset();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando value muda externamente (ex: limpou), refletir no canvas.
  useEffect(() => {
    if (!value) {
      const cv = canvasRef.current;
      const wrap = wrapRef.current;
      if (!cv || !wrap) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, wrap.clientWidth, altura);
      setVazio(true);
    }
  }, [value, altura]);

  function pontoFromEvent(e: PointerEvent | React.PointerEvent): { x: number; y: number } | null {
    const cv = canvasRef.current;
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    desenhandoRef.current = true;
    const p = pontoFromEvent(e);
    ultimoPontoRef.current = p;
    const ctx = getCtx();
    if (!ctx || !p) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = "#0a0a0a";
    ctx.fill();
    setVazio(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!desenhandoRef.current) return;
    e.preventDefault();
    const p = pontoFromEvent(e);
    const ant = ultimoPontoRef.current;
    const ctx = getCtx();
    if (!ctx || !p || !ant) return;
    ctx.beginPath();
    ctx.moveTo(ant.x, ant.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimoPontoRef.current = p;
  };

  const finalizarTraco = () => {
    if (!desenhandoRef.current) return;
    desenhandoRef.current = false;
    ultimoPontoRef.current = null;
    const cv = canvasRef.current;
    if (!cv) return;
    try {
      const dataUrl = cv.toDataURL("image/png");
      onChange(dataUrl);
    } catch (err) {
      console.error("[SignaturePad] toDataURL falhou:", err);
    }
  };

  const limpar = () => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, wrap.clientWidth, altura);
    setVazio(true);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-base font-bold text-foreground">{label}</p>
          {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={limpar}
          className="h-9"
        >
          <Eraser className="mr-1.5 h-4 w-4" /> Limpar
        </Button>
      </div>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-xl border-2 border-dashed border-border bg-white"
        style={{ height: altura }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finalizarTraco}
          onPointerCancel={finalizarTraco}
          onPointerLeave={finalizarTraco}
          className="block h-full w-full touch-none cursor-crosshair"
        />
        {vazio && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-muted-foreground/70">
            Assine aqui com o dedo
          </p>
        )}
      </div>
    </div>
  );
}
