import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ClipboardList,
  Filter,
  FileBarChart2,
  Loader2,
  BookOpen,
  UserPlus,
  AlertOctagon,
  ArrowRight,
  LayoutDashboard,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { useChecklistsRemote } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { contarNcNrUltimosDias } from "@/lib/checklist/nao-conformidades";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import type { LimpezaTurnoRow } from "@/lib/verso/mappers";
import { limpezaTurnoFromRow } from "@/lib/verso/mappers";
import type { LimpezaTurno } from "@/lib/verso/types";

export const Route = createFileRoute("/gestao/")({
  head: () => ({
    meta: [
      { title: "Gestão Industrial — Checklist Operacional" },
      {
        name: "description",
        content:
          "Painel da Gestão Industrial para consultar checklists e não conformidades.",
      },
    ],
  }),
  component: GestaoHome,
});

const DIAS_NCNR = 30;

function GestaoHome() {
  const { usuario, loading } = useGuard("gestao");
  const { data: checklists } = useChecklistsRemote({ realtime: true });
  const [turnosLimpeza, setTurnosLimpeza] = useState<LimpezaTurno[]>([]);

  useEffect(() => {
    let cancelado = false;
    const desde = new Date();
    desde.setDate(desde.getDate() - DIAS_NCNR);
    const dataIso = desde.toISOString().slice(0, 10);
    void (async () => {
      const { data, error } = await supabase
        .from("limpeza_turnos" as never)
        .select("*")
        .gte("data_operacao", dataIso);
      if (cancelado) return;
      if (error) {
        console.error("[gestao.index] limpeza fetch:", error);
        setTurnosLimpeza([]);
        return;
      }
      setTurnosLimpeza(
        ((data ?? []) as unknown as LimpezaTurnoRow[]).map(limpezaTurnoFromRow),
      );
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const ncnr = useMemo(
    () => contarNcNrUltimosDias(checklists, turnosLimpeza, DIAS_NCNR),
    [checklists, turnosLimpeza],
  );

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

        {/* Bloco prioritário: Não conformidades e Não realizados */}
        <Link
          to="/gestao/nao-conformidades"
          className="mb-8 flex flex-col gap-4 rounded-2xl border-2 border-destructive/40 bg-destructive-soft/40 p-5 shadow-sm transition-all hover:border-destructive hover:shadow-md md:flex-row md:items-center md:p-6"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-destructive text-destructive-foreground">
            <AlertOctagon className="h-8 w-8" />
          </div>
          <div className="flex-1">
            <p className="text-xl font-bold text-foreground md:text-2xl">
              Não conformidades e Não realizados
            </p>
            <p className="mt-1 text-sm text-muted-foreground md:text-base">
              Problemas registrados no checklist e na limpeza ·{" "}
              <span className="font-semibold text-foreground">
                últimos {DIAS_NCNR} dias
              </span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs md:text-sm">
              <Pill label="NC checklist" valor={ncnr.totalNc} tom="destructive" />
              <Pill label="NR limpeza" valor={ncnr.totalNr} tom="warning" />
              <Pill label="Total" valor={ncnr.totalNc + ncnr.totalNr} tom="muted" />
            </div>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-full bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground md:self-center">
            Ver análise <ArrowRight className="h-4 w-4" />
          </div>
        </Link>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          <Card titulo="Checklists" valor={checklists.length} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <BotaoLink
            to="/gestao/dashboard"
            icon={<LayoutDashboard className="h-8 w-8" />}
            titulo="Dashboard"
            descricao="Visão executiva em tempo real · KPIs, aging, alertas"
          />
          <BotaoLink
            to="/gestao/checklists"
            icon={<ClipboardList className="h-8 w-8" />}
            titulo="Checklists"
            descricao="Lista completa de checklists"
          />
          <BotaoLink
            to="/gestao/nao-conformidades"
            icon={<AlertOctagon className="h-8 w-8" />}
            titulo="Não conformidades"
            descricao="NC do checklist e NR da limpeza"
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
            descricao="Consolidar checklist, tratativas e recorrências da Linha 3"
          />
          <BotaoLink
            to="/gestao/it-analytics"
            icon={<BookOpen className="h-8 w-8" />}
            titulo="Inteligência das ITs"
            descricao="Uso das instruções · pontos para reforço de treinamento"
          />
          <BotaoLink
            to="/gestao/usuarios"
            icon={<UserPlus className="h-8 w-8" />}
            titulo="Cadastrar Usuário"
            descricao="Gerenciar usuários · hierarquia · módulos de acesso"
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

function Pill({
  label,
  valor,
  tom,
}: {
  label: string;
  valor: number;
  tom: "destructive" | "warning" | "muted";
}) {
  const cls =
    tom === "destructive"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : tom === "warning"
        ? "bg-warning/20 text-warning-foreground border-warning/40"
        : "bg-muted text-foreground border-border";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-semibold ${cls}`}
    >
      <span>{label}</span>
      <span className="rounded-full bg-background px-2 text-foreground">{valor}</span>
    </span>
  );
}

function Card({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground md:text-sm">
        {titulo}
      </p>
      <p className="mt-1 text-3xl font-bold text-primary md:text-4xl">{valor}</p>
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
