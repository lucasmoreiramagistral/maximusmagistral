import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ClipboardCheck, AlertTriangle, History, Play, Layers } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { TelaCarregando } from "@/components/tela-carregando";
import { useRascunho } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { storage } from "@/lib/checklist/storage";
import { formatarDataHora } from "@/lib/checklist/format";

export const Route = createFileRoute("/operador/")({
  head: () => ({
    meta: [
      { title: "Operador — Checklist Operacional" },
      {
        name: "description",
        content: "Tela inicial do operador da Linha 3 — Enchedora 3.",
      },
    ],
  }),
  component: OperadorHome,
});

function OperadorHome() {
  const { usuario, loading } = useGuard("operador");
  const rascunho = useRascunho();
  const navigate = useNavigate();

  if (loading || !usuario) return <TelaCarregando />;

  const irParaAnomaliaManual = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("fm-checklist:anomalia-origem");
    }
    navigate({ to: "/operador/anomalia/nova" });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader titulo="Checklist Operacional" subtitulo="Linha 3 — Enchedora 3" />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-8">
          <p className="text-sm text-muted-foreground md:text-base">Bem-vindo,</p>
          <h2 className="text-2xl font-bold text-foreground md:text-3xl">{usuario.nome}</h2>
        </div>

        {rascunho && (
          <div className="mb-6 rounded-xl border-2 border-warning/40 bg-warning/10 p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-base font-bold text-foreground">
                  Você tem um checklist em andamento
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {rascunho.momento} · iniciado em {formatarDataHora(rascunho.criadoEm)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    storage.clearRascunho();
                  }}
                >
                  Novo checklist
                </Button>
                <Button asChild>
                  <Link to="/operador/checklist">Continuar</Link>
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <BotaoAcao
            to="/operador/contexto"
            icon={<Play className="h-8 w-8" />}
            titulo="Novo checklist"
            descricao="Iniciar um novo checklist operacional"
            destaque
          />
          <BotaoAcao
            onClick={irParaAnomaliaManual}
            icon={<AlertTriangle className="h-8 w-8" />}
            titulo="Registrar anomalia"
            descricao="Registrar manualmente uma anomalia"
          />
          <BotaoAcao
            to="/operador/verso"
            icon={<Layers className="h-8 w-8" />}
            titulo="Verso da folha"
            descricao="PTP e limpeza da sala de envase"
          />
          <BotaoAcao
            to="/operador/historico"
            icon={<History className="h-8 w-8" />}
            titulo="Histórico local"
            descricao="Ver checklists e anomalias salvos"
          />
        </div>

        <div className="mt-8 rounded-xl border border-border bg-muted/40 p-4 md:p-5">
          <div className="flex items-start gap-3">
            <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">Equipamento</p>
              <p className="text-sm text-muted-foreground">
                Linha 3 · Envase · Enchedora Zegla 50V
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function BotaoAcao({
  to,
  onClick,
  icon,
  titulo,
  descricao,
  destaque,
}: {
  to?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
  destaque?: boolean;
}) {
  const className = destaque
    ? "group flex flex-col gap-3 rounded-2xl border-2 border-primary bg-primary p-6 text-left text-primary-foreground shadow-sm transition-all hover:shadow-md md:p-7"
    : "group flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-6 text-left text-foreground shadow-sm transition-all hover:border-primary/50 hover:shadow-md md:p-7";

  const inner = (
    <>
      <div
        className={
          destaque
            ? "flex h-14 w-14 items-center justify-center rounded-xl bg-primary-foreground/15"
            : "flex h-14 w-14 items-center justify-center rounded-xl bg-primary-soft text-primary"
        }
      >
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold">{titulo}</p>
        <p
          className={
            destaque
              ? "mt-1 text-sm text-primary-foreground/80"
              : "mt-1 text-sm text-muted-foreground"
          }
        >
          {descricao}
        </p>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }
  return (
    <Link to={to!} className={className}>
      {inner}
    </Link>
  );
}
