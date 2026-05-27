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
  exportarVersoApenasExcel,
} from "@/lib/checklist/excel-export";
import { ObservacoesVersoConsolidado } from "@/components/observacoes-verso-consolidado";
import { VersoDiaDetalhe } from "@/components/verso-dia-detalhe";
import { temVerso } from "@/lib/verso/aplicabilidade";
import { buildFolhaDiaKey } from "@/lib/operacao/data-operacional";

export const Route = createFileRoute("/gestao/visualizar/dia/$folhaKey")({
  head: () => ({ meta: [{ title: "Checklist Completo do Turno — Gestão" }] }),
  component: VisualizarDiaPage,
});

function VisualizarDiaPage() {
  const { folhaKey } = Route.useParams();
  const { usuario, loading } = useGuard("gestao");
  const { data: checklists, loading: loadingC } = useChecklistsRemote({ realtime: true });
  const { data: anomalias, loading: loadingA } = useAnomaliasRemote({ realtime: true });
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<
    "frente" | "verso" | "frente-verso" | null
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

  async function handleExport(modo: "frente" | "verso" | "frente-verso") {
    if (!folha) return;
    setExporting(modo);
    try {
      if (modo === "frente") {
        await exportarFolhaDiaExcel(folha, todasFolhas, anomalias);
      } else if (modo === "verso") {
        await exportarVersoApenasExcel(folha);
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
        titulo="Checklist Completo do Turno"
        subtitulo="Visão consolidada do turno"
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
                  turno={folha.contexto.turno}
                  equipe={folha.contexto.equipe}
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
              onClick={() => handleExport("frente")}
              disabled={!!exporting}
              className="justify-start"
            >
              {exporting === "frente" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Exportar Checklist (Frente)
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport("verso")}
              disabled={!!exporting}
              className="justify-start"
            >
              {exporting === "verso" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Exportar Verso (PTP + Limpeza)
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleExport("frente-verso")}
              disabled={!!exporting}
              className="justify-start"
            >
              {exporting === "frente-verso" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Exportar Frente + Verso (mesmo arquivo)
            </Button>
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
