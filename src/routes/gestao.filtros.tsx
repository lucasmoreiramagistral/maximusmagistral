import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";
import { getFiltros, setFiltros } from "@/lib/checklist/filtros";
import type { EstadoVersoFiltro, Filtros } from "@/lib/checklist/filtros";
import { MOMENTOS_CHECKLIST } from "@/lib/checklist/types";
import type {
  Equipe,
  MomentoChecklist,
  Turno,
} from "@/lib/checklist/types";

type Origem = "checklists" | "gestao";

export const Route = createFileRoute("/gestao/filtros")({
  head: () => ({ meta: [{ title: "Filtros — Gestão Industrial" }] }),
  validateSearch: (search: Record<string, unknown>): { origem?: Origem } => {
    const o = search.origem;
    if (o === "checklists" || o === "gestao") return { origem: o };
    return {};
  },
  component: FiltrosPage,
});

const TURNOS: Turno[] = ["12x36 Dia", "12x36 Noite", "3º Turno"];
const EQUIPES: Equipe[] = ["Karolainny", "Valderlan", "Nilson", "Bruno"];

// Manaus = UTC-4 (sem horário de verão)
function hojeManausYMD(offsetDias = 0): string {
  const agora = new Date();
  const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60_000;
  const manaus = new Date(utcMs - 4 * 60 * 60_000);
  manaus.setDate(manaus.getDate() + offsetDias);
  const y = manaus.getFullYear();
  const m = String(manaus.getMonth() + 1).padStart(2, "0");
  const d = String(manaus.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function primeiroDiaMesManausYMD(): string {
  const ymd = hojeManausYMD();
  return `${ymd.slice(0, 7)}-01`;
}

type AtalhoId = "hoje" | "ontem" | "7d" | "30d" | "mes";

function FiltrosPage() {
  const navigate = useNavigate();
  const { origem } = Route.useSearch();
  const { usuario, loading } = useGuard("gestao");
  const [f, setF] = useState<Filtros>({});
  const [erro, setErro] = useState<string | null>(null);
  const [aplicado, setAplicado] = useState(false);
  const acoesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setF(getFiltros());
  }, []);

  if (loading || !usuario) return <TelaCarregando />;

  // Wrapper para mudanças nos campos: esconde o sucesso quando o usuário mexe.
  const atualizar = (novo: Filtros) => {
    setF(novo);
    setErro(null);
    if (aplicado) setAplicado(false);
  };

  const aplicarAtalho = (id: AtalhoId) => {
    let inicio = "";
    let fim = "";
    if (id === "hoje") {
      inicio = fim = hojeManausYMD();
    } else if (id === "ontem") {
      inicio = fim = hojeManausYMD(-1);
    } else if (id === "7d") {
      inicio = hojeManausYMD(-6);
      fim = hojeManausYMD();
    } else if (id === "30d") {
      inicio = hojeManausYMD(-29);
      fim = hojeManausYMD();
    } else if (id === "mes") {
      inicio = primeiroDiaMesManausYMD();
      fim = hojeManausYMD();
    }
    atualizar({ ...f, dataInicio: inicio, dataFim: fim });
  };

  const aplicar = () => {
    if (f.dataInicio && f.dataFim && f.dataFim < f.dataInicio) {
      setErro("A data final não pode ser menor que a data inicial.");
      setAplicado(false);
      return;
    }
    setErro(null);
    setFiltros(f);
    setAplicado(true);
    // Rola até o bloco de ações para o usuário ver os botões novos.
    setTimeout(() => {
      acoesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const limpar = () => {
    setF({});
    setFiltros({});
    setErro(null);
    setAplicado(false);
  };

  const atalhos: { id: AtalhoId; label: string }[] = [
    { id: "hoje", label: "Hoje" },
    { id: "ontem", label: "Ontem" },
    { id: "7d", label: "Últimos 7 dias" },
    { id: "30d", label: "Últimos 30 dias" },
    { id: "mes", label: "Este mês" },
  ];

  const atalhoAtivo = (id: AtalhoId): boolean => {
    if (!f.dataInicio || !f.dataFim) return false;
    if (id === "hoje") return f.dataInicio === hojeManausYMD() && f.dataFim === hojeManausYMD();
    if (id === "ontem") return f.dataInicio === hojeManausYMD(-1) && f.dataFim === hojeManausYMD(-1);
    if (id === "7d") return f.dataInicio === hojeManausYMD(-6) && f.dataFim === hojeManausYMD();
    if (id === "30d") return f.dataInicio === hojeManausYMD(-29) && f.dataFim === hojeManausYMD();
    if (id === "mes") return f.dataInicio === primeiroDiaMesManausYMD() && f.dataFim === hojeManausYMD();
    return false;
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader titulo="Filtros" subtitulo="Filtre checklists e folhas do dia" voltarPara="/gestao" />
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-10">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-7">
          <Section titulo="Período">
            <div className="mb-4 flex flex-wrap gap-2">
              {atalhos.map((a) => {
                const ativo = atalhoAtivo(a.id);
                return (
                  <Button
                    key={a.id}
                    type="button"
                    variant={ativo ? "default" : "outline"}
                    size="sm"
                    className="h-10 text-sm"
                    onClick={() => aplicarAtalho(a.id)}
                  >
                    {a.label}
                  </Button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label className="text-base">Data inicial</Label>
                <Input
                  type="date"
                  value={f.dataInicio ?? ""}
                  onChange={(e) => {
                    atualizar({ ...f, dataInicio: e.target.value || undefined });
                  }}
                  className="mt-1.5 h-12 text-base"
                />
              </div>
              <div>
                <Label className="text-base">Data final</Label>
                <Input
                  type="date"
                  value={f.dataFim ?? ""}
                  onChange={(e) => {
                    atualizar({ ...f, dataFim: e.target.value || undefined });
                  }}
                  className="mt-1.5 h-12 text-base"
                />
              </div>
            </div>
            {erro && (
              <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {erro}
              </p>
            )}
          </Section>

          <Section titulo="Outros filtros">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label className="text-base">Turno</Label>
                <Select
                  value={f.turno ?? ""}
                  onValueChange={(v) =>
                    atualizar({ ...f, turno: v === "_todos" ? undefined : (v as Turno) })
                  }
                >
                  <SelectTrigger className="mt-1.5 h-12 w-full text-base">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_todos">Todos</SelectItem>
                    {TURNOS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-base">Equipe</Label>
                <Select
                  value={f.equipe ?? ""}
                  onValueChange={(v) =>
                    atualizar({ ...f, equipe: v === "_todos" ? undefined : (v as Equipe) })
                  }
                >
                  <SelectTrigger className="mt-1.5 h-12 w-full text-base">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_todos">Todas</SelectItem>
                    {EQUIPES.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-base">Momento do checklist</Label>
                <Select
                  value={f.momento ?? ""}
                  onValueChange={(v) =>
                    atualizar({ ...f, momento: v === "_todos" ? undefined : (v as MomentoChecklist) })
                  }
                >
                  <SelectTrigger className="mt-1.5 h-12 w-full text-base">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_todos">Todos</SelectItem>
                    {MOMENTOS_CHECKLIST.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
                <Select
                  value={f.estadoVerso ?? ""}
                  onValueChange={(v) =>
                    atualizar({
                      ...f,
                      estadoVerso:
                        v === "_todos" ? undefined : (v as EstadoVersoFiltro),
                    })
                  }
                >
                  <SelectTrigger className="mt-1.5 h-12 w-full text-base">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_todos">Todos</SelectItem>
                    <SelectItem value="com_verso">
                      Apenas folhas com verso (Linha 3)
                    </SelectItem>
                    <SelectItem value="pendente">Verso pendente</SelectItem>
                    <SelectItem value="ocorrencias">
                      Verso com ocorrências
                    </SelectItem>
                    <SelectItem value="validado">
                      Verso 100% validado
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Inclui PTP Garrafas + Limpeza Sala de Envase. Folhas de outras
                  linhas/máquinas são ignoradas por este filtro.
                </p>
              </div>
            </div>
          </Section>

          <div className="mt-7 flex flex-col-reverse gap-3 md:flex-row md:justify-end">
            <Button variant="outline" size="lg" className="h-14 text-base md:px-6" onClick={limpar}>
              Limpar filtros
            </Button>
            <Button size="lg" className="h-14 text-base font-semibold md:px-8" onClick={aplicar}>
              Aplicar filtros
            </Button>
          </div>

          {aplicado && (
            <div
              ref={acoesRef}
              className="mt-6 rounded-xl border border-success/40 bg-success-soft p-4"
            >
              <p className="mb-3 text-sm font-semibold text-success">✓ Filtros aplicados.</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                {(origem === "checklists" || origem === "gestao" || !origem) && (
                  <Button
                    size="lg"
                    className="h-12 flex-1 text-base font-semibold"
                    onClick={() => navigate({ to: "/gestao/checklists" })}
                  >
                    Ver checklists filtrados
                  </Button>
                )}
                {(origem === "anomalias" || origem === "gestao" || !origem) && (
                  <Button
                    size="lg"
                    variant={origem === "anomalias" ? "default" : "outline"}
                    className="h-12 flex-1 text-base font-semibold"
                    onClick={() => navigate({ to: "/gestao/anomalias" })}
                  >
                    Ver anomalias filtradas
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Section({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 text-base font-bold text-foreground">{titulo}</h2>
      {children}
    </div>
  );
}
