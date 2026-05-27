import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  MinusCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LABEL_LIMPEZA_ITEM_STATUS,
  LABEL_LIMPEZA_STATUS,
  LABEL_PTP_STATUS,
  LIMPEZA_ITENS_DEF,
  PTP_JANELAS,
} from "@/lib/verso/constants";
import {
  fetchLimpezaTurnos,
  fetchPtpJanelas,
} from "@/lib/verso/supabase-storage";
import { calcularResumoVerso } from "@/lib/verso/resumo";
import { janelasPtpDoTurnoEquipe } from "@/lib/operacao/escalas";
import {
  useEdicoesVerso,
  type EdicaoVersoLimpeza,
  type EdicaoVersoPtp,
} from "@/hooks/use-edicoes-verso";
import { formatarDataHora } from "@/lib/checklist/format";
import type { LimpezaTurno, PtpJanela } from "@/lib/verso/types";
import type { Equipe, Turno } from "@/lib/checklist/types";

interface Props {
  folhaDiaKey: string;
  dataOperacao: string;
  turno: Turno;
  equipe: Equipe;
}

export function VersoDiaDetalhe({ folhaDiaKey, dataOperacao, turno, equipe }: Props) {
  const [janelas, setJanelas] = useState<PtpJanela[]>([]);
  const [turnos, setTurnos] = useState<LimpezaTurno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historicoOpen, setHistoricoOpen] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [j, t] = await Promise.all([
          fetchPtpJanelas(folhaDiaKey),
          fetchLimpezaTurnos(folhaDiaKey),
        ]);
        if (cancelado) return;
        setJanelas(j);
        setTurnos(t);
      } catch (e) {
        console.error("[VersoDiaDetalhe] erro:", e);
        if (!cancelado) setError("Erro ao carregar verso da folha.");
      } finally {
        if (!cancelado) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelado = true;
    };
  }, [folhaDiaKey]);

  // Códigos de janela DESTE turno (ex.: J01..J06 no Dia, J07..J12 na Noite).
  const codigosDoTurno = useMemo(
    () => janelasPtpDoTurnoEquipe(turno, equipe),
    [turno, equipe],
  );

  // Filtra registros para só este turno.
  const janelasDoTurno = useMemo(() => {
    const setCods = new Set(codigosDoTurno);
    return janelas.filter((j) => setCods.has(j.janelaCodigo));
  }, [janelas, codigosDoTurno]);
  const turnosDoTurno = useMemo(
    () => turnos.filter((t) => t.turno === turno),
    [turnos, turno],
  );

  const resumo = useMemo(
    () =>
      calcularResumoVerso({
        janelas: janelasDoTurno,
        turnos: turnosDoTurno,
        escopo: { turno, equipe },
      }),
    [janelasDoTurno, turnosDoTurno, turno, equipe],
  );

  const janelasPorCodigo = useMemo(() => {
    const map = new Map<string, PtpJanela>();
    for (const j of janelasDoTurno) map.set(j.janelaCodigo, j);
    return map;
  }, [janelasDoTurno]);

  const turnoDado = useMemo(
    () => turnosDoTurno.find((t) => t.turno === turno),
    [turnosDoTurno, turno],
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          Carregando verso da folha…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive-soft p-5 text-sm font-semibold text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Verso da folha (Linha 3 · Enchedora 3)
            </p>
            <h2 className="text-lg font-bold text-foreground md:text-xl">
              PTP Garrafas + Limpeza Sala de Envase
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Data operacional <strong>{dataOperacao}</strong> · ciclo 06h → 06h
              do dia seguinte
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoricoOpen(true)}
          >
            <History className="mr-1.5 h-4 w-4" />
            Histórico de edições
          </Button>
        </div>

        <ResumoChips resumo={resumo} />
      </div>

      <PtpGrid janelasPorCodigo={janelasPorCodigo} />
      <LimpezaTurnos turnoPorCodigo={turnoPorCodigo} />

      <HistoricoDialog
        open={historicoOpen}
        onClose={() => setHistoricoOpen(false)}
        folhaDiaKey={folhaDiaKey}
      />
    </div>
  );
}

