import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Trash2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
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
import { TelaCarregando } from "@/components/tela-carregando";
import { useGuard } from "@/hooks/use-guard";
import {
  useConnectionStatus,
  useOfflineQueue,
  type FilaItem,
} from "@/hooks/use-connection-status";
import { labelLimpezaTurno, labelPtpJanela } from "@/lib/verso/observacoes";
import { formatarDataHora } from "@/lib/checklist/format";

export const Route = createFileRoute("/operador/fila-pendente")({
  head: () => ({ meta: [{ title: "Fila de envio pendente" }] }),
  component: FilaPendentePage,
});

function descreverItem(item: FilaItem): string {
  try {
    switch (item.tipo) {
      case "ptp_janela": {
        const p = item.payload as { janela?: { janelaCodigo?: string } };
        return `PTP — ${labelPtpJanela(p.janela?.janelaCodigo ?? "?")}`;
      }
      case "limpeza_turno": {
        const p = item.payload as { turno?: { turno?: string } };
        return `Limpeza — ${labelLimpezaTurno((p.turno?.turno as never) ?? "?")}`;
      }
      case "checklist":
        return "Checklist da frente";
      case "anomalia":
        return "Anomalia (NC) do checklist";
      case "it_evento":
        return "Telemetria IT";
      case "it_sessao_close":
        return "Fechamento de sessão IT";
      default:
        return item.tipo;
    }
  } catch {
    return item.tipo;
  }
}

function FilaPendentePage() {
  const { usuario, loading } = useGuard("operador");
  const { isOnline, sincronizando: sincStatus } = useConnectionStatus();
  const { fila, sincronizar } = useOfflineQueue();
  const [descartando, setDescartando] = useState<string | null>(null);

  if (loading || !usuario) return <TelaCarregando />;

  const descartar = (id: string) => {
    try {
      const raw = window.localStorage.getItem("fm-checklist:fila-offline");
      const lista: FilaItem[] = raw ? JSON.parse(raw) : [];
      const nova = lista.filter((i) => i.id !== id);
      window.localStorage.setItem("fm-checklist:fila-offline", JSON.stringify(nova));
      // força re-leitura no store; um sincronizar leve atualiza pendingCount.
      void sincronizar();
      toast.success("Item removido da fila.");
    } catch (e) {
      toast.error("Não foi possível remover.");
      console.error(e);
    } finally {
      setDescartando(null);
    }
  };

  const tentarAgora = async () => {
    if (!isOnline) {
      toast.warning("Você está offline. Aguardando a conexão voltar.");
      return;
    }
    toast("Tentando enviar pendências…");
    await sincronizar();
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Fila de envio pendente"
        subtitulo="Registros que ainda não foram enviados ao servidor"
        voltarPara="/operador"
      />

      <main className="mx-auto w-full max-w-[900px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : (
              <WifiOff className="h-5 w-5 text-destructive" />
            )}
            <div>
              <p className="text-sm font-bold text-foreground">
                {isOnline ? "Conectado" : "Sem conexão"}
              </p>
              <p className="text-xs text-muted-foreground">
                {fila.length} item{fila.length === 1 ? "" : "s"} na fila
              </p>
            </div>
          </div>
          <Button onClick={tentarAgora} disabled={!isOnline || sincStatus}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${sincStatus ? "animate-spin" : ""}`} />
            Tentar enviar agora
          </Button>
        </div>

        {fila.length === 0 ? (
          <div className="rounded-xl border border-success/30 bg-success-soft p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
            <p className="mt-2 text-base font-bold text-success">
              Nenhuma pendência
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Todos os seus registros foram enviados ao servidor.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {fila.map((item) => {
              const isConflito = item.status === "conflito";
              const isEsgotado = item.tentativas >= 5;
              const cls = isConflito
                ? "border-destructive/40 bg-destructive-soft"
                : isEsgotado
                  ? "border-warning/40 bg-warning/10"
                  : "border-border bg-card";
              return (
                <li
                  key={item.id}
                  className={`rounded-xl border-2 p-4 ${cls}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-foreground">
                        {descreverItem(item)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Criado em {formatarDataHora(item.criadoEm)} ·{" "}
                        {item.tentativas} tentativa
                        {item.tentativas === 1 ? "" : "s"}
                      </p>
                      {isConflito && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-destructive">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          Conflito de versão — outro operador alterou esse
                          registro. Descarte e refaça na tela original.
                        </p>
                      )}
                      {isEsgotado && !isConflito && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-warning-foreground">
                          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          Esgotou as tentativas. Verifique a conexão e tente
                          novamente, ou descarte.
                        </p>
                      )}
                      {item.ultimoErro && (
                        <p className="mt-2 break-words rounded-md bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
                          {item.ultimoErro}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => setDescartando(item.id)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Descartar
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <AlertDialog
        open={descartando !== null}
        onOpenChange={(open) => !open && setDescartando(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar este item?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro será removido permanentemente da fila e{" "}
              <strong>não será enviado ao servidor</strong>. Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => descartando && descartar(descartando)}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
