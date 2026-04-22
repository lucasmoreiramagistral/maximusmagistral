import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Download,
  Droplets,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Users,
  XCircle,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";
import {
  agruparPorOperador,
  listarAtas,
  type AtaTreinamento,
  type OperadorTreinado,
} from "@/lib/it/atas";
import { exportarAtaExcel } from "@/lib/it/ata-excel-export";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/gestao/it-treinamentos")({
  head: () => ({
    meta: [
      { title: "Operadores com treinamento — IT" },
      {
        name: "description",
        content:
          "Atas de treinamento na função das ITs de Operação e Limpeza da Enchedora L3.",
      },
    ],
  }),
  component: ItTreinamentos,
});

function ItTreinamentos() {
  const { usuario, loading } = useGuard("gestao");
  const [atas, setAtas] = useState<AtaTreinamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [exportando, setExportando] = useState<"it002" | "it005" | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const data = await listarAtas();
      setAtas(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar atas.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!usuario) return;
    void carregar();
  }, [usuario, carregar]);

  const operadores = useMemo<OperadorTreinado[]>(
    () => agruparPorOperador(atas),
    [atas],
  );

  const operadoresFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return operadores;
    return operadores.filter(
      (o) =>
        o.nomeCompleto.toLowerCase().includes(q) ||
        o.nomeCanonico.toLowerCase().includes(q),
    );
  }, [operadores, busca]);

  const stats = useMemo(() => {
    const total = operadores.length;
    const ambos = operadores.filter((o) => o.ataOperacao && o.ataLimpeza).length;
    const opOnly = operadores.filter(
      (o) => o.ataOperacao && !o.ataLimpeza,
    ).length;
    const limpOnly = operadores.filter(
      (o) => !o.ataOperacao && o.ataLimpeza,
    ).length;
    return { total, ambos, opOnly, limpOnly };
  }, [operadores]);

  async function handleExportar(doc: "it002" | "it005") {
    const lista = atas.filter((a) => a.documento === doc);
    if (lista.length === 0) {
      toast.error("Nada para exportar", {
        description: "Nenhuma ata cadastrada para esta IT ainda.",
      });
      return;
    }
    setExportando(doc);
    try {
      await exportarAtaExcel(doc, lista);
      toast.success("Exportação concluída", {
        description: `${lista.length} ata(s) exportada(s).`,
      });
    } catch (e) {
      toast.error("Falha ao exportar", {
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
    } finally {
      setExportando(null);
    }
  }

  if (loading || !usuario) return <TelaCarregando />;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Operadores com treinamento"
        subtitulo="Atas de treinamento na função — IT 002 / IT 005"
        voltarPara="/gestao/it-analytics"
      />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
        <Link
          to="/gestao/it-analytics"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Inteligência de IT
        </Link>

        {/* KPIs */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Operadores"
            valor={stats.total}
            icon={<Users className="h-5 w-5" />}
          />
          <KpiCard
            label="Treinados em ambas"
            valor={stats.ambos}
            icon={<CheckCircle2 className="h-5 w-5 text-success" />}
          />
          <KpiCard
            label="Só Operação"
            valor={stats.opOnly}
            icon={<Settings2 className="h-5 w-5 text-primary" />}
          />
          <KpiCard
            label="Só Limpeza"
            valor={stats.limpOnly}
            icon={<Droplets className="h-5 w-5 text-primary" />}
          />
        </div>

        {/* Toolbar */}
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar operador..."
              className="h-11 pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => carregar()}
              className="h-11"
              disabled={carregando}
            >
              <RefreshCw
                className={cn("mr-2 h-4 w-4", carregando && "animate-spin")}
              />
              Atualizar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-11" disabled={!!exportando}>
                  {exportando ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                  )}
                  Exportar Excel
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuItem
                  onClick={() => handleExportar("it002")}
                  className="cursor-pointer py-3"
                >
                  <Settings2 className="mr-2 h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-semibold">
                      Ata IT 002 — Operação Enchedora
                    </span>
                    <span className="text-xs text-muted-foreground">
                      FM 01 PSGQ 05 preenchida com as atas
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExportar("it005")}
                  className="cursor-pointer py-3"
                >
                  <Droplets className="mr-2 h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-semibold">
                      Ata IT 005 — Limpeza Enchedora
                    </span>
                    <span className="text-xs text-muted-foreground">
                      FM 01 PSGQ 05 preenchida com as atas
                    </span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {erro && (
          <Card className="mb-4 border-destructive/40 bg-destructive/5">
            <CardContent className="flex items-start gap-3 p-4">
              <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" />
              <div className="text-sm text-destructive">{erro}</div>
            </CardContent>
          </Card>
        )}

        {carregando ? (
          <div className="flex h-60 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : operadoresFiltrados.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground/60" />
              <p className="font-medium text-foreground">
                {atas.length === 0
                  ? "Nenhum operador treinado ainda"
                  : "Nenhum resultado para esta busca"}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {atas.length === 0
                  ? "As atas cadastradas pelos operadores em /operador/it/ata aparecerão aqui."
                  : "Tente outro termo."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {operadoresFiltrados.map((op) => (
              <CardOperador key={op.nomeCanonico} operador={op} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function KpiCard({
  label,
  valor,
  icon,
}: {
  label: string;
  valor: number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          {icon}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-bold text-foreground">{valor}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CardOperador({ operador }: { operador: OperadorTreinado }) {
  const ambos = operador.ataOperacao && operador.ataLimpeza;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">
              {operador.nomeCompleto}
            </CardTitle>
            <CardDescription className="text-xs">
              {operador.ataOperacao?.turno ??
                operador.ataLimpeza?.turno ??
                "—"}
            </CardDescription>
          </div>
          {ambos && (
            <span className="rounded-full bg-success/15 px-2 py-1 text-[10px] font-bold uppercase text-success">
              Completo
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <BlocoAta
          titulo="IT 002 — Operação"
          icon={<Settings2 className="h-4 w-4" />}
          ata={operador.ataOperacao}
        />
        <BlocoAta
          titulo="IT 005 — Limpeza"
          icon={<Droplets className="h-4 w-4" />}
          ata={operador.ataLimpeza}
        />
      </CardContent>
    </Card>
  );
}

function BlocoAta({
  titulo,
  icon,
  ata,
}: {
  titulo: string;
  icon: React.ReactNode;
  ata: AtaTreinamento | null;
}) {
  if (!ata) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm">
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1 text-muted-foreground">{titulo}</span>
        <XCircle className="h-4 w-4 text-muted-foreground/60" />
        <span className="text-xs text-muted-foreground">Sem ata</span>
      </div>
    );
  }

  const dataFmt = new Date(ata.dataTreinamento + "T00:00:00").toLocaleDateString(
    "pt-BR",
  );

  return (
    <div className="rounded-lg border border-success/30 bg-success/5 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-success">{icon}</span>
        <span className="flex-1 text-sm font-semibold text-foreground">
          {titulo}
        </span>
        <CheckCircle2 className="h-4 w-4 text-success" />
      </div>
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Instrutor:</span>{" "}
          {ata.instrutorNome}
        </p>
        <p>
          <span className="font-medium text-foreground">Data:</span> {dataFmt}{" "}
          · <span className="font-medium text-foreground">Turno:</span>{" "}
          {ata.turno}
        </p>
      </div>
      {ata.instrutorAssinatura && (
        <div className="mt-2 overflow-hidden rounded border border-border bg-white p-1">
          <img
            src={ata.instrutorAssinatura}
            alt={`Assinatura de ${ata.instrutorNome}`}
            className="h-16 w-full object-contain"
          />
        </div>
      )}
    </div>
  );
}
