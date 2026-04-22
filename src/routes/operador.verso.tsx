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
import { TURNOS_ATIVOS_LIMPEZA, VERSO_CONTEXTO_FIXO } from "@/lib/verso/constants";
import type { LimpezaTurno } from "@/lib/verso/types";
import { formatarDataHora } from "@/lib/checklist/format";
import { toast } from "sonner";

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

  const ptpConcluidas = ptp.janelas.filter(
    (j) => j.statusJanela !== "pendente" && j.statusJanela !== "rascunho",
  ).length;
  const limpezaValidados = limpeza.turnos.filter((t) => t.status === "validado").length;
  const limpezaAguardando = limpeza.turnos.filter(
    (t) => t.status === "aguardando_validacao",
  ).length;

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
                Monitoramento por janelas de horário (12 janelas no dia).
              </p>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {ptpConcluidas}/12 janelas registradas
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
                Checklist por turno + validação do líder.
              </p>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {limpezaValidados}/{TURNOS_ATIVOS_LIMPEZA.length} turnos validados
                {limpezaAguardando > 0 && (
                  <span className="ml-2 text-warning">· {limpezaAguardando} aguardando líder</span>
                )}
              </p>
              {limpeza.conflito && (
                <p className="mt-1 text-xs font-semibold text-destructive">
                  ⚠ Conflito de versão detectado — recarregue.
                </p>
              )}
            </div>
          </Link>
        </div>

        <BlocoValidacaoLider
          ptpJanelas={ptp.janelas}
          limpezaTurnos={limpeza.turnos}
          ptpConcluidas={ptpConcluidas}
          salvarTurno={limpeza.salvarTurno}
          usuarioLogin={usuario.usuario}
          usuarioNome={usuario.nome}
        />
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

// ─── Validação do Líder ──────────────────────────────────────────────
interface BlocoValidacaoLiderProps {
  ptpJanelas: ReturnType<typeof usePtpJanelas>["janelas"];
  limpezaTurnos: LimpezaTurno[];
  ptpConcluidas: number;
  salvarTurno: ReturnType<typeof useLimpezaTurnos>["salvarTurno"];
  usuarioLogin: string;
  usuarioNome: string;
}

