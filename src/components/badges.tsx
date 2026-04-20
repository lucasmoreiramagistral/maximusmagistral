import type { Resposta, StatusAnomalia, CriticidadeAnomalia } from "@/lib/checklist/types";
import { cn } from "@/lib/utils";

export function RespostaBadge({ resposta }: { resposta: Resposta | null }) {
  if (!resposta) {
    return (
      <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        Sem resposta
      </span>
    );
  }
  const map: Record<Resposta, string> = {
    Conforme: "bg-success-soft text-success border-success/30",
    "Não conforme": "bg-destructive-soft text-destructive border-destructive/30",
    "Não aplicável": "bg-na-soft text-na border-na/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold",
        map[resposta],
      )}
    >
      {resposta}
    </span>
  );
}

export function StatusAnomaliaBadge({ status }: { status: StatusAnomalia }) {
  const map: Record<StatusAnomalia, string> = {
    Aberta: "bg-destructive-soft text-destructive border-destructive/30",
    "Em andamento": "bg-warning/15 text-warning-foreground border-warning/40",
    Resolvida: "bg-success-soft text-success border-success/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold",
        map[status],
      )}
    >
      {status}
    </span>
  );
}

export function CriticidadeBadge({ criticidade }: { criticidade: CriticidadeAnomalia }) {
  const map: Record<CriticidadeAnomalia, string> = {
    Baixa: "bg-muted text-muted-foreground border-border",
    Média: "bg-primary-soft text-primary border-primary/30",
    Alta: "bg-warning/15 text-warning-foreground border-warning/40",
    Crítica: "bg-destructive-soft text-destructive border-destructive/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold",
        map[criticidade],
      )}
    >
      {criticidade}
    </span>
  );
}
