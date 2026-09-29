import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, Lock, PackageCheck, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import {
  EmpacotadoraHoraForm,
  type EntradaHoraEmpacotadora,
} from "@/components/producao/empacotadora-hora-form";
import { EmpacotadoraVersoSecoes } from "@/components/producao/empacotadora-verso-secoes";
import { AssinaturaOperadorTurno } from "@/components/producao/assinatura-operador-turno";
import { AssinaturaOperadorHistorico } from "@/components/producao/assinatura-operador-historico";
import { SignaturePad } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calcularAcumulado, calcularResumoHoraXHora, produtoAnteriorDoTurno } from "@/lib/producao/acumulado";
import { ehHoraDeChecagemLider } from "@/lib/producao/constants";
import { horaEstaNoPrazo, horaTerminou } from "@/lib/producao/horario";
import {
  PALETIZACAO_EMPACOTADORA,
  type TamanhoProdutoEmpacotadora,
} from "@/lib/producao/paletizacao";
import type { ProducaoHora } from "@/lib/producao/types";
import type { Usuario, Turno } from "@/lib/checklist/types";
import type { MaquinaOperacional } from "@/lib/maquinas/catalogo";
import { formatarDataBR } from "@/lib/operacao/data-operacional";
import { rotuloTempoParada } from "@/lib/producao/perda-cadencia";

type MaquinaEmpacotadora = Extract<MaquinaOperacional, { tipo: "empacotadora" }>;

interface Props {
  usuario: Usuario;
  maquina: MaquinaEmpacotadora;
  turno: Turno;
  data: string;
  folhaDiaKey: string;
  ehExtra: boolean;
  codigosDoTurno: string[];
  horas: ProducaoHora[];
  conflito: boolean;
  error: string | null;
  salvarHora: (
    hora: ProducaoHora,
    opts: {
      anterior: ProducaoHora;
      editadoPorLogin: string;
      editadoPorNome: string;
    },
  ) => Promise<void>;
  assinarHora: (
    hora: ProducaoHora,
    assinatura: string,
    nomeLider: string,
  ) => Promise<void>;
  assinarTurnoOperador: (hora: ProducaoHora, assinatura: string) => Promise<void>;
}

function jaSalva(hora: ProducaoHora): boolean {
  return Boolean(
    hora.finalizadoEm || (hora.createdAt && (hora.naoRodou || typeof hora.quantidade === "number")),
  );
}

function tamanhoDoCatalogo(valor: string | null): TamanhoProdutoEmpacotadora | null {
  return PALETIZACAO_EMPACOTADORA.some((item) => item.tamanho === valor)
    ? (valor as TamanhoProdutoEmpacotadora)
    : null;
}

function valorInicial(hora: ProducaoHora) {
  return {
    tamanhoProduto: tamanhoDoCatalogo(hora.produtoTamanho),
    sabor: hora.produtoSabor,
    meta: hora.meta,
    paletesCompletos: hora.paletesCompletos ?? 0,
    quebraPacotes: hora.quebraPacotes ?? 0,
    pacotesPorPalete: hora.pacotesPorPalete ?? null,
    quantidade: hora.quantidade ?? 0,
    tempoParadaMin: hora.tempoParadaMin,
    tempoParadaMetodo: hora.tempoParadaMetodo ?? null,
    motivoParadaCodigo: hora.motivoParadaCodigo ?? null,
    motivoParada: hora.observacao,
    tipoSetup: hora.eventos.includes("troca_tamanho")
      ? ("troca_tamanho" as const)
      : hora.eventos.includes("troca_sabor")
        ? ("troca_sabor" as const)
        : null,
  };
}

