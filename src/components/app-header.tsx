import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUsuario } from "@/hooks/use-storage";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { Button } from "@/components/ui/button";

interface AppHeaderProps {
  titulo: string;
  subtitulo?: string;
  voltarPara?: string;
  voltarLabel?: string;
}

export function AppHeader({ titulo, subtitulo, voltarPara, voltarLabel }: AppHeaderProps) {
  const usuario = useUsuario();
  const navigate = useNavigate();
  const { isOnline, pendingCount, sincronizando } = useConnectionStatus();

  const sair = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

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
              <p className="text-sm font-medium text-foreground">{usuario.nome}</p>
              <p className="text-xs text-muted-foreground">
                {usuario.perfil === "operador"
                  ? "Operador"
                  : usuario.perfil === "manutencao"
                    ? "Manutenção"
                    : "Gestão Industrial"}
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