function BlocoValidacaoLider({
  ptpJanelas,
  limpezaTurnos,
  ptpConcluidas,
  salvarTurno,
  usuarioLogin,
  usuarioNome,
}: BlocoValidacaoLiderProps) {
  const [abrindo, setAbrindo] = useState(false);
  const [liderNome, setLiderNome] = useState(usuarioNome);
  const [assinaturaLider, setAssinaturaLider] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const ptpOk = ptpJanelas.length === 12 && ptpConcluidas === 12;

  // Status por turno ativo
  const statusPorTurno = useMemo(() => {
    return TURNOS_ATIVOS_LIMPEZA.map((tn) => {
      const t = limpezaTurnos.find((x) => x.turno === tn);
      return {
        turno: tn,
        registro: t,
        concluido:
          t?.status === "aguardando_validacao" || t?.status === "validado",
        validado: t?.status === "validado",
      };
    });
  }, [limpezaTurnos]);

  const limpezaTodaConcluida = statusPorTurno.every((s) => s.concluido);
  const tudoValidado =
    statusPorTurno.length > 0 && statusPorTurno.every((s) => s.validado);
  const liberado = ptpOk && limpezaTodaConcluida && !tudoValidado;

  // Estado já validado: mostrar bloco verde com info
  if (tudoValidado) {
    const primeiroValidado = statusPorTurno[0]?.registro;
    return (
      <section className="mt-6 rounded-2xl border-2 border-success/40 bg-success/5 p-5 shadow-sm md:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/15 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <p className="text-lg font-bold text-foreground">
              Folha validada pelo líder
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Validada por{" "}
              <strong className="text-foreground">
                {primeiroValidado?.liderNome ?? "—"}
              </strong>
              {primeiroValidado?.liderAssinouEm && (
                <> em {formatarDataHora(primeiroValidado.liderAssinouEm)}</>
              )}
              .
            </p>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {statusPorTurno.map((s) => (
                <li key={s.turno} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  Limpeza {s.turno} validada
                </li>
              ))}
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                12/12 janelas do PTP registradas
              </li>
            </ul>
          </div>
        </div>
      </section>
    );
  }

  const handleConfirmar = async () => {
    if (!liderNome.trim()) {
      toast.error("Informe o nome do líder.");
      return;
    }
    if (!assinaturaLider) {
      toast.error("Assine como líder para validar.");
      return;
    }
    setSalvando(true);
    try {
      const agora = new Date().toISOString();
      const turnosParaValidar = statusPorTurno
        .filter((s) => s.registro && !s.validado)
        .map((s) => s.registro!) as LimpezaTurno[];

      // Aplica em série para evitar conflitos de versão concorrentes.
      for (const t of turnosParaValidar) {
        const payload: LimpezaTurno = {
          ...t,
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
          anterior: t,
          editadoPorLogin: usuarioLogin,
          editadoPorNome: usuarioNome,
          motivoEdicao: "Validação do líder (folha completa)",
        });
      }
      toast.success("Folha validada pelo líder.");
      setAbrindo(false);
      setAssinaturaLider(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao validar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border-2 border-border bg-card p-5 shadow-sm md:p-6">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl ${
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
          <p className="text-lg font-bold text-foreground">Validação do Líder</p>
          <p className="mt-1 text-sm text-muted-foreground">
            O líder valida toda a folha (PTP + limpeza) após o operador concluir
            todos os itens.
          </p>

          {/* Checklist de pré-requisitos */}
          <ul className="mt-4 space-y-2 text-sm">
            <PreReqItem
              ok={ptpOk}
              labelOk="12/12 janelas do PTP registradas"
              labelPendente={`${ptpConcluidas}/12 janelas do PTP registradas`}
            />
            {statusPorTurno.map((s) => (
              <PreReqItem
                key={s.turno}
                ok={s.concluido}
                labelOk={`Limpeza ${s.turno} concluída`}
                labelPendente={`Limpeza ${s.turno} (aguardando conclusão)`}
              />
            ))}
          </ul>

          {/* Botão / painel */}
          {!abrindo && (
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {!liberado && (
                <p className="text-xs italic text-muted-foreground">
                  Conclua todos os itens acima para liberar a validação.
                </p>
              )}
              <Button
                onClick={() => setAbrindo(true)}
                disabled={!liberado}
                className="sm:ml-auto"
              >
                {liberado ? "Validar como líder" : "Bloqueado"}
              </Button>
            </div>
          )}

          {abrindo && (
            <div className="mt-5 rounded-xl border-2 border-primary bg-primary-soft p-4">
              <p className="text-sm font-semibold text-foreground">
                Resumo da validação
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li>• 12 janelas do PTP serão consideradas validadas pelo líder.</li>
                <li>
                  •{" "}
                  {
                    statusPorTurno.filter((s) => s.concluido && !s.validado)
                      .length
                  }{" "}
                  turno(s) de limpeza serão marcados como{" "}
                  <strong className="text-foreground">Validado</strong>.
                </li>
              </ul>

              <div className="mt-4">
                <Label htmlFor="lider-home">Nome do líder *</Label>
                <Input
                  id="lider-home"
                  value={liderNome}
                  onChange={(e) => setLiderNome(e.target.value)}
                  className="mt-1.5 bg-background"
                  placeholder="Nome completo do líder"
                />
              </div>

              <div className="mt-4">
                <SignaturePad
                  value={assinaturaLider}
                  onChange={setAssinaturaLider}
                  label={`Assinatura do líder — ${liderNome || "..."}`}
                />
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAbrindo(false);
                    setAssinaturaLider(null);
                  }}
                  disabled={salvando}
                >
                  Cancelar
                </Button>
                <Button onClick={handleConfirmar} disabled={salvando}>
                  Confirmar validação
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
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
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
      ) : (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-warning text-[10px] font-bold text-warning">
          ✕
        </span>
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>
        {ok ? labelOk : labelPendente}
      </span>
    </li>
  );
}
