import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { ChecklistDetalhe } from "@/components/checklist-detalhe";
import { useAnomalias, useChecklists, useUsuario } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";
import {
  iniciarEdicaoChecklist,
  permissaoEdicaoChecklist,
} from "@/lib/checklist/edicao";
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

export const Route = createFileRoute("/operador/visualizar/checklist/$id")({
  head: () => ({ meta: [{ title: "Visualizar checklist" }] }),
  component: VisualizarChecklist,
});

function VisualizarChecklist() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { usuario, loading } = useGuard("operador");
  const usuarioAtual = useUsuario();
  const checklists = useChecklists();
  const anomalias = useAnomalias();

  const [confirmar, setConfirmar] = useState(false);
  const [bloqueio, setBloqueio] = useState<string | null>(null);

  const checklist = useMemo(() => checklists.find((c) => c.id === id), [checklists, id]);
  const vinculadas = useMemo(() => anomalias.filter((a) => a.checklistId === id), [anomalias, id]);

  const permissao = checklist && usuarioAtual
    ? permissaoEdicaoChecklist(checklist, usuarioAtual.usuario)
    : null;

  const onAlterar = () => {
    if (!checklist || !permissao) return;
    if (!permissao.permitido) {
      setBloqueio(permissao.mensagem ?? "Edição não permitida.");
      return;
    }
    setConfirmar(true);
  };

  const confirmarAlterar = () => {
    if (!checklist) return;
    iniciarEdicaoChecklist(checklist);
    setConfirmar(false);
    navigate({ to: "/operador/checklist" });
  };

  if (loading || !usuario) return <TelaCarregando />;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Checklist (somente leitura)"
        subtitulo={checklist?.momento}
        voltarPara="/operador/historico"
      />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10">
        {checklist ? (
          <>
            {permissao?.permitido && (
              <div className="mb-4 flex justify-end">
                <Button
                  variant="outline"
                  className="border-warning text-warning-foreground"
                  onClick={onAlterar}
                >
                  <Pencil className="mr-1.5 h-4 w-4" /> Alterar dados
                </Button>
              </div>
            )}
            {permissao && !permissao.permitido && permissao.motivo === "fora_horario" && (
              <p className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                Edição bloqueada. O horário deste turno já encerrou.
              </p>
            )}
            <ChecklistDetalhe checklist={checklist} anomaliasVinculadas={vinculadas} />
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
            Checklist não encontrado
          </p>
        )}
      </main>

      <AlertDialog open={confirmar} onOpenChange={(v) => !v && setConfirmar(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar respostas do checklist</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que quer alterar as respostas atuais do checklist já preenchido?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarAlterar}>Sim, alterar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!bloqueio} onOpenChange={(v) => !v && setBloqueio(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edição não permitida</AlertDialogTitle>
            <AlertDialogDescription>{bloqueio}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBloqueio(null)}>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