// ────────────────────────────── Resumo chips ─────────────────────────
function ResumoChips({
  resumo,
}: {
  resumo: ReturnType<typeof calcularResumoVerso>;
}) {
  const { ptp, limpeza } = resumo;
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
      <Chip label="Janelas finalizadas" valor={`${ptp.finalizadas}/12`} tone="azul" />
      <Chip
        label="Sem ocorrência"
        valor={String(ptp.semOcorrencia)}
        tone="verde"
      />
      <Chip
        label="Com ocorrência"
        valor={String(ptp.comOcorrencia)}
        tone={ptp.comOcorrencia > 0 ? "vermelho" : "cinza"}
      />
      <Chip
        label="Itens não realizados"
        valor={String(limpeza.itensNaoRealizados)}
        tone={limpeza.itensNaoRealizados > 0 ? "vermelho" : "cinza"}
      />
    </div>
  );
}

function Chip({
  label,
  valor,
  tone,
}: {
  label: string;
  valor: string;
  tone: "azul" | "verde" | "vermelho" | "cinza";
}) {
  const cls =
    tone === "verde"
      ? "border-success/30 bg-success-soft text-success"
      : tone === "vermelho"
        ? "border-destructive/40 bg-destructive-soft text-destructive"
        : tone === "azul"
          ? "border-primary/30 bg-primary-soft text-primary"
          : "border-border bg-muted/40 text-muted-foreground";
  return (
    <div className={`rounded-xl border px-3 py-2 ${cls}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
        {label}
      </p>
      <p className="text-lg font-bold">{valor}</p>
    </div>
  );
}

// ────────────────────────────── PTP grid ─────────────────────────────
function PtpGrid({
  janelasPorCodigo,
}: {
  janelasPorCodigo: Map<string, PtpJanela>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
      <h3 className="text-base font-bold text-foreground md:text-lg">
        PTP Garrafas — 12 janelas
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Dia (J01–J06): 06:00 → 18:00 · Noite (J07–J12): 18:00 → 06:00
      </p>

      <div className="mt-4 space-y-4">
        {(() => {
          // Modelo LAZY: derivar turnos com dado a partir das janelas reais.
          const turnosComDado = Array.from(
            new Set(
              Array.from(janelasPorCodigo.values())
                .map((j) => derivarEscalaDaJanela(j.janelaCodigo)?.turno)
                .filter((t): t is Turno => Boolean(t)),
            ),
          );
          // Fallback: se não souber inferir turno, mostra "12x36 Dia/Noite"
          // (compat retroativa com folhas antigas).
          const turnosRender: Turno[] = turnosComDado.length
            ? turnosComDado
            : (["12x36 Dia", "12x36 Noite"] as Turno[]);
          return turnosRender.map((turno) => {
            const codigos = Array.from(janelasPorCodigo.values())
              .filter((j) => {
                const t = derivarEscalaDaJanela(j.janelaCodigo)?.turno;
                return t === turno || !t;
              })
              .map((j) => j.janelaCodigo);
            const codigosUnicos = Array.from(new Set(codigos));
            return (
              <div key={turno}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {turno}
                </p>
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/60 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Janela</th>
                        <th className="px-3 py-2">Horário</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-center">Itens c/ ocorrência</th>
                        <th className="px-3 py-2">Operador</th>
                        <th className="px-3 py-2">Assinatura</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {codigosUnicos.map((cod: string) => {
                        const def = PTP_JANELAS.find((d) => d.codigo === cod);
                        const j = janelasPorCodigo.get(cod);
                        return (
                          <PtpRow
                            key={cod}
                            codigo={cod}
                            rotulo={def?.rotulo ?? cod}
                            janela={j}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

function PtpRow({
  codigo,
  rotulo,
  janela,
}: {
  codigo: string;
  rotulo: string;
  janela: PtpJanela | undefined;
}) {
  if (!janela) {
    return (
      <tr className="bg-muted/10">
        <td className="px-3 py-2 font-mono text-xs font-bold text-muted-foreground">
          {codigo}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">{rotulo}</td>
        <td className="px-3 py-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            <MinusCircle className="h-3 w-3" /> Não registrada
          </span>
        </td>
        <td className="px-3 py-2 text-center text-xs text-muted-foreground">—</td>
        <td className="px-3 py-2 text-xs text-muted-foreground">—</td>
        <td className="px-3 py-2 text-xs text-muted-foreground">—</td>
      </tr>
    );
  }

  const itensComOcorrencia = janela.itens.filter(
    (i) => i.status === "houve_ocorrencia",
  );
  const totalQtd = itensComOcorrencia.reduce((s, i) => s + (i.quantidade ?? 0), 0);

  let badgeCls = "border-border bg-muted/40 text-muted-foreground";
  let Icon = Clock;
  if (janela.statusJanela === "sem_ocorrencia") {
    badgeCls = "border-success/30 bg-success-soft text-success";
    Icon = CheckCircle2;
  } else if (janela.statusJanela === "houve_ocorrencia") {
    badgeCls = "border-destructive/40 bg-destructive-soft text-destructive";
    Icon = AlertTriangle;
  } else if (janela.statusJanela === "nao_rodou") {
    badgeCls = "border-border bg-muted/40 text-muted-foreground";
    Icon = XCircle;
  } else if (janela.statusJanela === "rascunho") {
    badgeCls = "border-warning/40 bg-warning/15 text-warning-foreground";
    Icon = Clock;
  }

  return (
    <tr>
      <td className="px-3 py-2 font-mono text-xs font-bold text-foreground">
        {codigo}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{rotulo}</td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${badgeCls}`}
        >
          <Icon className="h-3 w-3" />
          {LABEL_PTP_STATUS[janela.statusJanela] ?? janela.statusJanela}
        </span>
      </td>
      <td className="px-3 py-2 text-center text-xs">
        {itensComOcorrencia.length === 0 ? (
          <span className="text-muted-foreground">0</span>
        ) : (
          <span className="font-semibold text-destructive">
            {itensComOcorrencia.length} ({totalQtd} un.)
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {janela.operadorNome || janela.operadorLogin || "—"}
      </td>
      <td className="px-3 py-2">
        {janela.assinaturaOperador?.dataUrl ? (
          <img
            src={janela.assinaturaOperador.dataUrl}
            alt="Assinatura do operador"
            className="h-8 w-auto rounded border border-border bg-white object-contain"
          />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

// ────────────────────────────── Limpeza ──────────────────────────────
function LimpezaTurnos({
  turnoPorCodigo,
}: {
  turnoPorCodigo: Map<Turno, LimpezaTurno>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
      <h3 className="text-base font-bold text-foreground md:text-lg">
        Limpeza Sala de Envase — turnos
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        21 itens oficiais · validação pelo líder do turno
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from(turnoPorCodigo.entries()).map(([turno, t]) => (
          <LimpezaCard key={turno} turno={turno} dado={t} />
        ))}
      </div>
    </div>
  );
}

function LimpezaCard({
  turno,
  dado,
}: {
  turno: Turno;
  dado: LimpezaTurno | undefined;
}) {
  if (!dado) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-5 text-center">
        <MinusCircle className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {turno}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sem registro do turno
        </p>
      </div>
    );
  }

  const realizados = dado.itens.filter((i) => i.status === "realizado").length;
  const naoRealizados = dado.itens.filter(
    (i) => i.status === "nao_realizado",
  ).length;
  const naoAplicaveis = dado.itens.filter(
    (i) => i.status === "nao_aplicavel",
  ).length;
  const naoRespondidos = dado.itens.filter((i) => i.status === null).length;
  const total = LIMPEZA_ITENS_DEF.length;

  let badgeCls = "border-border bg-muted/40 text-muted-foreground";
  if (dado.status === "validado")
    badgeCls = "border-success/30 bg-success-soft text-success";
  else if (dado.status === "aguardando_validacao")
    badgeCls = "border-warning/40 bg-warning/15 text-warning-foreground";
  else if (dado.status === "rascunho")
    badgeCls = "border-warning/40 bg-warning/15 text-warning-foreground";

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-foreground">{turno}</p>
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${badgeCls}`}
        >
          {LABEL_LIMPEZA_STATUS[dado.status] ?? dado.status}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Stat label="Realizados" value={realizados} total={total} tone="verde" />
        <Stat
          label="Não realizados"
          value={naoRealizados}
          total={total}
          tone={naoRealizados > 0 ? "vermelho" : "cinza"}
        />
        <Stat
          label="Não aplicáveis"
          value={naoAplicaveis}
          total={total}
          tone="cinza"
        />
        <Stat
          label="Sem resposta"
          value={naoRespondidos}
          total={total}
          tone={naoRespondidos > 0 ? "ambar" : "cinza"}
        />
      </div>

      {naoRealizados > 0 && (
        <details className="mt-3 rounded-md border border-destructive/30 bg-destructive-soft/40 p-2">
          <summary className="cursor-pointer text-xs font-bold text-destructive">
            Itens não realizados ({naoRealizados})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-foreground">
            {dado.itens
              .filter((i) => i.status === "nao_realizado")
              .map((i) => (
                <li key={i.codigo}>
                  <strong>#{i.codigo}</strong> · {i.grupo} · {i.secao} —{" "}
                  {i.descricao}
                </li>
              ))}
          </ul>
        </details>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="font-semibold text-muted-foreground">Operador</p>
          <p className="font-medium text-foreground">
            {dado.operadorNome || dado.operadorLogin || "—"}
          </p>
          {dado.assinaturaOperador?.dataUrl ? (
            <img
              src={dado.assinaturaOperador.dataUrl}
              alt="Assinatura do operador"
              className="mt-1 h-10 w-auto rounded border border-border bg-white object-contain"
            />
          ) : (
            <p className="mt-1 text-muted-foreground">Sem assinatura</p>
          )}
          {dado.operadorAssinouEm && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Em {formatarDataHora(dado.operadorAssinouEm)}
            </p>
          )}
        </div>
        <div>
          <p className="font-semibold text-muted-foreground">Líder</p>
          <p className="font-medium text-foreground">{dado.liderNome || "—"}</p>
          {dado.assinaturaLider?.dataUrl ? (
            <img
              src={dado.assinaturaLider.dataUrl}
              alt="Assinatura do líder"
              className="mt-1 h-10 w-auto rounded border border-border bg-white object-contain"
            />
          ) : (
            <p className="mt-1 text-muted-foreground">Sem assinatura</p>
          )}
          {dado.liderAssinouEm && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Em {formatarDataHora(dado.liderAssinouEm)}
            </p>
          )}
        </div>
      </div>

      {dado.observacao && (
        <div className="mt-3 rounded-md border border-border bg-card p-2 text-xs">
          <p className="font-semibold text-muted-foreground">Observação do turno</p>
          <p className="mt-0.5 whitespace-pre-line text-foreground">
            {dado.observacao}
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "verde" | "vermelho" | "cinza" | "ambar";
}) {
  const cls =
    tone === "verde"
      ? "text-success"
      : tone === "vermelho"
        ? "text-destructive"
        : tone === "ambar"
          ? "text-warning-foreground"
          : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`text-sm font-bold ${cls}`}>
        {value}
        <span className="text-[10px] font-normal text-muted-foreground">
          {" "}
          / {total}
        </span>
      </p>
    </div>
  );
}

// ────────────────────────────── Histórico ────────────────────────────
function HistoricoDialog({
  open,
  onClose,
  folhaDiaKey,
}: {
  open: boolean;
  onClose: () => void;
  folhaDiaKey: string;
}) {
  const { ptp, limpeza, loading, error } = useEdicoesVerso(folhaDiaKey, {
    enabled: open,
  });
  const total = ptp.length + limpeza.length;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico de edições do verso</DialogTitle>
          <DialogDescription>
            Trilha auditável de alterações em PTP e Limpeza desta folha.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : error ? (
          <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : total === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Nenhuma edição registrada neste verso.
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {ptp.map((e) => (
              <EdicaoPtpItem key={`p-${e.id}`} e={e} />
            ))}
            {limpeza.map((e) => (
              <EdicaoLimpezaItem key={`l-${e.id}`} e={e} />
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EdicaoPtpItem({ e }: { e: EdicaoVersoPtp }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-foreground">
          PTP · janela <span className="font-mono">{e.janelaCodigo}</span>
        </p>
        <p className="text-muted-foreground">{formatarDataHora(e.editadoEm)}</p>
      </div>
      <p className="mt-1 text-muted-foreground">
        Por <strong className="text-foreground">{e.editadoPorNome}</strong>{" "}
        ({e.editadoPorLogin})
      </p>
      {e.motivoEdicao && (
        <p className="mt-1 italic text-foreground">"{e.motivoEdicao}"</p>
      )}
    </div>
  );
}

function EdicaoLimpezaItem({ e }: { e: EdicaoVersoLimpeza }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-foreground">
          Limpeza · {e.turno}
        </p>
        <p className="text-muted-foreground">{formatarDataHora(e.editadoEm)}</p>
      </div>
      <p className="mt-1 text-muted-foreground">
        Por <strong className="text-foreground">{e.editadoPorNome}</strong>{" "}
        ({e.editadoPorLogin})
      </p>
      {e.motivoEdicao && (
        <p className="mt-1 italic text-foreground">"{e.motivoEdicao}"</p>
      )}
    </div>
  );
}

// silencia warning do TS sobre import não-usado se LABEL_LIMPEZA_ITEM_STATUS
// vier a ser usado em futuras visões detalhadas (mantido para parity).
void LABEL_LIMPEZA_ITEM_STATUS;
