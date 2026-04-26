import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { RegistroNcNr } from "@/lib/checklist/nao-conformidades";
import { marcarResolvida } from "@/lib/nao-conformidades/resolucoes";
import type { Usuario } from "@/lib/checklist/types";
import { toast } from "sonner";

interface Props {
  registro: RegistroNcNr | null;
  usuario: Usuario;
  onClose: () => void;
  onSaved: () => void;
}

/** Converte Date local → "YYYY-MM-DDTHH:mm" para input datetime-local. */
function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NcResolverDialog({ registro, usuario, onClose, onSaved }: Props) {
  const open = registro !== null;
  const [oQueFoiFeito, setOQueFoiFeito] = useState("");
  const [quando, setQuando] = useState(nowLocalInput());
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setOQueFoiFeito("");
      setQuando(nowLocalInput());
    }
  }, [open]);

  const salvar = async () => {
    if (!registro) return;
    const texto = oQueFoiFeito.trim();
    if (texto.length < 3) {
      toast.error("Descreva o que foi feito.");
      return;
    }
    setSalvando(true);
    try {
      await marcarResolvida({
        registro: { ...registro, origemId: registro.origemId },
        oQueFoiFeito: texto,
        resolvidoEm: new Date(quando).toISOString(),
        resolvidoPor: {
          userId: usuario.userId ?? null,
          login: usuario.usuario,
          nome: usuario.nome,
        },
      });
      toast.success("Marcada como resolvida.");
      onSaved();
      onClose();
    } catch {
      toast.error("Não foi possível marcar como resolvida.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como resolvida</DialogTitle>
          <DialogDescription>
            {registro && (
              <>
                #{registro.itemNumero} — {registro.itemDescricao}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="o-que-foi-feito">O que foi feito *</Label>
            <Textarea
              id="o-que-foi-feito"
              value={oQueFoiFeito}
              onChange={(e) => setOQueFoiFeito(e.target.value)}
              placeholder="Ex.: Lubrificou o eixo, ajustou parafuso, trocou peça..."
              rows={4}
              disabled={salvando}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="quando">Quando foi resolvido *</Label>
            <Input
              id="quando"
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
              disabled={salvando}
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…
              </>
            ) : (
              "Marcar resolvida"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
