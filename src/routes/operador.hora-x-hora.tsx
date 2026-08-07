import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Lock,
  MinusCircle,
  RefreshCcw,
  TrendingUp,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useTurnoAtivoDoDia } from "@/lib/operacao/turno-ativo";
import { buildFolhaDiaKey, formatarDataBR } from "@/lib/operacao/data-operacional";
import {
  HORA_X_HORA_FAIXAS,
  LABEL_MOTIVO_REINICIO,
  PRODUCAO_CONTEXTO_FIXO,
  TAMANHOS_SUGERIDOS,
  checagensLiderDoTurno,
  ehHoraDeChecagemLider,
  horasDoTurnoEquipe,
} from "@/lib/producao/constants";
import { SignaturePad } from "@/components/signature-pad";
import { calcularAcumulado, calcularResumoHoraXHora } from "@/lib/producao/acumulado";
import type { MotivoReinicio, ProducaoHora } from "@/lib/producao/types";

export const Route = createFileRoute("/operador/hora-x-hora")({
  head: () => ({
    meta: [
      { title: "Hora x Hora — Enchedora Linha 3" },
      {
        name: "description",
        content:
          "Relatório operacional horário da enchedora da Linha 3: produção por hora, meta, acumulado e tempo de parada.",
      },
      { property: "og:title", content: "Hora x Hora — Enchedora Linha 3" },
      {
        property: "og:description",
        content:
          "Lançamento da produção hora a hora da enchedora da Linha 3 pelo operador do turno.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HoraXHoraPage,
});

/** Hora local Manaus em minutos desde 00:00. */
function minutosManausAgora(): number {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const manaus = new Date(utcMs - 4 * 60 * 60_000);
  return manaus.getUTCHours() * 60 + manaus.getUTCMinutes();
}

function hhmmParaMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function HoraXHoraPage() {
  const { usuario, loading } = useGuard("operador");
  const turnoAtivo = useTurnoAtivoDoDia(usuario);
  const turno = turnoAtivo.turno;
  const equipe = turnoAtivo.equipe;
  const data = turnoAtivo.data;
  const folhaDiaKey = buildFolhaDiaKey(
    data,
    PRODUCAO_CONTEXTO_FIXO.linha,
    PRODUCAO_CONTEXTO_FIXO.maquina,
  );

  const {
    horas,
    loading: carregando,
    conflito,
    salvarHora,
  } = useProducaoHoraria(folhaDiaKey, data, turno, usuario?.userId ?? null);

  const [editando, setEditando] = useState<string | null>(null);

  const codigosDoTurno = useMemo(
    () => horasDoTurnoEquipe(turno, equipe),
    [turno, equipe],
  );

  const calculadas = useMemo(() => calcularAcumulado(horas), [horas]);
  const porCodigo = useMemo(
    () => new Map(calculadas.map((h) => [h.horaCodigo, h])),
    [calculadas],
  );

  const resumo = useMemo(
    () => calcularResumoHoraXHora(horas, codigosDoTurno),
    [horas, codigosDoTurno],
  );

  // As 2 checagens do líder do turno (meio e fim do turno).
  const checagens = useMemo(
    () => checagensLiderDoTurno(codigosDoTurno),
    [codigosDoTurno],
  );
  const checagensAssinadas = checagens.filter(
    (c) => !!porCodigo.get(c)?.assinaturaLider?.dataUrl,
  ).length;

  // Bloqueio de horas futuras: só quando o relógio ainda está dentro do turno.
  const codigoAtual = useMemo(() => {
    const agora = minutosManausAgora();
    return (
      HORA_X_HORA_FAIXAS.find((f) => {
        const ini = hhmmParaMin(f.inicio);
        const fim = hhmmParaMin(f.fim) <= ini ? 24 * 60 : hhmmParaMin(f.fim);
        return agora >= ini && agora < fim;
      })?.codigo ?? null
    );
  }, []);

  const indiceAtualNoTurno = codigoAtual ? codigosDoTurno.indexOf(codigoAtual) : -1;
  const bloqueada = (codigo: string) =>
    indiceAtualNoTurno >= 0 && codigosDoTurno.indexOf(codigo) > indiceAtualNoTurno;

  if (loading || !usuario || carregando) return <TelaCarregando />;

  if (!turno || !equipe) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader
          titulo="Hora x Hora"
          subtitulo="Defina seu turno do dia"
          voltarPara="/operador"
        />
        <main className="mx-auto w-full max-w-[800px] px-4 py-10 md:py-16">
          <div className="rounded-2xl border-2 border-warning/40 bg-warning/10 p-6 text-center md:p-8">
            <p className="text-base font-bold text-foreground md:text-lg">
              Defina seu turno do dia para abrir o Hora x Hora
            </p>
            <Button asChild className="mt-4 h-12 px-6 text-base font-semibold">
              <Link to="/operador">Definir turno do dia agora</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const horaEmEdicao = editando ? porCodigo.get(editando) ?? null : null;

  // Meta sugerida: última meta informada nas horas anteriores do turno.
  function metaSugerida(codigo: string): number | null {
    const idx = codigosDoTurno.indexOf(codigo);
    for (let i = idx - 1; i >= 0; i--) {
      const anterior = porCodigo.get(codigosDoTurno[i]);
      if (typeof anterior?.meta === "number") return anterior.meta;
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Hora x Hora — Enchedora L3"
        subtitulo={`Folha do dia ${formatarDataBR(data)} · ${turno}${turnoAtivo.ehExtra ? " · EXTRA" : ""}`}
        voltarPara="/operador"
      />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-10">
        {conflito && (
          <div className="mb-4 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
            Conflito de versão: outra pessoa alterou uma hora. Recarregue a tela
            antes de salvar.
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Cartao titulo="Horas lançadas" valor={`${resumo.lancadas}/${resumo.total}`} />
          <Cartao titulo="Produzido no turno" valor={resumo.totalProduzido.toLocaleString("pt-BR")} />
          <Cartao
            titulo="Atingimento da meta"
            valor={resumo.atingimentoPct !== null ? `${resumo.atingimentoPct}%` : "—"}
          />
          <Cartao titulo="Parada total" valor={`${resumo.totalParadaMin} min`} />
        </div>

        <p className="mb-3 text-sm text-muted-foreground">
          Toque em uma hora para lançar a produção. A quantidade acumulada é
          calculada automaticamente e zera na virada do turno e a cada troca de
          produto ou CIP.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {codigosDoTurno.map((codigo) => {
            const h = porCodigo.get(codigo);
            if (!h) return null;
            const travada = bloqueada(codigo);
            const lancada = h.naoRodou || typeof h.quantidade === "number";
            return (
              <button
                key={codigo}
                type="button"
                disabled={travada}
                onClick={() => setEditando(codigo)}
                className={`rounded-2xl border-2 p-4 text-left shadow-sm transition-all ${
                  travada
                    ? "cursor-not-allowed border-border bg-muted/40 opacity-70"
                    : "border-border bg-card hover:border-primary/50 hover:shadow-md active:scale-[0.99]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {h.horaCodigo}
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {h.horaInicio} às {h.horaFim}
                    </p>
                  </div>
                  {travada ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                      <Lock className="h-3 w-3" /> Aguardando
                    </span>
                  ) : lancada ? (
                    h.naoRodou ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground/70">
                        <MinusCircle className="h-3 w-3" /> Não rodou
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-0.5 text-[11px] font-bold text-success">
                        <CheckCircle2 className="h-3 w-3" /> Lançada
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 text-[11px] font-bold text-warning">
                      <Clock className="h-3 w-3" /> Pendente
                    </span>
                  )}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <Campo rotulo="Meta" valor={h.meta?.toLocaleString("pt-BR") ?? "—"} />
                  <Campo
                    rotulo="Quantidade"
                    valor={h.naoRodou ? "—" : h.quantidade?.toLocaleString("pt-BR") ?? "—"}
                  />
                  <Campo
                    rotulo="Acumulado"
                    valor={h.quantidadeAcumulada?.toLocaleString("pt-BR") ?? "—"}
                  />
                  <Campo
                    rotulo="Parada"
                    valor={h.tempoParadaMin !== null ? `${h.tempoParadaMin} min` : "—"}
                  />
                </dl>

                {h.reiniciaAcumulado && h.motivoReinicio && (
                  <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                    <RefreshCcw className="h-3 w-3" />
                    {LABEL_MOTIVO_REINICIO[h.motivoReinicio]}
                    {h.produtoVigente ? ` · ${h.produtoVigente}` : ""}
                  </p>
                )}
                {!h.reiniciaAcumulado && h.produtoVigente && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Produto: <span className="font-semibold text-foreground">{h.produtoVigente}</span>
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {resumo.faltantes.length > 0 && (
          <div className="mt-6 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-foreground">
              {resumo.faltantes.length} hora(s) do seu turno ainda sem lançamento:{" "}
              <span className="font-semibold">{resumo.faltantes.join(", ")}</span>
            </p>
          </div>
        )}
      </main>

      {horaEmEdicao && (
        <DialogHora
          key={horaEmEdicao.horaCodigo}
          hora={horaEmEdicao}
          metaSugerida={metaSugerida(horaEmEdicao.horaCodigo)}
          onFechar={() => setEditando(null)}
          onSalvar={async (nova) => {
            try {
              await salvarHora(nova, {
                anterior: horaEmEdicao,
                editadoPorLogin: usuario.usuario,
                editadoPorNome: usuario.nome,
              });
              toast.success(`Hora ${nova.horaInicio} salva.`);
              setEditando(null);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              toast.error(`Não foi possível salvar: ${msg}`);
            }
          }}
        />
      )}
    </div>
  );
}

function Cartao({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{titulo}</p>
      <p className="mt-0.5 text-xl font-bold text-foreground">{valor}</p>
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="font-semibold text-foreground">{valor}</dd>
    </div>
  );
}

function DialogHora({
  hora,
  metaSugerida,
  onFechar,
  onSalvar,
}: {
  hora: ProducaoHora;
  metaSugerida: number | null;
  onFechar: () => void;
  onSalvar: (h: ProducaoHora) => Promise<void>;
}) {
  const [meta, setMeta] = useState<string>(
    hora.meta !== null ? String(hora.meta) : metaSugerida !== null ? String(metaSugerida) : "",
  );
  const [quantidade, setQuantidade] = useState<string>(
    hora.quantidade !== null && !hora.naoRodou ? String(hora.quantidade) : "",
  );
  const [naoRodou, setNaoRodou] = useState(hora.naoRodou);
  const [parada, setParada] = useState<string>(
    hora.tempoParadaMin !== null ? String(hora.tempoParadaMin) : "",
  );
  const [reinicia, setReinicia] = useState(hora.reiniciaAcumulado);
  const [motivo, setMotivo] = useState<MotivoReinicio>(hora.motivoReinicio ?? "troca_sabor");
  const [sabor, setSabor] = useState(hora.produtoSabor ?? "");
  const [tamanho, setTamanho] = useState(hora.produtoTamanho ?? "");
  const [observacao, setObservacao] = useState(hora.observacao ?? "");
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    const qtd = quantidade.trim() === "" ? null : Number(quantidade);
    const metaNum = meta.trim() === "" ? null : Number(meta);
    const paradaNum = parada.trim() === "" ? null : Number(parada);

    if (!naoRodou && qtd === null) {
      toast.error('Informe a quantidade produzida ou marque "não rodou".');
      return;
    }
    if (qtd !== null && (Number.isNaN(qtd) || qtd < 0)) {
      toast.error("Quantidade inválida.");
      return;
    }
    if (metaNum !== null && (Number.isNaN(metaNum) || metaNum < 0)) {
      toast.error("Meta inválida.");
      return;
    }
    if (paradaNum !== null && (Number.isNaN(paradaNum) || paradaNum < 0 || paradaNum > 60)) {
      toast.error("Tempo de parada deve estar entre 0 e 60 minutos.");
      return;
    }
    if (reinicia && motivo !== "cip" && !sabor.trim() && !tamanho.trim()) {
      toast.error("Informe o sabor ou o tamanho do novo produto.");
      return;
    }

    setSalvando(true);
    try {
      await onSalvar({
        ...hora,
        meta: metaNum,
        quantidade: naoRodou ? 0 : qtd,
        naoRodou,
        tempoParadaMin: paradaNum,
        reiniciaAcumulado: reinicia,
        motivoReinicio: reinicia ? motivo : null,
        produtoSabor: sabor.trim() || null,
        produtoTamanho: tamanho.trim() || null,
        observacao: observacao.trim() || null,
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <TrendingUp className="h-6 w-6" />
          </div>
          <DialogTitle>
            {hora.horaCodigo} · {hora.horaInicio} às {hora.horaFim}
          </DialogTitle>
          <DialogDescription>
            Lance a produção desta hora. O acumulado é calculado pelo app.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="meta">Meta (garrafas)</Label>
              <Input
                id="meta"
                inputMode="numeric"
                value={meta}
                onChange={(e) => setMeta(e.target.value)}
                placeholder="Ex.: 6000"
                className="mt-1 h-12 text-base"
              />
            </div>
            <div>
              <Label htmlFor="qtd">Quantidade produzida</Label>
              <Input
                id="qtd"
                inputMode="numeric"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                disabled={naoRodou}
                placeholder="Ex.: 5820"
                className="mt-1 h-12 text-base"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Não rodou nesta hora</p>
              <p className="text-xs text-muted-foreground">
                Equivale ao traço "—" do formulário em papel.
              </p>
            </div>
            <Switch checked={naoRodou} onCheckedChange={setNaoRodou} />
          </div>

          <div>
            <Label htmlFor="parada">Tempo de parada (min)</Label>
            <Input
              id="parada"
              inputMode="numeric"
              value={parada}
              onChange={(e) => setParada(e.target.value)}
              placeholder="0 a 60"
              className="mt-1 h-12 text-base"
            />
          </div>

          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Reiniciar acumulado nesta hora
                </p>
                <p className="text-xs text-muted-foreground">
                  Troca de sabor, troca de tamanho ou CIP.
                </p>
              </div>
              <Switch checked={reinicia} onCheckedChange={setReinicia} />
            </div>

            {reinicia && (
              <div className="mt-3 grid gap-3">
                <div>
                  <Label>Motivo</Label>
                  <Select
                    value={motivo}
                    onValueChange={(v) => setMotivo(v as MotivoReinicio)}
                  >
                    <SelectTrigger className="mt-1 h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="troca_sabor">Troca de sabor</SelectItem>
                      <SelectItem value="troca_tamanho">Troca de tamanho</SelectItem>
                      <SelectItem value="cip">CIP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="sabor">Sabor</Label>
                    <Input
                      id="sabor"
                      value={sabor}
                      onChange={(e) => setSabor(e.target.value)}
                      placeholder="Ex.: Regente"
                      className="mt-1 h-12 text-base"
                    />
                  </div>
                  <div>
                    <Label htmlFor="tamanho">Tamanho</Label>
                    <Input
                      id="tamanho"
                      list="tamanhos-sugeridos"
                      value={tamanho}
                      onChange={(e) => setTamanho(e.target.value)}
                      placeholder="Ex.: 2L"
                      className="mt-1 h-12 text-base"
                    />
                    <datalist id="tamanhos-sugeridos">
                      {TAMANHOS_SUGERIDOS.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="obs">Observação (opcional)</Label>
            <Textarea
              id="obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: parada por falta de tampa"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar hora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
