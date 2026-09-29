import { useState } from "react";
import { toast } from "sonner";
import { PenLine } from "lucide-react";
import { SignaturePad } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import type { ProducaoHora } from "@/lib/producao/types";

interface Props {
  hora: ProducaoHora;
  operadorUserId: string | null | undefined;
  onAssinar: (assinatura: string) => Promise<void>;
}

/** O desenho é colhido uma vez na hora final, depois que a produção foi salva. */
export function AssinaturaOperadorTurno({ hora, operadorUserId, onAssinar }: Props) {
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  if (hora.horaCodigo !== "H12" && hora.horaCodigo !== "H24") return null;

  if (hora.assinaturaOperador?.dataUrl) {
    return (
      <section className="rounded-xl border border-success/40 bg-success-soft/40 p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-success">
          <PenLine className="h-4 w-4" /> Assinatura do operador concluída
        </p>
        <p className="mt-1 text-sm text-foreground">
          {hora.assinaturaOperador.nome}
          {hora.operadorAssinouEm
            ? ` · ${new Date(hora.operadorAssinouEm).toLocaleString("pt-BR", { timeZone: "America/Manaus" })}`
            : ""}
        </p>
        <img
          src={hora.assinaturaOperador.dataUrl}
          alt={`Assinatura de ${hora.assinaturaOperador.nome}`}
          className="mt-2 max-h-28 max-w-full rounded-md border border-border bg-white object-contain"
        />
      </section>
    );
  }

  if (!hora.finalizadoEm) {
    return (
      <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        A assinatura do operador fica disponível depois de salvar a última hora do turno.
      </p>
    );
  }

  if (!operadorUserId || hora.operadorUserId !== operadorUserId) {
    return (
      <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
        A assinatura está pendente para o operador que lançou a última hora.
      </p>
    );
  }

  async function confirmar() {
    if (!assinatura || salvando) {
      toast.error("Desenhe sua assinatura antes de confirmar o turno.");
      return;
    }
    setSalvando(true);
    try {
      await onAssinar(assinatura);
      toast.success("Assinatura do operador salva no Supabase.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar a assinatura.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-primary/30 bg-primary-soft/30 p-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <PenLine className="h-4 w-4 text-primary" /> Assinatura do operador no fim do turno
        </p>
        <p className="text-xs text-muted-foreground">
          Assine uma vez após conferir as horas. A produção já salva não será alterada.
        </p>
      </div>
      <SignaturePad
        label="Sua assinatura"
        ajuda="Desenhe com o dedo ou caneta. Sua identidade é conferida pelo login atual."
        value={assinatura}
        onChange={setAssinatura}
        altura={150}
      />
      <Button
        type="button"
        className="h-12 w-full"
        disabled={salvando}
        onClick={() => void confirmar()}
      >
        {salvando ? "Salvando assinatura..." : "Confirmar minha assinatura"}
      </Button>
    </section>
  );
}
