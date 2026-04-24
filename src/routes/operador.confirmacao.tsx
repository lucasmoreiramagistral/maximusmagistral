import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGuard } from "@/hooks/use-guard";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { TelaCarregando } from "@/components/tela-carregando";
import { formatarDataHora } from "@/lib/checklist/format";
import type { Checklist } from "@/lib/checklist/types";

export const Route = createFileRoute("/operador/confirmacao")({
  head: () => ({ meta: [{ title: "Checklist concluído" }] }),
  component: ConfirmacaoPage,
});

function ConfirmacaoPage() {
  const { usuario, loading } = useGuard("operador");
  const { isOnline, pendingCount } = useConnectionStatus();
  const [ultimo, setUltimo] = useState<Checklist | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || loading || !usuario) return;
    const raw = window.sessionStorage.getItem("fm-checklist:ultimo-concluido");
    if (raw) setUltimo(JSON.parse(raw) as Checklist);
  }, [usuario, loading]);

  if (loading || !usuario) return <TelaCarregando />;

  const sincronizado = isOnline && pendingCount === 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 text-center shadow-sm md:p-10">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="h-12 w-12" />
        </div>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">
          Checklist concluído com sucesso!
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          {sincronizado
            ? "Dados enviados ao servidor"
            : "Salvo no dispositivo. Será enviado automaticamente quando a conexão voltar."}
        </p>

        {ultimo && (
          <div className="mt-6 grid grid-cols-1 gap-3 rounded-xl bg-muted/50 p-4 text-left md:grid-cols-3 md:p-5">
            <Info
              label="Data e hora"
              valor={formatarDataHora(ultimo.concluidoEm ?? ultimo.criadoEm)}
            />
            <Info label="Equipe" valor={ultimo.contexto.equipe} />
            <Info label="Momento" valor={ultimo.momento} />
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-center">
          <Button asChild size="lg" className="h-14 text-base font-semibold md:px-8">
            <Link to="/operador/momento">Voltar aos momentos</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-14 text-base font-semibold md:px-8"
          >
            <Link to="/operador">Início</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{valor}</p>
    </div>
  );
}