/** Frente da folha horária da empacotadora; o verso é integrado na segunda aba. */
export function EmpacotadoraRelatorio({
  usuario,
  maquina,
  turno,
  data,
  folhaDiaKey,
  ehExtra,
  codigosDoTurno,
  horas,
  conflito,
  error,
  salvarHora,
  assinarHora: assinarHoraAutenticada,
  assinarTurnoOperador,
}: Props) {
  const [horaSelecionada, setHoraSelecionada] = useState<string | null>(null);
  const [agoraEpoch, setAgoraEpoch] = useState(() => Date.now());
  useEffect(() => {
    const atualizarRelogio = () => setAgoraEpoch(Date.now());
    const timer = window.setInterval(atualizarRelogio, 15_000);
    document.addEventListener("visibilitychange", atualizarRelogio);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", atualizarRelogio);
    };
  }, []);
  const porCodigo = useMemo(() => new Map(horas.map((hora) => [hora.horaCodigo, hora])), [horas]);
  const resumo = useMemo(
    () => calcularResumoHoraXHora(horas, codigosDoTurno),
    [horas, codigosDoTurno],
  );
  const acumulados = useMemo(
    () => new Map(calcularAcumulado(horas).map((hora) => [hora.horaCodigo, hora.quantidadeAcumulada])),
    [horas],
  );
  const selecionada = horaSelecionada ? porCodigo.get(horaSelecionada) : null;
  const produtoAnterior = horaSelecionada
    ? produtoAnteriorDoTurno(horas, codigosDoTurno, horaSelecionada)
    : null;

  async function confirmarHora(base: ProducaoHora, entrada: EntradaHoraEmpacotadora) {
    if (error || conflito) {
      throw new Error("Não foi possível confirmar a folha atual. Recarregue e tente novamente.");
    }
    if (jaSalva(base)) throw new Error("Esta hora já foi confirmada.");
    if (!horaEstaNoPrazo(data, base.horaCodigo)) {
      throw new Error("Confirme a hora entre seu encerramento e os 20 minutos seguintes.");
    }
    const nova: ProducaoHora = {
      ...base,
      turno,
      meta: entrada.meta,
      quantidade: entrada.quantidade,
      paletesCompletos: entrada.paletesCompletos,
      quebraPacotes: entrada.quebraPacotes,
      pacotesPorPalete: entrada.pacotesPorPalete,
      naoRodou: entrada.quantidade === 0,
      tempoParadaMin: entrada.tempoParadaMin,
      tempoParadaMetodo: entrada.tempoParadaMetodo,
      motivoParadaCodigo: entrada.motivoParadaCodigo,
      reiniciaAcumulado: entrada.tipoSetup !== null,
      motivoReinicio: entrada.tipoSetup,
      eventos: entrada.tipoSetup ? [entrada.tipoSetup] : [],
      produtoSabor: entrada.sabor,
      produtoTamanho: entrada.tamanhoProduto,
      observacao: entrada.motivoParada,
      operadorLogin: usuario.usuario,
      operadorNome: usuario.nome,
      operadorUserId: usuario.userId ?? null,
      ultimaEdicaoPorLogin: usuario.usuario,
      ultimaEdicaoPorNome: usuario.nome,
    };
    await salvarHora(nova, {
      anterior: base,
      editadoPorLogin: usuario.usuario,
      editadoPorNome: usuario.nome,
    });
    toast.success(`${base.horaInicio}–${base.horaFim}: hora confirmada no Supabase.`);
  }

  async function assinarHora(base: ProducaoHora, assinatura: string, nomeLider: string) {
    if (error || conflito) {
      throw new Error("Não foi possível confirmar a folha atual. Recarregue e tente novamente.");
    }
    if (!jaSalva(base) || !ehHoraDeChecagemLider(base.horaCodigo)) {
      throw new Error(
        "A checagem do líder só pode ser assinada na hora indicada após o lançamento.",
      );
    }
    if (base.assinaturaLider?.dataUrl) {
      throw new Error("O líder já assinou esta checagem.");
    }
    if (base.finalizadoEm && !base.assinaturaOperador?.dataUrl) {
      throw new Error("O operador deve assinar o turno antes da validação do líder.");
    }
    await assinarHoraAutenticada(base, assinatura, nomeLider);
    toast.success(`Checagem do líder de ${base.horaInicio}–${base.horaFim} assinada.`);
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo={`Relatório operacional — ${maquina.nome}`}
        subtitulo={`Folha de ${formatarDataBR(data)} · ${turno}${ehExtra ? " · EXTRA" : ""}`}
        voltarPara="/operador"
      />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-10">
        {(error || conflito) && (
          <p className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
            {error ?? "Outra pessoa alterou a folha. Recarregue antes de lançar uma hora."}
          </p>
        )}
        <Tabs defaultValue="frente">
          <TabsList className="mb-5 grid w-full grid-cols-2">
            <TabsTrigger value="frente">Hora x Hora</TabsTrigger>
            <TabsTrigger value="verso">Bobinas e fechamento</TabsTrigger>
          </TabsList>
          <TabsContent value="frente">
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Resumo titulo="Horas salvas" valor={`${resumo.lancadas}/${resumo.total}`} />
              <Resumo
                titulo="Pacotes no turno"
                valor={resumo.totalProduzido.toLocaleString("pt-BR")}
              />
              <Resumo
                titulo="Meta atingida"
                valor={resumo.atingimentoPct === null ? "—" : `${resumo.atingimentoPct}%`}
              />
              <Resumo
                titulo="Perda equivalente"
                valor={`${resumo.totalPerdaEquivalenteMin} min${resumo.horasSemCalculo ? ` · ${resumo.horasSemCalculo} h sem cálculo` : ""}${resumo.totalParadaInformadaMin ? ` · ${resumo.totalParadaInformadaMin} min históricos` : ""}`}
              />
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Em até 20 minutos após o fim de cada hora, informe paletes completos e a quebra. O app calcula os
              pacotes e pede uma conferência antes de salvar. Marque a troca de sabor ou tamanho
              na primeira hora do produto novo para reiniciar o acumulado.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {codigosDoTurno.map((codigo) => {
                const hora = porCodigo.get(codigo);
                if (!hora) return null;
                const salva = jaSalva(hora);
                const iniciou = horaTerminou(data, codigo, agoraEpoch);
                const noPrazo = horaEstaNoPrazo(data, codigo, agoraEpoch);
                const disponivel = salva || noPrazo;
                return (
                  <button
                    key={codigo}
                    type="button"
                    disabled={!disponivel}
                    onClick={() => setHoraSelecionada(codigo)}
                    className="rounded-2xl border-2 border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-lg font-bold text-foreground">
                        {hora.horaInicio} às {hora.horaFim}
                      </p>
                      <span className="text-xs font-bold text-muted-foreground">
                        {salva ? (
                          <PackageCheck className="h-5 w-5 text-success" aria-label="Salva" />
                        ) : noPrazo ? (
                          <Clock className="h-5 w-5" aria-label="Pendente" />
                        ) : (
                          <Lock className="h-5 w-5" aria-label={iniciou ? "Prazo encerrado" : "Aguardando"} />
                        )}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <Dado
                        rotulo="Produção"
                        valor={
                          salva ? `${(hora.quantidade ?? 0).toLocaleString("pt-BR")} pacotes` : "—"
                        }
                      />
                      <Dado
                        rotulo="Paletes + quebra"
                        valor={
                          salva
                            ? `${hora.paletesCompletos ?? "—"} + ${hora.quebraPacotes ?? "—"}`
                            : "—"
                        }
                      />
                      <Dado
                        rotulo={rotuloTempoParada(hora.tempoParadaMetodo, hora.tempoParadaMin)}
                        valor={salva && hora.tempoParadaMin !== null ? `${hora.tempoParadaMin} min` : "—"}
                      />
                      <Dado
                        rotulo="Acumulado do produto"
                        valor={
                          salva && typeof acumulados.get(codigo) === "number"
                            ? acumulados.get(codigo)!.toLocaleString("pt-BR")
                            : "—"
                        }
                      />
                    </div>
                    {salva && (hora.produtoSabor || hora.produtoTamanho) && (
                      <p className="mt-2 text-xs font-medium text-foreground">
                        Produto: {[hora.produtoSabor, hora.produtoTamanho].filter(Boolean).join(" ")}
                      </p>
                    )}
                    {salva && ehHoraDeChecagemLider(codigo) && (
                      <p
                        className={`mt-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${hora.assinaturaOperador?.dataUrl ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        {hora.assinaturaOperador?.dataUrl ? "Operador assinou" : "Assinatura do operador pendente"}
                      </p>
                    )}
                    {salva && ehHoraDeChecagemLider(codigo) && (
                      <p
                        className={`mt-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${hora.assinaturaLider?.dataUrl ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        {hora.assinaturaLider?.dataUrl
                          ? `Líder assinou${hora.liderNome ? ` · ${hora.liderNome}` : ""}`
                          : "Checagem do líder pendente"}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </TabsContent>
          <TabsContent value="verso" forceMount>
            <EmpacotadoraVersoSecoes
              usuario={usuario}
              turno={turno}
              data={data}
              folhaDiaKey={folhaDiaKey}
              maquina={maquina}
            />
          </TabsContent>
        </Tabs>
        <AssinaturaOperadorHistorico
          dataAtual={data}
          maquina={maquina}
          operadorUserId={usuario.userId}
        />
      </main>

      <Dialog open={!!selecionada} onOpenChange={(aberto) => !aberto && setHoraSelecionada(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {selecionada && (
            <div className="space-y-4">
              <EmpacotadoraHoraForm
                key={`${maquina.id}-${selecionada.horaCodigo}`}
                maquina={maquina.nome}
                produtoAnterior={produtoAnterior}
                horaRotulo={`${selecionada.horaInicio} às ${selecionada.horaFim}`}
                jaSalvo={jaSalva(selecionada)}
                valorInicial={valorInicial(selecionada)}
                onSalvar={(entrada) => confirmarHora(selecionada, entrada)}
              />
              {ehHoraDeChecagemLider(selecionada.horaCodigo) && (
                <AssinaturaOperadorTurno
                  hora={selecionada}
                  operadorUserId={usuario.userId}
                  onAssinar={(assinatura) => assinarTurnoOperador(selecionada, assinatura)}
                />
              )}
              {ehHoraDeChecagemLider(selecionada.horaCodigo) && (
                <ChecagemLiderEmpacotadora
                  key={`lider-${maquina.id}-${selecionada.horaCodigo}`}
                  hora={selecionada}
                  onAssinar={(assinatura, nomeLider) => assinarHora(selecionada, assinatura, nomeLider)}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChecagemLiderEmpacotadora({
  hora,
  onAssinar,
}: {
  hora: ProducaoHora;
  onAssinar: (assinatura: string, nomeLider: string) => Promise<void>;
}) {
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [nomeLider, setNomeLider] = useState("");
  const [salvando, setSalvando] = useState(false);

  if (!jaSalva(hora)) {
    return (
      <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        Checagem do líder disponível depois de salvar a produção desta hora.
      </p>
    );
  }

  if (hora.assinaturaLider?.dataUrl) {
    return (
      <section className="space-y-2 rounded-xl border border-success/40 bg-success-soft/40 p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-success">
          <ShieldCheck className="h-5 w-5" /> Checagem do líder concluída
        </p>
        <p className="text-sm text-foreground">
          {hora.liderNome ?? hora.assinaturaLider.nome}
          {hora.liderAssinouEm
            ? ` · ${new Date(hora.liderAssinouEm).toLocaleString("pt-BR", { timeZone: "America/Manaus" })}`
            : ""}
        </p>
        <img
          src={hora.assinaturaLider.dataUrl}
          alt={`Assinatura de ${hora.liderNome ?? hora.assinaturaLider.nome}`}
          className="max-h-28 max-w-full rounded-md border border-border bg-white object-contain"
        />
      </section>
    );
  }

  if (hora.finalizadoEm && !hora.assinaturaOperador?.dataUrl) {
    return (
      <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
        Aguardando a assinatura do operador para o líder validar este turno.
      </p>
    );
  }

  async function confirmar() {
    if (!assinatura || !nomeLider.trim() || salvando) {
      toast.error("Informe o nome e colha a assinatura do líder antes de confirmar.");
      return;
    }
    setSalvando(true);
    try {
      await onAssinar(assinatura, nomeLider);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar a assinatura.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-primary/30 bg-primary-soft/30 p-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <ShieldCheck className="h-5 w-5 text-primary" /> Checagem do líder
        </p>
        <p className="text-xs text-muted-foreground">
          Após conferir o turno, o líder informa seu nome e assina neste tablet.
        </p>
      </div>
      <Label htmlFor="nome-lider-empacotadora">Nome do líder que assina</Label>
      <Input
        id="nome-lider-empacotadora"
        value={nomeLider}
        onChange={(e) => setNomeLider(e.target.value)}
        maxLength={120}
        placeholder="Nome completo"
        className="h-12 text-base"
      />
      <SignaturePad
        label="Assinatura do líder"
        ajuda="O líder desenha aqui após conferir a produção do turno."
        value={assinatura}
        onChange={setAssinatura}
        altura={150}
      />
      <Button
        type="button"
        className="h-12 w-full"
        disabled={salvando}
        onClick={() => void confirmar()}
      >
        {salvando ? "Salvando assinatura..." : "Confirmar checagem do líder"}
      </Button>
    </section>
  );
}

function Resumo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-xl font-bold text-foreground">{valor}</p>
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{rotulo}</p>
      <p className="font-semibold text-foreground">{valor}</p>
    </div>
  );
}
