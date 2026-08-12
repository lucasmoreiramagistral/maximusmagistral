/**
 * Janela de autenticação do líder dentro do tablet do operador.
 *
 * Substitui o campo "nome do líder" digitado à mão. O líder informa o próprio
 * usuário e senha; a sessão do operador não é tocada (ver client-validacao.ts)
 * e o nome gravado passa a vir do banco.
 *
 * Ninguém além do líder digita a senha dele — a janela existe justamente para
 * que ele não precise emprestá-la a ninguém para o turno fechar.
 */

import { useState } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  autenticarLider,
  MOTIVOS_CONTINGENCIA,
  type IdentidadeLider,
} from "@/lib/farol/autenticar-lider";
import type { ResultadoFinalizacao } from "@/lib/farol/validacao-storage";

type ResultadoLoginDialog =
  | { ok: true; lider: IdentidadeLider; resultado?: ResultadoFinalizacao }
  | { ok: false; erro: string };
type ResultadoContingenciaDialog =
  | { ok: true; resultado?: ResultadoFinalizacao }
  | { ok: false; erro: string };

export function AutenticarLiderDialog({
  aberto,
  onFechar,
  onAutenticado,
  onContingencia,
  processarLogin,
  processarContingencia,
}: {
  aberto: boolean;
  onFechar: () => void;
  onAutenticado: (lider: IdentidadeLider, resultado?: ResultadoFinalizacao) => void;
  /**
   * Fechamento em contingência: o líder não pôde entrar. Recebe o nome
   * informado de quem autorizou — que NÃO é identidade verificada, e a tela
   * de quem chama precisa deixar isso claro.
   */
  onContingencia?: (autorizou: string, motivo: string, resultado?: ResultadoFinalizacao) => void;
  /** Quando informado, autenticação e confirmação final acontecem juntas. */
  processarLogin?: (login: string, senha: string) => Promise<ResultadoLoginDialog>;
  /** Quando informado, a contingência também só conclui após o commit da RPC. */
  processarContingencia?: (
    autorizou: string,
    motivo: string,
  ) => Promise<ResultadoContingenciaDialog>;
}) {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  // Contingência. Só aparece quando alguém pede — a porta principal continua
  // sendo o login do líder, e uma saída fácil demais vira a saída padrão.
  const [modoContingencia, setModoContingencia] = useState(false);
  const [autorizou, setAutorizou] = useState("");
  const [motivo, setMotivo] = useState<string>("");

  if (!aberto) return null;

  const limpar = () => {
    setLogin("");
    setSenha("");
    setErro("");
    setModoContingencia(false);
    setAutorizou("");
    setMotivo("");
  };

  const confirmarContingencia = async () => {
    setErro("");
    if (!autorizou.trim()) {
      setErro("Informe quem autorizou o fechamento.");
      return;
    }
    if (!motivo.trim()) {
      setErro("Informe por que o líder não pôde validar.");
      return;
    }
    const nome = autorizou.trim();
    const mot = motivo.trim();
    if (processarContingencia) {
      setEntrando(true);
      const r = await processarContingencia(nome, mot);
      setEntrando(false);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      limpar();
      onContingencia?.(nome, mot, r.resultado);
      return;
    }
    limpar();
    onContingencia?.(nome, mot);
  };

  const confirmar = async () => {
    setEntrando(true);
    setErro("");

    const r: ResultadoLoginDialog = processarLogin
      ? await processarLogin(login, senha)
      : await autenticarLider(login, senha);
    setEntrando(false);
    setSenha("");
    if (!r.ok) {
      setErro(r.erro);
      return;
    }

    limpar();
    onAutenticado(r.lider, r.resultado);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-validacao-lider"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div className="flex-1">
            <h2 id="titulo-validacao-lider" className="text-lg font-bold text-foreground">
              Validação do líder
            </h2>
            <p className="text-sm text-muted-foreground">
              O líder entra com o próprio usuário. O turno do operador continua aberto.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              limpar();
              onFechar();
            }}
            aria-label="Fechar"
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {modoContingencia ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-warning/50 bg-warning/15 px-3 py-2 text-xs font-semibold text-warning-foreground">
              Isto <b>não é</b> a assinatura do líder. Fica registrado que <b>você</b> fechou o
              turno e quem autorizou — e a supervisão vê essa lista.
            </div>
            <div>
              <Label htmlFor="cont-autorizou">Quem autorizou o fechamento? *</Label>
              <Input
                id="cont-autorizou"
                value={autorizou}
                onChange={(e) => setAutorizou(e.target.value)}
                placeholder="Nome do líder ou supervisor"
              />
            </div>
            <div>
              <Label htmlFor="cont-motivo">Por que o líder não pôde validar? *</Label>
              <select
                id="cont-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Selecione…</option>
                {MOTIVOS_CONTINGENCIA.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            {erro && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive"
              >
                {erro}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="lider-login">Usuário do líder</Label>
              <Input
                id="lider-login"
                value={login}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="ex.: bruno.barbosa"
              />
            </div>
            <div>
              <Label htmlFor="lider-senha">Senha</Label>
              <Input
                id="lider-senha"
                type="password"
                value={senha}
                autoComplete="off"
                onChange={(e) => setSenha(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !entrando) void confirmar();
                }}
              />
            </div>

            {erro && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive"
              >
                {erro}
              </p>
            )}

            {/* Discreto de propósito: a porta principal é o login do líder.
                Saída fácil demais vira a saída padrão, e aí a autenticação
                não serviu para nada. */}
            {onContingencia && (
              <button
                type="button"
                onClick={() => {
                  setErro("");
                  setModoContingencia(true);
                }}
                className="text-xs font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                O líder não consegue entrar agora?
              </button>
            )}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => {
              if (modoContingencia) {
                setModoContingencia(false);
                setErro("");
                return;
              }
              limpar();
              onFechar();
            }}
          >
            {modoContingencia ? "Voltar" : "Cancelar"}
          </Button>
          {modoContingencia ? (
            <Button
              type="button"
              className="flex-1 bg-warning text-warning-foreground hover:brightness-110"
              disabled={entrando || !autorizou.trim() || !motivo}
              onClick={() => void confirmarContingencia()}
            >
              {entrando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar contingência"}
            </Button>
          ) : (
            <Button
              type="button"
              className="flex-1"
              disabled={entrando || !login.trim() || !senha}
              onClick={() => void confirmar()}
            >
              {entrando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : processarLogin ? (
                "Entrar e confirmar"
              ) : (
                "Entrar e validar"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
