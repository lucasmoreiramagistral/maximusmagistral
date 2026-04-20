import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChecklistDetalhe } from "@/components/checklist-detalhe";
import {
  ChecklistAuditoriaResumo,
  ChecklistHistoricoEdicoes,
} from "@/components/checklist-auditoria";
import { useAnomaliasRemote, useChecklistsRemote } from "@/hooks/use-storage";
import { useEdicoesChecklist } from "@/hooks/use-edicoes-checklist";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";
import { buildFolhasAgrupadas } from "@/lib/checklist/supabase-storage";
import { exportarFolhaDiaExcel, exportarTurnoExcel } from "@/lib/checklist/excel-export";

export const Route = createFileRoute("/gestao/visualizar/checklist/$id")({
  head: () => ({ meta: [{ title: "Checklist — Gestão Industrial" }] }),
  component: VisualizarChecklistGestao,
});

function VisualizarChecklistGestao() {
  const { id } = Route.useParams();
  const { usuario, loading } = useGuard("gestao");
  const { data: checklists } = useChecklistsRemote({ realtime: true });
  const { data: anomalias } = useAnomaliasRemote({ realtime: true });
  const { data: edicoes } = useEdicoesChecklist(id);
  const [excelOpen, setExcelOpen] = useState(false);
  const [exporting, setExporting] = useState<"turno" | "dia" | null>(null);

  const checklist = useMemo(() => checklists.find((c) => c.id === id), [checklists, id]);
  const vinculadas = useMemo(() => anomalias.filter((a) => a.checklistId === id), [anomalias, id]);
  const todasFolhas = useMemo(
    () => buildFolhasAgrupadas(checklists, anomalias),
    [checklists, anomalias],
  );
  const folhaDoChecklist = useMemo(() => {
    if (!checklist) return undefined;
    return todasFolhas.find((f) =>
      f.momentos.some((m) => m.verificacoes.some((v) => v.id === checklist.id)),
    );
  }, [todasFolhas, checklist]);

  if (loading || !usuario) return <TelaCarregando />;

  async function handleExport(modo: "turno" | "dia") {
    if (!folhaDoChecklist) {
      toast.error("Folha do checklist não encontrada para exportação.");
      return;
    }
    setExporting(modo);
    try {
      if (modo === "turno") {
        await exportarTurnoExcel(folhaDoChecklist, anomalias);
      } else {
        await exportarFolhaDiaExcel(folhaDoChecklist, todasFolhas, anomalias);
      }
      toast.success("Excel exportado com sucesso");
      setExcelOpen(false);
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
        titulo="Checklist completo"
        subtitulo={checklist?.momento}
        voltarPara="/gestao/checklists"
      />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10">
        {checklist ? (
          <div className="space-y-5">
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setExcelOpen(true)}>
                <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                Exportar Excel
              </Button>
            </div>
            <ChecklistAuditoriaResumo checklist={checklist} edicoes={edicoes} />
            <ChecklistDetalhe checklist={checklist} anomaliasVinculadas={vinculadas} />
            <ChecklistHistoricoEdicoes edicoes={edicoes} />
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
            Checklist não encontrado
          </p>
        )}
      </main>

      <Dialog open={excelOpen} onOpenChange={(o) => !exporting && setExcelOpen(o)}>
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
              disabled={!!exporting || !folhaDoChecklist}
              className="justify-start"
            >
              {exporting === "turno" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Exportar turno ({folhaDoChecklist?.contexto.turno ?? checklist?.contexto.turno ?? "-"})
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport("dia")}
              disabled={!!exporting || !folhaDoChecklist}
              className="justify-start"
            >
              {exporting === "dia" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Exportar folha do dia (3 turnos consolidados)
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcelOpen(false)} disabled={!!exporting}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
