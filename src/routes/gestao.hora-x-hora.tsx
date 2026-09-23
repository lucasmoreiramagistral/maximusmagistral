import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  FileClock,
  MinusCircle,
  PenLine,
  TrendingUp,
} from "lucide-react";
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
import { TelaCarregando } from "@/components/tela-carregando";
import { useGuard } from "@/hooks/use-guard";
import { useProducaoHoraria } from "@/hooks/use-producao-horaria";
import { MAQUINAS, MAQUINAS_ORDENADAS, type MaquinaId } from "@/lib/maquinas/catalogo";
import { horaTerminou } from "@/lib/producao/horario";
import { buildFolhaDiaKey, formatarDataBR } from "@/lib/operacao/data-operacional";
import {
  HORA_X_HORA_FAIXAS,
  LABEL_EVENTO_HORA,
  LABEL_MOTIVO_REINICIO,
  checagensLiderDoTurno,
  horasDoTurnoEquipe,
} from "@/lib/producao/constants";
import { calcularAcumulado, calcularResumoHoraXHora } from "@/lib/producao/acumulado";
import { rotuloMotivoParada } from "@/lib/producao/motivos-parada";
import type { Turno } from "@/lib/checklist/types";

export const Route = createFileRoute("/gestao/hora-x-hora")({
  validateSearch: (search: Record<string, unknown>) => ({
    data: typeof search.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.data)
      ? search.data
      : undefined,
    hora: typeof search.hora === "string" && /^H(0[1-9]|1\d|2[0-4])$/.test(search.hora)
      ? search.hora
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Relatório Operacional Hora x Hora — Gestão Industrial" },
      {
        name: "description",
        content:
          "Consulta do relatório operacional horário das enchedoras e empacotadoras das Linhas 2 e 3.",
      },
      {
        property: "og:title",
        content: "Relatório Operacional Hora x Hora — Gestão Industrial",
      },
      {
        property: "og:description",
        content:
          "Consulta do relatório operacional horário das quatro máquinas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GestaoHoraXHoraPage,
});

const TURNOS: Turno[] = ["12x36 Dia", "12x36 Noite"];

function dataHojeManaus(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Manaus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function GestaoHoraXHoraPage() {
  const { usuario, loading } = useGuard("gestao");
  const search = Route.useSearch();
  const [data, setData] = useState<string>(search.data ?? dataHojeManaus());
  const [turno, setTurno] = useState<Turno>(
    search.hora && Number(search.hora.slice(1)) > 12 ? "12x36 Noite" : "12x36 Dia",
  );
  const [maquinaId, setMaquinaId] = useState<MaquinaId>("enchedora-3");
  const maquina = MAQUINAS[maquinaId];

  const folhaDiaKey = useMemo(
    () =>
      buildFolhaDiaKey(data, maquina.linha, maquina.nome),
    [data, maquina],
  );

  const { horas, loading: carregando, error, refetch } = useProducaoHoraria(
    folhaDiaKey,
    data,
    turno,
    null,
    maquina,
    false,
  );

  const codigosDoTurno = useMemo(() => horasDoTurnoEquipe(turno, null), [turno]);
  const calculadas = useMemo(() => calcularAcumulado(horas), [horas]);
  const porCodigo = useMemo(
    () => new Map(calculadas.map((h) => [h.horaCodigo, h])),
    [calculadas],
  );
  const resumo = useMemo(
    () => calcularResumoHoraXHora(horas, codigosDoTurno),
    [horas, codigosDoTurno],
  );
  const rankingMotivos = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const codigo of codigosDoTurno) {
      const hora = porCodigo.get(codigo);
      if (!hora?.motivoParadaCodigo) continue;
      contagem.set(hora.motivoParadaCodigo, (contagem.get(hora.motivoParadaCodigo) ?? 0) + 1);
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  }, [codigosDoTurno, porCodigo]);
  const checagens = useMemo(() => checagensLiderDoTurno(codigosDoTurno), [codigosDoTurno]);
  const checagensAssinadas = checagens.filter(
    (c) => !!porCodigo.get(c)?.assinaturaLider?.dataUrl,
  ).length;

  if (loading || !usuario) return <TelaCarregando />;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Relatório Operacional Hora x Hora"
        subtitulo={`Consulta da produção horária da ${maquina.nome} · ${maquina.linha}`}
        voltarPara="/gestao"
      />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="maquina">Máquina</Label>
              <Select value={maquinaId} onValueChange={(value) => setMaquinaId(value as MaquinaId)}>
                <SelectTrigger id="maquina"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MAQUINAS_ORDENADAS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.nome} · {item.linha}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="data">Data</Label>
              <Input
                id="data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="turno">Turno</Label>
              <Select
                value={turno}
                onValueChange={(v) => setTurno(v as Turno)}
              >
                <SelectTrigger id="turno">
                  <SelectValue placeholder="Selecione o turno" />
                </SelectTrigger>
                <SelectContent>
                  {TURNOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <p className="text-sm text-muted-foreground">
                Folha: <span className="font-medium text-foreground">{formatarDataBR(data)}</span> ·{" "}
                <span className="font-medium text-foreground">{turno}</span>
              </p>
            </div>
          </div>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center py-20">
            <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-foreground">
            <p className="font-semibold">{error}</p>
            <Button className="mt-3" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
          </div>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Cartao titulo="Horas lançadas" valor={`${resumo.lancadas}/${resumo.total}`} />
              <Cartao
                titulo={`Produzido no turno (${maquina.unidadeProducao})`}
                valor={`${resumo.totalProduzido.toLocaleString("pt-BR")} ${maquina.unidadeProducao}`}
              />
              <Cartao
                titulo="Atingimento da meta"
                valor={resumo.atingimentoPct !== null ? `${resumo.atingimentoPct}%` : "—"}
              />
              <Cartao
                titulo="Perda equivalente"
                valor={`${resumo.totalPerdaEquivalenteMin} min${resumo.horasSemCalculo ? ` · ${resumo.horasSemCalculo} h sem cálculo` : ""}${resumo.totalParadaInformadaMin ? ` · ${resumo.totalParadaInformadaMin} min históricos` : ""}`}
              />
            </div>

            <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-bold text-foreground">Motivos principais apontados</h2>
              {rankingMotivos.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {rankingMotivos.map(([codigo, ocorrencias]) => (
                    <span key={codigo} className="rounded-lg bg-muted px-3 py-2 text-xs text-foreground">
                      {rotuloMotivoParada(codigo)} <strong>· {ocorrencias} hora{ocorrencias === 1 ? "" : "s"}</strong>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Ainda não há motivo padronizado neste turno. Os relatos antigos permanecem na tabela.</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Contagem de horas por motivo principal, não de ocorrências isoladas nem de minutos atribuídos à causa.
              </p>
            </div>

            {checagens.length > 0 && (
              <div
                className={`mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${
                  checagensAssinadas === checagens.length
                    ? "border-success/40 bg-success/10"
                    : "border-warning/40 bg-warning/10"
                }`}
              >
                <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />
                <p className="text-foreground">
                  <span className="font-semibold">
                    Checagem do líder: {checagensAssinadas}/{checagens.length}
                  </span>{" "}
                  — assinaturas nas horas{" "}
                  {checagens
                    .map((c) => {
                      const f = HORA_X_HORA_FAIXAS.find((x) => x.codigo === c);
                      return f ? `${f.inicio} às ${f.fim}` : c;
                    })
                    .join(" e ")}
                  .
                </p>
              </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left">
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Hora</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Meta</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Qtd. ({maquina.unidadeProducao})</th>
                      {maquina.tipo === "empacotadora" && (
                        <th className="px-4 py-3 font-semibold text-muted-foreground">Paletes + quebra</th>
                      )}
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Acum.</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Minutos</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Produto</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Eventos</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Motivo principal</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Observação antiga</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codigosDoTurno.map((codigo) => {
                      const h = porCodigo.get(codigo);
                      if (!h) return null;
                      const lancada = h.naoRodou || typeof h.quantidade === "number";
                      const pendenteVencida = !lancada && horaTerminou(data, codigo);
                      return (
                        <tr
                          key={codigo}
                          className={`border-b border-border last:border-b-0 ${
                            !lancada ? "bg-muted/30" : ""
                          } ${search.hora === codigo ? "outline outline-2 outline-primary -outline-offset-2" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <p className="font-bold text-foreground">{h.horaCodigo}</p>
                            <p className="text-xs text-muted-foreground">
                              {h.horaInicio} às {h.horaFim}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            {h.naoRodou ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-foreground/70">
                                <MinusCircle className="h-3 w-3" /> Não rodou
                              </span>
                            ) : typeof h.quantidade === "number" ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-0.5 text-xs font-bold text-success">
                                <CheckCircle2 className="h-3 w-3" /> Lançada
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 text-xs font-bold text-warning">
                                <Clock className="h-3 w-3" /> {pendenteVencida ? "Não realizado" : "Aguardando"}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground">
                            {h.meta ?? "—"}
                          </td>
                          <td className="px-4 py-3 font-bold text-foreground">
                            {typeof h.quantidade === "number"
                              ? h.quantidade.toLocaleString("pt-BR")
                              : "—"}
                          </td>
                          {maquina.tipo === "empacotadora" && (
                            <td className="px-4 py-3 text-foreground">
                              {typeof h.paletesCompletos === "number" && typeof h.quebraPacotes === "number"
                                ? `${h.paletesCompletos} paletes + ${h.quebraPacotes} pacotes`
                                : "—"}
                            </td>
                          )}
                          <td className="px-4 py-3 font-bold text-primary">
                            {h.quantidadeAcumulada !== null
                              ? h.quantidadeAcumulada.toLocaleString("pt-BR")
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            {typeof h.tempoParadaMin === "number" ? `${h.tempoParadaMin} min` : "—"}
                            {typeof h.tempoParadaMin === "number" && (
                              <p className="text-xs text-muted-foreground">
                                {h.tempoParadaMetodo === "cadencia_equivalente" ? "equivalentes" : "informados"}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            {h.produtoVigente ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {h.eventos.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {h.eventos.map((e) => (
                                  <span
                                    key={e}
                                    className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
                                  >
                                    {LABEL_EVENTO_HORA[e]}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              "—"
                            )}
                            {h.reiniciaAcumulado && h.motivoReinicio && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Reinício: {LABEL_MOTIVO_REINICIO[h.motivoReinicio]}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            {rotuloMotivoParada(h.motivoParadaCodigo) ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            {h.observacao ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {resumo.total === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhuma hora configurada para este turno.
                </div>
              )}
            </div>

            <p className="mt-6 text-sm text-muted-foreground">
              <FileClock className="mr-1 inline h-4 w-4" />
              Dados consultados no banco. A quantidade acumulada zera na virada do turno e a
              cada troca de produto ou CIP. Uma hora sem registro após o fim aparece como
              “Não realizado”; isso não significa produção zero. Minutos equivalentes vêm da
              diferença entre a cadência e a quantidade produzida, não de um cronômetro de máquina parada.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Cartao({ titulo, valor }: { titulo: string; valor: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground md:text-sm">
        {titulo}
      </p>
      <p className="mt-1 text-2xl font-bold text-primary md:text-3xl">{valor}</p>
    </div>
  );
}
