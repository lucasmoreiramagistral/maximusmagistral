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
import { autenticarLider, type IdentidadeLider } from "@/lib/farol/autenticar-lider";

export function AutenticarLiderDialog({
  aberto,
  onFechar,
  onAutenticado,
}: {
  aberto: boolean;
  onFechar: () => void;
  onAutenticado: (lider: IdentidadeLider) => void;
}) {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  if (!aberto) return null;

  const limpar = () => {
    setLogin("");
    setSenha("");
    setErro("");
  };

  const confirmar = async () => {
    setEntrando(true);
    setErro("");
    const r = await autenticarLider(login, senha);
    setEntrando(false);
    // A senha sai da memória do componente aconteça o que acontecer.
    setSenha("");
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    limpar();
    onAutenticado(r.lider);
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
        </div>

        <div className="mt-5 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => {
              limpar();
              onFechar();
            }}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={entrando || !login.trim() || !senha}
            onClick={() => void confirmar()}
          >
            {entrando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar e validar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
