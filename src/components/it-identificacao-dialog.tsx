// ============================================================
// Modal de identificação do operador antes de abrir uma IT.
// Dois modos:
//  - completo: pede nome+sobrenome (regex Unicode), botão ativa após 800ms
//  - leve: confirma identidade salva, "Sim" ativa após 1500ms (anti-tap)
// Em troca de operador: tela extra de aviso antes de assumir o device.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ShieldCheck, UserCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  REGEX_NOME_COMPLETO,
  canonizarNomeOperador,
  isIdentidadeBypass,
  type IdentidadeOperadorDevice,
} from "@/lib/it/identidade";

const DELAY_COMPLETO_MS = 800;
const DELAY_LEVE_MS = 1500;

export type ModoDialog = "completo" | "leve";

export interface ResultadoIdentificacao {
  nomeCompleto: string;
  nomeCanonico: string;
  trocaDetectada: boolean;
  modoUsado: ModoDialog;
  identidadeAnterior: IdentidadeOperadorDevice | null;
}

interface Props {
  open: boolean;
  modo: ModoDialog;
  identidadeAnterior: IdentidadeOperadorDevice | null;
  onConfirmar: (r: ResultadoIdentificacao) => void;
}

export function ItIdentificacaoDialog({
  open,
  modo,
  identidadeAnterior,
  onConfirmar,
}: Props) {
  if (modo === "leve" && identidadeAnterior) {
    return (
      <ModoLeve
        open={open}
        identidadeAnterior={identidadeAnterior}
        onConfirmar={onConfirmar}
      />
    );
  }
  return (
    <ModoCompleto
      open={open}
      identidadeAnterior={identidadeAnterior}
      onConfirmar={onConfirmar}
    />
  );
}

