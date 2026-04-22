import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Droplets, Lock, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "@/components/signature-pad";
import { TelaCarregando } from "@/components/tela-carregando";
import { useGuard } from "@/hooks/use-guard";
import { usePtpJanelas } from "@/hooks/use-ptp-janelas";
import { useLimpezaTurnos } from "@/hooks/use-limpeza-turnos";
import {
  buildFolhaDiaKey,
  calcularDataOperacional,
  formatarDataBR,
} from "@/lib/operacao/data-operacional";
import {
  PTP_JANELAS_POR_TURNO,
  VERSO_CONTEXTO_FIXO,
} from "@/lib/verso/constants";
import type { LimpezaTurno, PtpJanela } from "@/lib/verso/types";
import { formatarDataHora } from "@/lib/checklist/format";
import { toast } from "sonner";

type TurnoAtivo = "12x36 Dia" | "12x36 Noite";

export const Route = createFileRoute("/operador/verso")({
  head: () => ({
    meta: [
      { title: "Verso da folha — Operador" },
      {
        name: "description",
        content: "PTP de garrafas e checklist de limpeza da sala de envase L3.",
      },
    ],
  }),
  component: VersoLayout,
});

function VersoLayout() {
  const location = useLocation();

  if (location.pathname !== "/operador/verso") {
    return <Outlet />;
  }

  return <VersoHome />;
}

function VersoHome() {
  const { usuario, loading } = useGuard("operador");

  const equipe = usuario?.equipePadrao ?? null;
  const turno = usuario?.turnoPadrao ?? null;
  const data = calcularDataOperacional(equipe, turno);
  const folhaDiaKey = buildFolhaDiaKey(
    data,
    VERSO_CONTEXTO_FIXO.linha,
    VERSO_CONTEXTO_FIXO.maquina,
  );

  const ptp = usePtpJanelas(folhaDiaKey, data);
  const limpeza = useLimpezaTurnos(folhaDiaKey, data);

  if (loading || !usuario) return <TelaCarregando />;

  const turnoLogado = (turno === "12x36 Dia" || turno === "12x36 Noite"
    ? turno
    : null) as TurnoAtivo | null;

  // PTP: conta só as janelas do turno do operador (6 janelas).
  const codigosPtpDoTurno = turnoLogado ? PTP_JANELAS_POR_TURNO[turnoLogado] : [];
  const totalPtpTurno = codigosPtpDoTurno.length;
  const ptpConcluidasTurno = ptp.janelas.filter(
    (j) =>
      codigosPtpDoTurno.includes(j.janelaCodigo) &&
      j.statusJanela !== "pendente" &&
      j.statusJanela !== "rascunho",
  ).length;

  // Limpeza: conta itens respondidos do turno do operador (21 itens).
  const limpezaTurnoOperador = turnoLogado
    ? limpeza.turnos.find((t) => t.turno === turnoLogado)
    : undefined;
  const totalItensLimpeza = limpezaTurnoOperador?.itens.length ?? 21;
  const itensLimpezaRespondidos =
    limpezaTurnoOperador?.itens.filter((i) => i.status !== null).length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Verso da folha"
        subtitulo="PTP e limpeza da sala de envase"
        voltarPara="/operador"
      />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-10">
        <section className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Contexto operacional do dia
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Info titulo="Data" valor={formatarDataBR(data)} />
            <Info titulo="Turno" valor={turno ?? "—"} />
            <Info titulo="Equipe" valor={equipe ?? "—"} />
            <Info titulo="Linha" valor={VERSO_CONTEXTO_FIXO.linha} />
            <Info titulo="Área" valor={VERSO_CONTEXTO_FIXO.area} />
            <Info titulo="Máquina" valor={VERSO_CONTEXTO_FIXO.maquina} />
            <div className="col-span-2">
              <Info titulo="Equipamento" valor={VERSO_CONTEXTO_FIXO.equipamento} />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link
            to="/operador/verso/ptp"
            className="group flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-6 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md md:p-7"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <ClipboardList className="h-8 w-8" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">PTP Garrafas</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Monitoramento por janelas de horário (6 janelas no dia).
              </p>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {ptpConcluidasTurno}/{totalPtpTurno || 6} janelas registradas
              </p>
              {ptp.conflito && (
                <p className="mt-1 text-xs font-semibold text-destructive">
                  ⚠ Conflito de versão detectado — recarregue.
                </p>
              )}
            </div>
          </Link>

          <Link
            to="/operador/verso/limpeza"
            className="group flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-6 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md md:p-7"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Droplets className="h-8 w-8" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">Limpeza Sala de Envase</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Checklist operacional de limpeza da sala de envase L3.
              </p>
              {limpeza.conflito && (
                <p className="mt-1 text-xs font-semibold text-destructive">
                  ⚠ Conflito de versão detectado — recarregue.
                </p>
              )}
            </div>
          </Link>
        </div>

        {turnoLogado && (
          <section className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">
                Validação do Líder — {turnoLogado}
              </h2>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              O líder valida o turno após o operador concluir o PTP e a limpeza
              da sala de envase.
            </p>

            <BlocoValidacaoTurno
              turnoAlvo={turnoLogado}
              ptpJanelas={ptp.janelas}
              limpezaTurnos={limpeza.turnos}
              salvarTurno={limpeza.salvarTurno}
              usuarioLogin={usuario.usuario}
              usuarioNome={usuario.nome}
            />
          </section>
        )}
      </main>
    </div>
  );
}

