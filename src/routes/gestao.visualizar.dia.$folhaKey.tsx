import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ChecklistDiaDetalhe } from "@/components/checklist-dia-detalhe";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAnomaliasRemote, useChecklistsRemote } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";
import { buildFolhasAgrupadas } from "@/lib/checklist/supabase-storage";
import {
  exportarFolhaDiaExcel,
  exportarFrenteVersoCompletoExcel,
  exportarTurnoComVersoExcel,
  exportarTurnoExcel,
} from "@/lib/checklist/excel-export";
import { ObservacoesVersoConsolidado } from "@/components/observacoes-verso-consolidado";
import { VersoDiaDetalhe } from "@/components/verso-dia-detalhe";
import { temVerso } from "@/lib/verso/aplicabilidade";
import { buildFolhaDiaKey } from "@/lib/operacao/data-operacional";

export const Route = createFileRoute("/gestao/visualizar/dia/$folhaKey")({
  head: () => ({ meta: [{ title: "Checklist Completo do Dia — Gestão" }] }),
  component: VisualizarDiaPage,
});

function VisualizarDiaPage() {
  const { folhaKey } = Route.useParams();
  const { usuario, loading } = useGuard("gestao");
  const { data: checklists, loading: loadingC } = useChecklistsRemote({ realtime: true });
  const { data: anomalias, loading: loadingA } = useAnomaliasRemote({ realtime: true });
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<
    "turno" | "dia" | "turno-verso" | "frente-verso-completo" | null
  >(null);

  const todasFolhas = useMemo(
    () => buildFolhasAgrupadas(checklists, anomalias),
    [checklists, anomalias],
  );
  const folha = useMemo(() => {
    let f = todasFolhas.find((x) => x.folhaKey === folhaKey);
    if (!f) {
      const parts = folhaKey.split("__");
      if (parts.length === 5) {
        const novaKey = `${parts[0]}__${parts[1]}__${parts[3]}__${parts[4]}`;
        f = todasFolhas.find((x) => x.folhaKey === novaKey);
      }
    }
    return f;
  }, [folhaKey, todasFolhas]);

  if (loading || loadingC || loadingA || !usuario) return <TelaCarregando />;

  async function handleExport(
    modo: "turno" | "dia" | "turno-verso" | "frente-verso-completo",
  ) {
    if (!folha) return;
    setExporting(modo);
    try {
      if (modo === "turno") {
        await exportarTurnoExcel(folha, anomalias);
      } else if (modo === "dia") {
        await exportarFolhaDiaExcel(folha, todasFolhas, anomalias);
      } else if (modo === "turno-verso") {
        await exportarTurnoComVersoExcel(folha, anomalias);
      } else {
        await exportarFrenteVersoCompletoExcel(folha, todasFolhas, anomalias);
      }
      toast.success("Excel exportado com sucesso");
      setExportOpen(false);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Não foi possível gerar o Excel agora. Verifique o template e tente novamente.";
      toast.error(msg);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Checklist Completo do Dia"
        subtitulo="Visão consolidada dos 3 momentos"
        voltarPara="/gestao/checklists"
      />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10">
        {!folha ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <p className="text-muted-foreground">Folha do dia não encontrada.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/gestao/checklists">Voltar para checklists</Link>
            </Button>
          </div>
        ) : (
          <>
            <ChecklistDiaDetalhe
              folha={folha}
              anomalias={anomalias}
              onExportar={() => setExportOpen(true)}
            />
            {temVerso(folha) && (
              <div className="mt-6">
                <VersoDiaDetalhe
                  folhaDiaKey={buildFolhaDiaKey(
                    folha.contexto.data,
                    folha.contexto.linha,
                    folha.contexto.maquina,
                  )}
                  dataOperacao={folha.contexto.data}
                />
              </div>
            )}
            <div className="mt-6">
              <ObservacoesVersoConsolidado
                folhaDiaKey={buildFolhaDiaKey(
                  folha.contexto.data,
                  folha.contexto.linha,
                  folha.contexto.maquina,
                )}
                titulo="Observações da folha (espelho do verso — PTP + Limpeza)"
              />
            </div>
          </>
        )}
      </main>

      <Dialog open={exportOpen} onOpenChange={(o) => !exporting && setExportOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <DialogTitle>Exportar Excel (FM09)</DialogTitle>
            <DialogDescription>
              Escolha como deseja exportar o checklist preenchido para o formulário oficial.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Button
              onClick={() => handleExport("turno")}
              disabled={!!exporting}
              className="justify-start"
            >
              {exporting === "turno" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Exportar turno ({folha?.contexto.turno ?? "-"})
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport("dia")}
              disabled={!!exporting}
              className="justify-start"
            >
              {exporting === "dia" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Exportar folha do dia (3 turnos consolidados)
            </Button>
            {folha && temVerso(folha) && (
              <>
                <div className="my-1 border-t border-border" />
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Frente + Verso (PTP + Limpeza)
                </p>
                <Button
                  variant="secondary"
                  onClick={() => handleExport("turno-verso")}
                  disabled={!!exporting}
                  className="justify-start"
                >
                  {exporting === "turno-verso" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                  )}
                  Exportar Turno ({folha.contexto.turno}) — frente + verso
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleExport("frente-verso-completo")}
                  disabled={!!exporting}
                  className="justify-start"
                >
                  {exporting === "frente-verso-completo" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                  )}
                  Exportar Frente e Verso completo (todos os turnos)
                </Button>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportOpen(false)} disabled={!!exporting}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
