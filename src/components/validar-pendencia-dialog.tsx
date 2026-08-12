import { useState } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/signature-pad";
import type { Pendencia } from "@/lib/farol/pendencias";
import { formatarDataBR } from "@/lib/operacao/data-operacional";

export function ValidarPendenciaDialog({
  pendencia,
  salvando,
  erro,
  onFechar,
  onConfirmar,
}: {
  pendencia: Pendencia;
  salvando: boolean;
  erro: string;
  onFechar: () => void;
  onConfirmar: (assinatura: string) => void;
}) {
  const [assinatura, setAssinatura] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-validar-pendencia"
    >
      <div className="my-8 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div className="flex-1">
            <h2 id="titulo-validar-pendencia" className="text-lg font-bold text-foreground">
              Conferir e validar fechamento
            </h2>
            <p className="text-sm text-muted-foreground">
              {pendencia.titulo} · {formatarDataBR(pendencia.dataOrigem)}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            aria-label="Fechar"
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-border bg-muted/30 p-3 text-sm">
          <p className="font-semibold text-foreground">{pendencia.contexto}</p>
          <p className="mt-1 text-xs text-muted-foreground">{pendencia.detalhe}</p>
        </div>

        <SignaturePad
          label="Assinatura da liderança"
          ajuda="Ao confirmar, assinatura, identidade e horário são gravados juntos pelo banco."
          value={assinatura}
          onChange={setAssinatura}
        />

        {erro && (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive">
            {erro}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onFechar}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={salvando || !assinatura}
            onClick={() => assinatura && onConfirmar(assinatura)}
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar validação"}
          </Button>
        </div>
      </div>
    </div>
  );
}
