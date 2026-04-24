import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ClipboardList,
  AlertTriangle,
  Filter,
  FileBarChart2,
  Loader2,
  BookOpen,
  UserPlus,
} from "lucide-react";
import { HIERARQUIAS_ADMIN_GESTAO } from "@/lib/checklist/types";
import { AppHeader } from "@/components/app-header";
import { useChecklistsRemote, useAnomaliasRemote } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";

export const Route = createFileRoute("/gestao/")({
  head: () => ({
    meta: [
      { title: "Gestão Industrial — Checklist Operacional" },
      {
        name: "description",
        content: "Painel da Gestão Industrial para consultar checklists e anomalias.",
      },
    ],
  }),
  component: GestaoHome,
});

function GestaoHome() {
  const { usuario, loading } = useGuard("gestao");
  const { data: checklists } = useChecklistsRemote({ realtime: true });
  const { data: anomalias } = useAnomaliasRemote({ realtime: true });

  if (loading || !usuario) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader titulo="Gestão Industrial" subtitulo="Linha 3 — Enchedora 3" />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-8">
          <p className="text-sm text-muted-foreground md:text-base">Bem-vindo,</p>
          <h2 className="text-2xl font-bold text-foreground md:text-3xl">{usuario.nome}</h2>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <Card titulo="Checklists" valor={checklists.length} />
          <Card titulo="Anomalias" valor={anomalias.length} />
          <Card
            titulo="Abertas"
            valor={anomalias.filter((a) => a.status === "Aberta").length}
            destaque="destructive"
          />
          <Card
            titulo="Em andamento"
            valor={anomalias.filter((a) => a.status === "Em andamento").length}
            destaque="warning"
          />
          <Card
            titulo="Resolvidas"
            valor={anomalias.filter((a) => a.status === "Resolvida").length}
            destaque="success"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <BotaoLink
            to="/gestao/checklists"
            icon={<ClipboardList className="h-8 w-8" />}
            titulo="Checklists"
            descricao="Lista completa de checklists"
          />
          <BotaoLink
            to="/gestao/anomalias"
            icon={<AlertTriangle className="h-8 w-8" />}
            titulo="Anomalias"
            descricao="Lista completa de anomalias"
          />
          <BotaoLink
            to="/gestao/filtros"
            search={{ origem: "gestao" }}
            icon={<Filter className="h-8 w-8" />}
            titulo="Filtros"
            descricao="Filtrar por data, turno, equipe"
          />
          <BotaoLink
            to="/gestao/relatorio"
            icon={<FileBarChart2 className="h-8 w-8" />}
            titulo="Gerar Relatório"
            descricao="Consolidar checklist, anomalias, tratativas e recorrências da Linha 3"
          />
          <BotaoLink
            to="/gestao/it-analytics"
            icon={<BookOpen className="h-8 w-8" />}
            titulo="Inteligência das ITs"
            descricao="Uso das instruções · pontos para reforço de treinamento"
          />
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Dados em tempo real do banco. Atualizações da operação aparecem automaticamente em todos
          os dispositivos.
        </p>
      </main>
    </div>
  );
}

function Card({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: number;
  destaque?: "destructive" | "warning" | "success";
}) {
  const cls =
    destaque === "destructive"
      ? "text-destructive"
      : destaque === "warning"
        ? "text-warning-foreground"
        : destaque === "success"
          ? "text-success"
          : "text-primary";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground md:text-sm">
        {titulo}
      </p>
      <p className={`mt-1 text-3xl font-bold md:text-4xl ${cls}`}>{valor}</p>
    </div>
  );
}

function BotaoLink({
  to,
  search,
  icon,
  titulo,
  descricao,
}: {
  to: string;
  search?: Record<string, string>;
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
}) {
  return (
    <Link
      to={to}
      search={search}
      className="group flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-6 text-foreground shadow-sm transition-all hover:border-primary/50 hover:shadow-md md:p-7"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-soft text-primary">
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold">{titulo}</p>
        <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>
      </div>
    </Link>
  );
}