// ─── Modo leve: "Você é Lucas Moreira?" ────────────────────────
function ModoLeve({
  open,
  identidadeAnterior,
  onConfirmar,
}: {
  open: boolean;
  identidadeAnterior: IdentidadeOperadorDevice;
  onConfirmar: (r: ResultadoIdentificacao) => void;
}) {
  const [habilitado, setHabilitado] = useState(false);
  const [trocando, setTrocando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHabilitado(false);
    setTrocando(false);
    const t = window.setTimeout(() => setHabilitado(true), DELAY_LEVE_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  if (trocando) {
    return (
      <ModoCompleto
        open={open}
        identidadeAnterior={identidadeAnterior}
        forcarTroca
        onConfirmar={onConfirmar}
      />
    );
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <UserCircle2 className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-center text-lg">
            Confirma sua identidade?
          </DialogTitle>
          <DialogDescription className="text-center">
            Antes de abrir a instrução, confirme que você é o operador
            registrado.
          </DialogDescription>
        </DialogHeader>

        <div className="my-3 rounded-lg border border-border bg-muted/40 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Operador deste device
          </p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {identidadeAnterior.nomeCompleto}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            disabled={!habilitado}
            onClick={() =>
              onConfirmar({
                nomeCompleto: identidadeAnterior.nomeCompleto,
                nomeCanonico: identidadeAnterior.nomeCanonico,
                trocaDetectada: false,
                modoUsado: "leve",
                identidadeAnterior,
              })
            }
            className="h-12 text-base"
          >
            {habilitado ? "Sim, sou eu" : "Aguarde..."}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setTrocando(true)}
            className="h-11"
          >
            Não, sou outro operador
          </Button>
        </div>

        <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" />
          Toda confirmação é registrada com data, hora e device.
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modo completo: pede nome + sobrenome ──────────────────────
function ModoCompleto({
  open,
  identidadeAnterior,
  forcarTroca,
  onConfirmar,
}: {
  open: boolean;
  identidadeAnterior: IdentidadeOperadorDevice | null;
  forcarTroca?: boolean;
  onConfirmar: (r: ResultadoIdentificacao) => void;
}) {
  const [nome, setNome] = useState("");
  const [tocou, setTocou] = useState(false);
  const [habilitadoEm, setHabilitadoEm] = useState<number | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [confirmandoTroca, setConfirmandoTroca] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;
    setNome("");
    setTocou(false);
    setHabilitadoEm(null);
    setConfirmandoTroca(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(t);
  }, [open]);

  // Tick para reavaliar habilitação
  useEffect(() => {
    if (habilitadoEm == null) return;
    const t = window.setInterval(() => setAgora(Date.now()), 100);
    return () => window.clearInterval(t);
  }, [habilitadoEm]);

  const valido = useMemo(() => {
    const limpo = nome.trim().replace(/\s+/g, " ");
    return REGEX_NOME_COMPLETO.test(limpo);
  }, [nome]);

  // Quando vira válido, marca timestamp do delay anti-tap (800ms)
  useEffect(() => {
    if (valido && habilitadoEm == null) {
      setHabilitadoEm(Date.now());
    }
    if (!valido && habilitadoEm != null) {
      setHabilitadoEm(null);
    }
  }, [valido, habilitadoEm]);

  const podeContinuar =
    valido && habilitadoEm != null && agora - habilitadoEm >= DELAY_COMPLETO_MS;

  const erro = useMemo(() => {
    if (!tocou) return null;
    const limpo = nome.trim();
    if (!limpo) return "Digite seu nome e sobrenome";
    if (!/[\p{L}\p{M}\s'’-]+/u.test(limpo))
      return "Use apenas letras";
    if (!REGEX_NOME_COMPLETO.test(limpo.replace(/\s+/g, " ")))
      return "Digite nome e sobrenome (≥2 letras cada)";
    return null;
  }, [nome, tocou]);

  const submeter = () => {
    if (!podeContinuar) return;
    const limpo = nome.trim().replace(/\s+/g, " ");
    const canonico = canonizarNomeOperador(limpo);
    const trocaDetectada =
      !!identidadeAnterior &&
      identidadeAnterior.nomeCanonico !== canonico;

    if ((trocaDetectada || forcarTroca) && !confirmandoTroca) {
      setConfirmandoTroca(true);
      return;
    }

    onConfirmar({
      nomeCompleto: limpo,
      nomeCanonico: canonico,
      trocaDetectada: trocaDetectada || !!forcarTroca,
      modoUsado: "completo",
      identidadeAnterior,
    });
  };

  if (confirmandoTroca) {
    const limpo = nome.trim().replace(/\s+/g, " ");
    return (
      <Dialog open={open}>
        <DialogContent
          className="max-w-md [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-warning/15">
              <AlertTriangle className="h-7 w-7 text-warning-foreground" />
            </div>
            <DialogTitle className="text-center text-lg">
              Trocar de operador neste device?
            </DialogTitle>
            <DialogDescription className="text-center">
              A troca será registrada com data, hora e device.
            </DialogDescription>
          </DialogHeader>

          <div className="my-3 rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Operador anterior
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">
              {identidadeAnterior?.nomeCompleto ?? "—"}
            </p>
            <div className="my-2 border-t border-border" />
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Novo operador
            </p>
            <p className="mt-1 text-base font-semibold text-primary">{limpo}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const canonico = canonizarNomeOperador(limpo);
                onConfirmar({
                  nomeCompleto: limpo,
                  nomeCanonico: canonico,
                  trocaDetectada: true,
                  modoUsado: "completo",
                  identidadeAnterior,
                });
              }}
              className="h-12 text-base"
            >
              Sim, sou outro operador
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmandoTroca(false)}
              className="h-11"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <UserCircle2 className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-center text-lg">
            Quem está consultando?
          </DialogTitle>
          <DialogDescription className="text-center">
            Para garantir rastreabilidade, digite seu <strong>nome e
            sobrenome</strong> antes de abrir a instrução.
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 space-y-2">
          <Label htmlFor="op-nome" className="text-sm">
            Nome completo
          </Label>
          <Input
            id="op-nome"
            ref={inputRef}
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              if (!tocou) setTocou(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submeter();
              }
            }}
            autoComplete="name"
            autoCapitalize="words"
            spellCheck={false}
            placeholder="Ex: Lucas Moreira"
            className={cn(
              "h-12 text-base",
              erro && "border-destructive focus-visible:ring-destructive",
            )}
          />
          {erro && (
            <p className="text-xs font-medium text-destructive">{erro}</p>
          )}
        </div>

        <Button
          type="button"
          disabled={!podeContinuar}
          onClick={submeter}
          className="mt-2 h-12 text-base"
        >
          {!valido
            ? "Digite nome e sobrenome"
            : !podeContinuar
              ? "Aguarde..."
              : "Continuar"}
        </Button>

        <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" />
          Esta identidade fica registrada com data, hora e device.
        </p>
      </DialogContent>
    </Dialog>
  );
}
