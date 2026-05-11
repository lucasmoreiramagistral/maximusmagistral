/**
 * Picker do "Turno ativo do dia" — exibido na home do operador.
 *
 * - Permite trocar turno/equipe restrito a combinações VÁLIDAS (ESCALAS).
 * - Quando há registros do dia (PTP/limpeza preenchidos no turno corrente),
 *   pede confirmação antes de trocar (a troca leva para outra folha do dia).
 * - "Voltar ao padrão" só aparece quando há padrão no cadastro.
 */

import { useMemo, useState } from "react";
import { Pencil, RotateCcw, Sparkles } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { Equipe, Turno, Usuario } from "@/lib/checklist/types";
import { ESCALAS } from "@/lib/operacao/escalas";
import {
  clearTurnoAtivoDoDia,
  setTurnoAtivoDoDia,
  type TurnoAtivoResolved,
} from "@/lib/operacao/turno-ativo";

interface TurnoAtivoPickerProps {
  usuario: Pick<Usuario, "userId" | "turnoPadrao" | "equipePadrao">;
  ativo: TurnoAtivoResolved;
  /** Quantos registros existem no turno corrente (PTP + limpeza). */
  registrosNoTurnoAtual: number;
  /** Quando true, o picker já abre em modo edição automaticamente. */
  autoEditar?: boolean;
}

const TURNOS_UNICOS: Turno[] = Array.from(
  new Set(ESCALAS.map((e) => e.turno)),
) as Turno[];

function equipesDoTurno(turno: Turno | null): Equipe[] {
  if (!turno) return [];
  return ESCALAS.filter((e) => e.turno === turno).map((e) => e.equipe);
}

export function TurnoAtivoPicker({
  usuario,
  ativo,
  registrosNoTurnoAtual,
  autoEditar = false,
}: TurnoAtivoPickerProps) {
  const [editando, setEditando] = useState(autoEditar);
  const [turnoSel, setTurnoSel] = useState<Turno | null>(ativo.turno);
  const [equipeSel, setEquipeSel] = useState<Equipe | null>(ativo.equipe);
  const [pendente, setPendente] = useState<
    | { tipo: "trocar"; turno: Turno; equipe: Equipe }
    | { tipo: "voltar" }
    | null
  >(null);

  const equipesValidas = useMemo(() => equipesDoTurno(turnoSel), [turnoSel]);

  const aplicarTroca = (turno: Turno, equipe: Equipe) => {
    if (turno === ativo.turno && equipe === ativo.equipe) {
      setEditando(false);
      return;
    }
    if (registrosNoTurnoAtual > 0) {
      setPendente({ tipo: "trocar", turno, equipe });
      return;
    }
    setTurnoAtivoDoDia(usuario, { turno, equipe });
    setEditando(false);
  };

  const voltarPadrao = () => {
    if (registrosNoTurnoAtual > 0) {
      setPendente({ tipo: "voltar" });
      return;
    }
    clearTurnoAtivoDoDia(usuario);
    setEditando(false);
    setTurnoSel(usuario.turnoPadrao ?? null);
    setEquipeSel(usuario.equipePadrao ?? null);
  };

  const confirmarPendente = () => {
    if (!pendente) return;
    if (pendente.tipo === "trocar") {
      setTurnoAtivoDoDia(usuario, {
        turno: pendente.turno,
        equipe: pendente.equipe,
      });
    } else {
      clearTurnoAtivoDoDia(usuario);
      setTurnoSel(usuario.turnoPadrao ?? null);
      setEquipeSel(usuario.equipePadrao ?? null);
    }
    setPendente(null);
    setEditando(false);
  };

  const podeSalvar =
    !!turnoSel && !!equipeSel && equipesValidas.includes(equipeSel);

  return (
    <div
      className={`mb-5 rounded-2xl border-2 p-4 md:p-5 ${
        ativo.ehExtra
          ? "border-warning/50 bg-warning/10"
          : "border-border bg-card"
      }`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              ativo.ehExtra
                ? "bg-warning/20 text-warning-foreground"
                : "bg-primary-soft text-primary"
            }`}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Hoje você está trabalhando como
            </p>
            <p className="mt-0.5 text-base font-bold text-foreground md:text-lg">
              {ativo.turno && ativo.equipe
                ? `${ativo.turno} · ${ativo.equipe}`
                : "Defina seu turno do dia"}
              {ativo.ehExtra && (
                <span className="ml-2 inline-flex items-center rounded-full bg-warning px-2 py-0.5 text-[10px] font-bold uppercase text-warning-foreground">
                  Extra
                </span>
              )}
            </p>
            {!ativo.temPadrao && !ativo.turno && (
              <p className="mt-1 text-xs text-destructive">
                Seu cadastro não tem turno padrão. Selecione um turno para liberar PTP e limpeza.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ativo.ehExtra && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={voltarPadrao}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" /> Voltar ao padrão
            </Button>
          )}
          {!editando && (
            <Button
              type="button"
              variant={ativo.turno ? "outline" : "default"}
              size="sm"
              onClick={() => {
                setTurnoSel(ativo.turno);
                setEquipeSel(ativo.equipe);
                setEditando(true);
              }}
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              {ativo.turno ? "Alterar" : "Definir"}
            </Button>
          )}
        </div>
      </div>

      {editando && (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Turno
            </label>
            <Select
              value={turnoSel ?? ""}
              onValueChange={(v) => {
                const novoTurno = v as Turno;
                setTurnoSel(novoTurno);
                const eqs = equipesDoTurno(novoTurno);
                if (!equipeSel || !eqs.includes(equipeSel)) {
                  setEquipeSel(eqs[0] ?? null);
                }
              }}
            >
              <SelectTrigger className="h-11 text-base font-semibold">
                <SelectValue placeholder="Selecione o turno" />
              </SelectTrigger>
              <SelectContent>
                {TURNOS_UNICOS.map((t) => (
                  <SelectItem key={t} value={t} className="text-base">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Equipe
            </label>
            <Select
              value={equipeSel ?? ""}
              onValueChange={(v) => setEquipeSel(v as Equipe)}
              disabled={!turnoSel}
            >
              <SelectTrigger className="h-11 text-base font-semibold">
                <SelectValue placeholder="Selecione a equipe" />
              </SelectTrigger>
              <SelectContent>
                {equipesValidas.map((e) => (
                  <SelectItem key={e} value={e} className="text-base">
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditando(false);
                setTurnoSel(ativo.turno);
                setEquipeSel(ativo.equipe);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!podeSalvar}
              onClick={() => aplicarTroca(turnoSel!, equipeSel!)}
            >
              Aplicar
            </Button>
          </div>
        </div>
      )}

      <AlertDialog
        open={!!pendente}
        onOpenChange={(open) => {
          if (!open) setPendente(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trocar para outra folha do dia?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem {registrosNoTurnoAtual} registro(s) preenchido(s) no
              turno atual ({ativo.turno} · {ativo.equipe}). Trocar leva você
              para outra folha do dia — os registros atuais continuam salvos
              no turno em que foram lançados, mas a tela mostrará o novo
              contexto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter como está</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarPendente}>
              Sim, trocar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
