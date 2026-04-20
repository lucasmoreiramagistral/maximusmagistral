import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Wrench, PlusCircle, Flame } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { useAnomaliasRemote } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";

export const Route = createFileRoute("/manutencao/")({
  head: () => ({
    meta: [
      { title: "Manutenção — Checklist Operacional" },
      { name: "description", content: "Painel da Manutenção para tratar anomalias." },
    ],
  }),
  component: ManutencaoHome,
});

function ManutencaoHome() {
  const { usuario, loading } = useGuard("manutencao");
  const { data: anomalias } = useAnomaliasRemote({ realtime: true });

  if (loading || !usuario) return <TelaCarregando />;

  const abertas = anomalias.filter((a) => a.status === "Aberta").length;
  const emAndamento = anomalias.filter((a) => a.status === "Em andamento").length;
  const criticasAbertas = anomalias.filter(
    (a) => a.status === "Aberta" && a.criticidade === "Crítica",
  ).length;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader titulo="Manutenção" subtitulo="Linha 3 — Enchedora 3" />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-8">
          <p className="text-sm text-muted-foreground md:text-base">Bem-vindo,</p>
          <h2 className="text-2xl font-bold text-foreground md:text-3xl">{usuario.nome}</h2>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card titulo="Abertas" valor={abertas} destaque="destructive" />
          <Card titulo="Em andamento" valor={emAndamento} destaque="warning" />
          <Card
            titulo="Críticas abertas"
            valor={criticasAbertas}
            destaque="destructive"
            icone={<Flame className="h-5 w-5" />}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <BotaoLink
            to="/manutencao/anomalias"
            icon={<AlertTriangle className="h-8 w-8" />}
            titulo="Ver anomalias"
            descricao="Lista completa para tratar"
          />
          <BotaoLink
            to="/manutencao/anomalia/nova"
            icon={<PlusCircle className="h-8 w-8" />}
            titulo="Registrar anomalia"
            descricao="Abrir anomalia manualmente"
          />
        </div>

        <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Wrench className="h-4 w-4" /> Dados em tempo real. Novas anomalias e mudanças de
          status aparecem automaticamente.
        </p>
      </main>
    </div>
  );
}

function Card({
  titulo,
  valor,
  destaque,
  icone,
}: {
  titulo: string;
  valor: number;
  destaque?: "destructive" | "warning" | "success";
  icone?: React.ReactNode;
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
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground md:text-sm">
          {titulo}
        </p>
        {icone && <span className={cls}>{icone}</span>}
      </div>
      <p className={`mt-1 text-3xl font-bold md:text-4xl ${cls}`}>{valor}</p>
    </div>
  );
}

function BotaoLink({
  to,
  icon,
  titulo,
  descricao,
}: {
  to: string;
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
}) {
  return (
    <Link
      to={to}
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
