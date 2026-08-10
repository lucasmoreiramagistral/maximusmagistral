import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUsuario } from "@/hooks/use-storage";
import { PERFIL_INFO, ROTA_INICIAL, ehPerfilAtivo, type PerfilAtivo, type Usuario } from "@/lib/checklist/types";
import { areasDisponiveis, getAreaAtiva, setAreaAtiva } from "@/lib/checklist/areas";
import { useConnectionStatus } from "@/hooks/use-connection-status";
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
import { STORAGE_NOME_PREFIX, nomeStorageKey } from "@/routes/operador.contexto";

const FILA_OFFLINE_KEY = "fm-checklist:fila-offline";


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
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);


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

  const executarSaida = async (descartarFila: boolean) => {
    // Limpa TUDO que é específico do operador/usuário anterior para evitar
    // que o próximo login (em outro usuário) veja rascunhos/checklists/anomalias
    // de quem usou o dispositivo antes.
    if (typeof window !== "undefined") {
      const keysRemover: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k) continue;
        // 🛡️ NUNCA apagar a fila offline a menos que o usuário confirmou perder.
        if (k === FILA_OFFLINE_KEY && !descartarFila) continue;
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

  const sair = () => {
    // Bloqueia o logout se houver dados não enviados — protege contra
    // destruição silenciosa da fila offline.
    if (pendingCount > 0) {
      setConfirmandoSaida(true);
      return;
    }
    void executarSaida(false);
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
            {(() => {
              const ehOperador = usuario.perfil === "operador";
              // Operador: badge clicável aparece SEMPRE que houver fila pendente
              // (online: amarelo "N pendentes"; offline: vermelho "Sem conexão · N pend.").
              // Sem fila e offline: mantém badge discreto vermelho.
              // Gestão: comportamento completo (status + contador).
              const mostrarOperadorPendente = ehOperador && pendingCount > 0;
              const mostrarOperadorOffline =
                ehOperador && !isOnline && pendingCount === 0;
              const mostrarStatusGestao = !ehOperador;

              if (
                !mostrarOperadorPendente &&
                !mostrarOperadorOffline &&
                !mostrarStatusGestao
              )
                return null;

              if (ehOperador) {
                const offlineComPendentes = !isOnline && pendingCount > 0;
                const cls = offlineComPendentes
                  ? "bg-destructive/10 text-destructive border border-destructive/40"
                  : !isOnline
                    ? "bg-destructive/10 text-destructive border border-destructive/40"
                    : "bg-warning/20 text-warning-foreground border border-warning/40";
                const label = !isOnline
                  ? pendingCount > 0
                    ? `Sem conexão · ${pendingCount} pend.`
                    : "Sem conexão"
                  : sincronizando
                    ? `Enviando ${pendingCount}...`
                    : `${pendingCount} pendente${pendingCount > 1 ? "s" : ""}`;
                const conteudo = (
                  <span
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${cls}`}
                  >
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        !isOnline ? "bg-destructive" : "bg-warning"
                      }`}
                    />
                    <span className="text-xs font-semibold">{label}</span>
                  </span>
                );
                return (
                  <div title={isOnline ? "Pendências" : "Offline"} aria-live="polite">
                    {pendingCount > 0 ? (
                      <Link
                        to="/operador/fila-pendente"
                        className="cursor-pointer"
                      >
                        {conteudo}
                      </Link>
                    ) : (
                      conteudo
                    )}
                  </div>
                );
              }

              return (
                <div
                  title={isOnline ? "Online" : "Offline"}
                  aria-live="polite"
                >
                  <>
                    {/* Gestão Mobile: bolinha + texto curto + pendências compactas */}
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
                    {/* Gestão Desktop: bolinha + texto completo */}
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
                  </>
                </div>
              );
            })()}

            <SeletorArea usuario={usuario} />

            <div className="text-right">
              <p className="text-sm font-medium text-foreground">{nomeExibido}</p>
              <p className="text-xs text-muted-foreground">
                {ehPerfilAtivo(usuario.perfil)
                  ? PERFIL_INFO[usuario.perfil].titulo
                  : usuario.perfil}
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

      <AlertDialog open={confirmandoSaida} onOpenChange={setConfirmandoSaida}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem {pendingCount} registro{pendingCount > 1 ? "s" : ""} não enviado{pendingCount > 1 ? "s" : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              Se sair agora, esses dados serão <strong>perdidos permanentemente</strong>. Recomendamos
              conferir a fila pendente e tentar enviar antes de sair.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmandoSaida(false);
                navigate({ to: "/operador/fila-pendente" });
              }}
            >
              Ver fila pendente
            </Button>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmandoSaida(false);
                void executarSaida(true);
              }}
            >
              Sair e perder dados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}


/**
 * Troca de área sem deslogar — só aparece para quem tem mais de um módulo.
 *
 * O acesso é por `modulos_acesso`, que já existia no banco mas o login
 * ignorava. Quem tem um módulo só nem vê este seletor.
 */
function SeletorArea({ usuario }: { usuario: Usuario }) {
  const navigate = useNavigate();
  const areas = areasDisponiveis(usuario);
  if (areas.length < 2) return null;

  const atual = getAreaAtiva(usuario);

  const trocar = (area: PerfilAtivo) => {
    setAreaAtiva(area);
    navigate({ to: ROTA_INICIAL[area] });
  };

  return (
    <div
      className="hidden items-center gap-1 rounded-lg border border-border bg-card p-1 lg:flex"
      role="group"
      aria-label="Trocar de área"
    >
      {areas.map((area) => (
        <button
          key={area}
          type="button"
          onClick={() => trocar(area)}
          aria-current={area === atual ? "page" : undefined}
          className={
            area === atual
              ? "rounded-md bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground"
              : "rounded-md px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-accent"
          }
        >
          {PERFIL_INFO[area].titulo.split(" ")[0]}
        </button>
      ))}
    </div>
  );
}