function Info({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground md:text-base">{valor}</p>
    </div>
  );
}

// ─── Validação do Líder — por turno ──────────────────────────────────
interface BlocoValidacaoTurnoProps {
  turnoAlvo: TurnoAtivo;
  ptpJanelas: PtpJanela[];
  limpezaTurnos: LimpezaTurno[];
  salvarTurno: ReturnType<typeof useLimpezaTurnos>["salvarTurno"];
  usuarioLogin: string;
  usuarioNome: string;
  
}

function BlocoValidacaoTurno({
  turnoAlvo,
  ptpJanelas,
  limpezaTurnos,
  salvarTurno,
  usuarioLogin,
  usuarioNome,
}: BlocoValidacaoTurnoProps) {
  const [abrindo, setAbrindo] = useState(false);
  const [liderNome, setLiderNome] = useState(usuarioNome);
  const [assinaturaLider, setAssinaturaLider] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const codigosDoTurno = PTP_JANELAS_POR_TURNO[turnoAlvo];

  // PTP do turno (6 janelas)
  const janelasDoTurno = useMemo(
    () => ptpJanelas.filter((j) => codigosDoTurno.includes(j.janelaCodigo)),
    [ptpJanelas, codigosDoTurno],
  );
  const ptpRegistradas = janelasDoTurno.filter(
    (j) => j.statusJanela !== "pendente" && j.statusJanela !== "rascunho",
  ).length;
  const ptpOk = ptpRegistradas === codigosDoTurno.length;

  // Limpeza deste turno
  const limpezaTurno = limpezaTurnos.find((t) => t.turno === turnoAlvo);
  const limpezaConcluida =
    limpezaTurno?.status === "aguardando_validacao" ||
    limpezaTurno?.status === "validado";
  const turnoValidado = limpezaTurno?.status === "validado";

  const liberado = ptpOk && limpezaConcluida && !turnoValidado;

  // ─── Estado: já validado ──────────────────────────────────────────
  if (turnoValidado && limpezaTurno) {
    return (
      <div className="rounded-2xl border-2 border-success/40 bg-success/5 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <p className="text-base font-bold text-foreground">
              Líder {turnoAlvo}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Validado por{" "}
              <strong className="text-foreground">
                {limpezaTurno.liderNome ?? "—"}
              </strong>
              {limpezaTurno.liderAssinouEm && (
                <> em {formatarDataHora(limpezaTurno.liderAssinouEm)}</>
              )}
              .
            </p>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                {ptpRegistradas}/{codigosDoTurno.length} janelas do PTP
                registradas
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                Limpeza {turnoAlvo} concluída
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // ─── Estado: aberto para validação ────────────────────────────────
  const handleConfirmar = async () => {
    if (!liderNome.trim()) {
      toast.error("Informe o nome do líder.");
      return;
    }
    if (!assinaturaLider) {
      toast.error("Assine como líder para validar.");
      return;
    }
    if (!limpezaTurno) {
      toast.error("Turno de limpeza não encontrado.");
      return;
    }
    setSalvando(true);
    try {
      const agora = new Date().toISOString();
      const payload: LimpezaTurno = {
        ...limpezaTurno,
        status: "validado",
        liderNome: liderNome.trim(),
        assinaturaLider: {
          dataUrl: assinaturaLider,
          nome: liderNome.trim(),
          assinadoEm: agora,
        },
        liderAssinouEm: agora,
        ultimaEdicaoPorLogin: usuarioLogin,
        ultimaEdicaoPorNome: usuarioNome,
      };
      await salvarTurno(payload, {
        anterior: limpezaTurno,
        editadoPorLogin: usuarioLogin,
        editadoPorNome: usuarioNome,
        motivoEdicao: `Validação do líder — ${turnoAlvo}`,
      });
      toast.success(`Turno ${turnoAlvo} validado pelo líder.`);
      setAbrindo(false);
      setAssinaturaLider(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao validar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
            liberado
              ? "bg-primary-soft text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {liberado ? (
            <ShieldCheck className="h-7 w-7" />
          ) : (
            <Lock className="h-7 w-7" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-base font-bold text-foreground">
            Líder {turnoAlvo}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {liberado
              ? "Tudo pronto para validar este turno."
              : "Conclua os pré-requisitos abaixo para liberar."}
          </p>

          <ul className="mt-3 space-y-2 text-sm">
            <PreReqItem
              ok={ptpOk}
              labelOk={`${codigosDoTurno.length}/${codigosDoTurno.length} janelas do PTP do turno registradas`}
              labelPendente={`${ptpRegistradas}/${codigosDoTurno.length} janelas do PTP do turno registradas`}
            />
            <PreReqItem
              ok={limpezaConcluida}
              labelOk={`Limpeza ${turnoAlvo} concluída`}
              labelPendente={`Limpeza ${turnoAlvo} (aguardando conclusão)`}
            />
          </ul>

          {!abrindo && (
            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => setAbrindo(true)}
                disabled={!liberado}
                size="sm"
              >
                {liberado ? "Validar como líder" : "Bloqueado"}
              </Button>
            </div>
          )}

          {abrindo && (
            <div className="mt-4 rounded-xl border-2 border-primary bg-primary-soft p-4">
              <p className="text-sm font-semibold text-foreground">
                Validação — Líder {turnoAlvo}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li>
                  • {codigosDoTurno.length} janelas do PTP do turno serão
                  consideradas validadas.
                </li>
                <li>
                  • Limpeza do turno {turnoAlvo} será marcada como{" "}
                  <strong className="text-foreground">Validado</strong>.
                </li>
              </ul>

              <div className="mt-3">
                <Label htmlFor={`lider-${turnoAlvo}`}>Nome do líder *</Label>
                <Input
                  id={`lider-${turnoAlvo}`}
                  value={liderNome}
                  onChange={(e) => setLiderNome(e.target.value)}
                  className="mt-1.5 bg-background"
                  placeholder="Nome completo do líder"
                />
              </div>

              <div className="mt-3">
                <SignaturePad
                  value={assinaturaLider}
                  onChange={setAssinaturaLider}
                  label={`Assinatura do líder ${turnoAlvo} — ${liderNome || "..."}`}
                />
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAbrindo(false);
                    setAssinaturaLider(null);
                  }}
                  disabled={salvando}
                  size="sm"
                >
                  Cancelar
                </Button>
                <Button onClick={handleConfirmar} disabled={salvando} size="sm">
                  Confirmar validação
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreReqItem({
  ok,
  labelOk,
  labelPendente,
}: {
  ok: boolean;
  labelOk: string;
  labelPendente: string;
}) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      ) : (
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-warning text-[10px] font-bold text-warning">
          ✕
        </span>
      )}
      <span
        className={`text-xs ${ok ? "text-foreground" : "text-muted-foreground"}`}
      >
        {ok ? labelOk : labelPendente}
      </span>
    </li>
  );
}
