import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PtpItemContadorProps {
  nome: string;
  totalAcumulado: number;
  disabled?: boolean;
  /** Adiciona `quantidade` (>0) ao total acumulado. */
  onAdicionar: (quantidade: number) => void;
  /** Remove o último lançamento (quantidade positiva) do histórico. */
  onDesfazerUltimo: () => void;
  /** Zera o total registrando uma correção negativa preservando histórico. */
  onZerarTotal: () => void;
  /** Existe lançamento positivo desfazível no histórico? */
  podeDesfazer: boolean;
}

/**
 * UX combinada com a coordenação:
 *  - Toque simples em -1/+1/+5/+10 só altera o campo "Quantidade para adicionar".
 *  - Pressionar e segurar repete o incremento (500ms delay, depois 200ms).
 *  - O total acumulado SÓ muda ao clicar "Adicionar ao total".
 *  - Limpar entrada zera só o campo de entrada.
 *  - Desfazer último remove o último lançamento positivo.
 *  - Zerar total exige confirmação forte e preserva histórico (correção negativa).
 *  - Não permite número negativo na entrada.
 */
export function PtpItemContador({
  nome,
  totalAcumulado,
  disabled,
  onAdicionar,
  onDesfazerUltimo,
  onZerarTotal,
  podeDesfazer,
}: PtpItemContadorProps) {
  const [entrada, setEntrada] = useState(0);
  const [confirmZerar, setConfirmZerar] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limparTimers = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Cleanup obrigatório ao desmontar — nunca deixar um interval rodando sozinho.
  useEffect(() => {
    return () => limparTimers();
  }, [limparTimers]);

  const aplicarDelta = useCallback((delta: number) => {
    setEntrada((prev) => Math.max(0, prev + delta));
  }, []);

  // Mantemos a flag `disabled` em ref para que o interval em execução
  // possa parar imediatamente se o componente for desabilitado durante o hold.
  const disabledRef = useRef(!!disabled);
  useEffect(() => {
    disabledRef.current = !!disabled;
    if (disabled) limparTimers();
  }, [disabled, limparTimers]);

  const iniciarPressHold = useCallback(
    (delta: number) => {
      if (disabled) return;
      // toque simples: aplica uma vez imediatamente
      aplicarDelta(delta);
      limparTimers();
      // Após 500ms começa a repetir a cada 200ms (sem aceleração agressiva).
      timeoutRef.current = setTimeout(() => {
        intervalRef.current = setInterval(() => {
          if (disabledRef.current) {
            limparTimers();
            return;
          }
          aplicarDelta(delta);
        }, 200);
      }, 500);
    },
    [aplicarDelta, disabled, limparTimers],
  );

  const handleAdicionar = () => {
    if (disabled) return;
    if (entrada <= 0) return;
    onAdicionar(entrada);
    setEntrada(0);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-foreground">{nome}</p>
        <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
          Total: {totalAcumulado}
        </span>
      </div>

      {/* Controle grande: seta vermelha < número > seta verde */}
      <div className="mb-2">
        <label className="text-xs font-medium text-muted-foreground">
          Quantidade para adicionar
        </label>
        <div className="mt-1 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={disabled || entrada === 0}
            onPointerDown={(e) => {
              e.preventDefault();
              iniciarPressHold(-1);
            }}
            onPointerUp={limparTimers}
            onPointerLeave={limparTimers}
            onPointerCancel={limparTimers}
            className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-2 transition-all ${
              disabled || entrada === 0
                ? "cursor-not-allowed border-border bg-muted text-muted-foreground"
                : "border-destructive bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-95 active:bg-destructive/30"
            }`}
            aria-label="Diminuir"
          >
            <ChevronLeft className="h-12 w-12" strokeWidth={3} />
          </button>

          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={entrada}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setEntrada(Number.isFinite(n) && n > 0 ? n : 0);
            }}
            onFocus={(e) => e.currentTarget.select()}
            disabled={disabled}
            className="h-20 min-w-[5rem] flex-1 rounded-2xl border-2 border-border bg-background px-4 text-center text-4xl font-bold text-foreground tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />

          <button
            type="button"
            disabled={disabled}
            onPointerDown={(e) => {
              e.preventDefault();
              iniciarPressHold(1);
            }}
            onPointerUp={limparTimers}
            onPointerLeave={limparTimers}
            onPointerCancel={limparTimers}
            className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-2 transition-all ${
              disabled
                ? "cursor-not-allowed border-border bg-muted text-muted-foreground"
                : "border-emerald-600 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 active:scale-95 active:bg-emerald-500/30 dark:text-emerald-400"
            }`}
            aria-label="Aumentar"
          >
            <ChevronRight className="h-12 w-12" strokeWidth={3} />
          </button>
        </div>
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          Toque nas setas para ±1 · Segure para repetir · Toque no número para digitar
        </p>
      </div>

      {/* Atalhos rápidos -1 / +1 / +5 / +10 */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "-1", delta: -1 },
          { label: "+1", delta: 1 },
          { label: "+5", delta: 5 },
          { label: "+10", delta: 10 },
        ].map(({ label, delta }) => (
          <button
            key={label}
            type="button"
            disabled={disabled}
            onPointerDown={(e) => {
              e.preventDefault();
              iniciarPressHold(delta);
            }}
            onPointerUp={limparTimers}
            onPointerLeave={limparTimers}
            onPointerCancel={limparTimers}
            className={`h-11 rounded-md border-2 text-base font-bold transition-all ${
              disabled
                ? "cursor-not-allowed border-border bg-muted text-muted-foreground"
                : "border-border bg-background text-foreground hover:border-primary/50 active:scale-95 active:bg-primary/10"
            }`}
            aria-label={`Ajustar ${label}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Ações principais */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          onClick={handleAdicionar}
          disabled={disabled || entrada <= 0}
          className="h-12 flex-1 text-base font-bold"
        >
          Adicionar ao total
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDesfazerUltimo}
          disabled={disabled || !podeDesfazer}
          className="h-12 sm:w-auto"
        >
          <Undo2 className="mr-1 h-4 w-4" />
          Desfazer último
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirmZerar(true)}
          disabled={disabled || totalAcumulado === 0}
          className="h-12 text-destructive hover:text-destructive sm:w-auto"
        >
          <RotateCcw className="mr-1 h-4 w-4" />
          Zerar total
        </Button>
      </div>

      <AlertDialog open={confirmZerar} onOpenChange={setConfirmZerar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zerar total deste item?</AlertDialogTitle>
            <AlertDialogDescription>
              O total acumulado de <strong>{nome}</strong> ({totalAcumulado}) será
              zerado. Uma correção negativa é registrada no histórico para
              rastreabilidade — o histórico anterior não é apagado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onZerarTotal();
                setConfirmZerar(false);
              }}
            >
              Zerar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
