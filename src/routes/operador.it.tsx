import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { BookOpen, ClipboardCheck, Droplets, Settings2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { TelaCarregando } from "@/components/tela-carregando";
import { useGuard } from "@/hooks/use-guard";
import { useItDocument } from "@/hooks/use-it-document";

export const Route = createFileRoute("/operador/it")({
  head: () => ({
    meta: [
      { title: "Instruções de Trabalho — Operador" },
      {
        name: "description",
        content: "Consulta de Instruções de Trabalho da Linha 3.",
      },
    ],
  }),
  component: OperadorItLayout,
});

function OperadorItLayout() {
  const location = useLocation();
  if (location.pathname !== "/operador/it") return <Outlet />;
  return <OperadorItIndex />;
}

function OperadorItIndex() {
  const { usuario, loading } = useGuard("operador");
  // Prewarm do manifest enquanto o operador escolhe a IT
  useItDocument();

  if (loading || !usuario) return <TelaCarregando />;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Instruções de Trabalho"
        subtitulo="Linha 3 — Enchedora 3"
        voltarPara="/operador"
      />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-8 flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground md:text-3xl">
              Selecione a instrução
            </h2>
            <p className="mt-1 text-sm text-muted-foreground md:text-base">
              Padrões oficiais de operação e limpeza da Enchedora L3.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CardIt
            to="/operador/it/$doc"
            params={{ doc: "operacao" }}
            icon={<Settings2 className="h-8 w-8" />}
            titulo="Instrução de Trabalho OPERAÇÃO"
            descricao="Operação da Enchedora L3"
          />
          <CardIt
            to="/operador/it/$doc"
            params={{ doc: "limpeza" }}
            icon={<Droplets className="h-8 w-8" />}
            titulo="Instrução de Trabalho LIMPEZA"
            descricao="Limpeza da Enchedora L3"
          />
        </div>

        {/* Ata de Treinamento na Função — opcional, sem trava de acesso */}
        <div className="mt-8 rounded-2xl border-2 border-dashed border-primary/30 bg-primary-soft/30 p-5 md:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-foreground md:text-xl">
                Ata de Treinamento na Função
              </p>
              <p className="mt-1 text-sm text-muted-foreground md:text-base">
                Registro do treinamento que você recebeu, com a assinatura de
                quem te ensinou. Pode ser cadastrada quando tiver tempo — não
                bloqueia o acesso à IT.
              </p>
              <Link
                to="/operador/it/ata"
                className="mt-4 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] md:text-base"
              >
                Cadastrar Ata de Treinamento →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function CardIt({
  to,
  params,
  icon,
  titulo,
  descricao,
}: {
  to: "/operador/it/$doc";
  params: { doc: "operacao" | "limpeza" };
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
}) {
  return (
    <Link
      to={to}
      params={params}
      className="group flex flex-col gap-4 rounded-2xl border-2 border-border bg-card p-6 text-left text-foreground shadow-sm transition-all hover:border-primary/50 hover:shadow-md active:bg-primary active:text-primary-foreground active:border-primary md:p-8"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-soft text-primary group-active:bg-primary-foreground/15 group-active:text-primary-foreground">
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold md:text-2xl">{titulo}</p>
        <p className="mt-1 text-sm text-muted-foreground group-active:text-primary-foreground/80 md:text-base">
          {descricao}
        </p>
      </div>
      <p className="mt-2 text-xs font-semibold text-muted-foreground group-active:text-primary-foreground/80">
        Toque para abrir →
      </p>
    </Link>
  );
}
