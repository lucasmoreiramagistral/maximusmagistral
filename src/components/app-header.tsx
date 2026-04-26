import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUsuario } from "@/hooks/use-storage";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { Button } from "@/components/ui/button";
import { STORAGE_NOME_PREFIX, nomeStorageKey } from "@/routes/operador.contexto";

interface AppHeaderProps {
  titulo: string;
  subtitulo?: string;
  voltarPara?: string;
  voltarLabel?: string;
}

function primeiroNome(nome: string): string {
  const limpo = nome.trim();
  if (!limpo) return "";
  return limpo.split(/\s+/)[0];
}

export function AppHeader({ titulo, subtitulo, voltarPara, voltarLabel }: AppHeaderProps) {
  const usuario = useUsuario();
  const navigate = useNavigate();
  const { isOnline, pendingCount, sincronizando } = useConnectionStatus();
  const [nomeOperadorSalvo, setNomeOperadorSalvo] = useState<string>("");

  // Lê o nome do operador salvo no localStorage (por userId) e mantém sincronizado.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = nomeStorageKey(usuario?.userId);
    if (!key) {
      setNomeOperadorSalvo("");
      return;
    }
    const ler = () => {
      const v = window.localStorage.getItem(key);
      setNomeOperadorSalvo(v ?? "");
    };
    ler();
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      if (!detail || detail.key === key) ler();
    };
    const sh = (e: StorageEvent) => {
      if (e.key === key) ler();
    };
    window.addEventListener("fm-storage-update", handler);
    window.addEventListener("storage", sh);
    return () => {
      window.removeEventListener("fm-storage-update", handler);
      window.removeEventListener("storage", sh);
    };
  }, [usuario?.userId]);

  const sair = async () => {
    // Limpa TUDO que é específico do operador/usuário anterior para evitar
    // que o próximo login (em outro usuário) veja rascunhos/checklists/anomalias
    // de quem usou o dispositivo antes.
    if (typeof window !== "undefined") {
      const keysRemover: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k) continue;
        // Nomes de operador digitados (prefixo fm-checklist:nome-operador:*)
        if (k.startsWith(STORAGE_NOME_PREFIX)) keysRemover.push(k);
        // Dados do checklist/anomalias atrelados ao usuário anterior
        if (k.startsWith("fm-checklist:")) keysRemover.push(k);
      }
      keysRemover.forEach((k) => window.localStorage.removeItem(k));
    }
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  // Para operador: mostrar SOMENTE o primeiro nome digitado em "Operador responsável".
  // Se ainda não digitou, deixa vazio (só aparece "Operador" abaixo).
  const nomeExibido =
    usuario?.perfil === "operador"
      ? nomeOperadorSalvo
        ? primeiroNome(nomeOperadorSalvo)
        : ""
      : usuario?.nome ?? "";

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6 md:py-4">
        <div className="flex items-center gap-3">
          {voltarPara && (
            <Button asChild variant="outline" size="sm">
              <Link to={voltarPara}>← {voltarLabel ?? "Voltar"}</Link>
            </Button>
          )}
          <div>
            <h1 className="text-xl font-bold leading-tight text-foreground md:text-2xl">
              {titulo}
            </h1>
            {subtitulo && <p className="text-sm text-muted-foreground md:text-base">{subtitulo}</p>}
          </div>
        </div>
        {usuario && (
          <div className="flex items-center gap-3">
            <div
              title={isOnline ? "Online" : "Offline"}
              aria-live="polite"
            >
              {/* Mobile: bolinha + texto curto + pendências compactas */}
              <span className="flex items-center gap-1 md:hidden">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    isOnline ? "bg-success" : "bg-destructive"
                  }`}
                />
                <span
                  className={`text-xs font-semibold ${
                    isOnline ? "text-success" : "text-destructive"
                  }`}
                >
                  {isOnline ? "On" : "Off"}
                </span>
                {pendingCount > 0 && (
                  <span className="text-xs font-medium text-muted-foreground">
                    {sincronizando ? `↑${pendingCount}` : `${pendingCount} pend.`}
                  </span>
                )}
              </span>
              {/* Desktop: bolinha + texto completo */}
              <span className="hidden items-center gap-1.5 md:flex">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    isOnline ? "bg-success" : "bg-destructive"
                  }`}
                />
                <span
                  className={`text-xs font-semibold ${
                    isOnline ? "text-success" : "text-destructive"
                  }`}
                >
                  {isOnline ? "Online" : "Offline"}
                </span>
                {pendingCount > 0 && (
                  <span className="text-xs font-medium text-muted-foreground">
                    {sincronizando
                      ? `Enviando ${pendingCount}...`
                      : `${pendingCount} pend.`}
                  </span>
                )}
              </span>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-foreground">{nomeExibido}</p>
              <p className="text-xs text-muted-foreground">
                {usuario.perfil === "operador" ? "Operador" : "Gestão Industrial"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="min-h-[40px] min-w-[40px]"
              onClick={sair}
            >
              <LogOut className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
