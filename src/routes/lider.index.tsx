import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Farol } from "@/components/farol";
import { TelaCarregando } from "@/components/tela-carregando";
import { useGuard } from "@/hooks/use-guard";
import { useChecklistsRemote } from "@/hooks/use-storage";
import { supabase } from "@/integrations/supabase/client";
import { montarFarol, ROTINA_ENCHEDORA_3, type CelulaFarol } from "@/lib/farol/farol";
import { levantarPendencias, type Pendencia } from "@/lib/farol/pendencias";
import { buscarPlanos } from "@/lib/farol/planos-storage";
import {
  finalizarValidacaoSessao,
  novoFechamentoId,
  type SolicitacaoFinalizacao,
} from "@/lib/farol/validacao-storage";
import type { PlanoAcao } from "@/lib/farol/planos-types";
import { PendenciasAbertas } from "@/components/pendencias-abertas";
import { PlanoAcaoDialog } from "@/components/plano-acao-dialog";
import { calcularDataOperacional, formatarDataBR } from "@/lib/operacao/data-operacional";
import {
  limpezaTurnoFromRow,
  ptpJanelaFromRow,
  type LimpezaTurnoRow,
  type PtpJanelaRow,
} from "@/lib/verso/mappers";
import type { LimpezaTurno, PtpJanela } from "@/lib/verso/types";
import { janelasPtpDoTurnoEquipe } from "@/lib/operacao/escalas";
import { ValidarPendenciaDialog } from "@/components/validar-pendencia-dialog";

export const Route = createFileRoute("/lider/")({
  head: () => ({
    meta: [
      { title: "Farol — Liderança" },
      {
        name: "description",
        content: "Farol do turno, validações pendentes e itens não conformes da liderança.",
      },
    ],
  }),
  component: LiderHome,
});

function LiderHome() {
  const { usuario, loading } = useGuard("lider");
  const {
    data: checklists,
    loading: carregandoChecklists,
    error: erroChecklists,
  } = useChecklistsRemote({ realtime: true });

  const [limpezas, setLimpezas] = useState<LimpezaTurno[]>([]);
  const [celulaAberta, setCelulaAberta] = useState<CelulaFarol | null>(null);
  const [planos, setPlanos] = useState<PlanoAcao[]>([]);
  const [pendenciaAberta, setPendenciaAberta] = useState<Pendencia | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [validando, setValidando] = useState<string | null>(null);
  const [pendenciaValidacao, setPendenciaValidacao] = useState<Pendencia | null>(null);
  const [erroValidacao, setErroValidacao] = useState("");
  const idsFechamento = useRef(new Map<string, string>());
  const [aviso, setAviso] = useState("");

  // Mesma armadilha já corrigida na tela da GI, e que eu tinha deixado passar
  // aqui: enquanto limpezas e planos não chegam, as duas filas renderizam
  // vazias e a tela anuncia "Nada aguardando validação" — com 55 em aberto.
  // Só travam a primeira carga; recarregar não pisca a tela.
  const [carregandoLimpezas, setCarregandoLimpezas] = useState(true);
  const [carregandoPlanos, setCarregandoPlanos] = useState(true);

  // PTP alimenta a coluna própria no farol.
  const [ptp, setPtp] = useState<PtpJanela[]>([]);
  const [carregandoPtp, setCarregandoPtp] = useState(true);
  const [operadoresEquipe, setOperadoresEquipe] = useState<ReadonlySet<string>>(new Set());
  const [carregandoEquipe, setCarregandoEquipe] = useState(true);
  const [erroEquipe, setErroEquipe] = useState("");
  const [erroLimpezas, setErroLimpezas] = useState("");
  const [erroPlanos, setErroPlanos] = useState("");
  const [erroPtp, setErroPtp] = useState("");

  // Data operacional respeita a regra de madrugada: no turno da noite, antes
  // do fim do turno, a folha ainda é a do dia anterior.
  const hoje = useMemo(
    () => calcularDataOperacional(usuario?.equipePadrao, usuario?.turnoPadrao),
    [usuario?.equipePadrao, usuario?.turnoPadrao],
  );

  // O líder chega no turno e precisa olhar o que acabou de fechar, não só o
  // que está aberto. Por isso a data é navegável.
  const [dataSel, setDataSel] = useState<string | null>(null);

  /**
   * Abrir no dia corrente dava, quase sempre, uma parede de "turno em
   * andamento": às 8h da manhã nada foi lançado ainda, e o líder teria que
   * caçar no calendário o dia que teve não conformidade. Foi a reclamação do
   * Lucas, e ela está certa.
   *
   * Então a tela abre no último dia da EQUIPE DELE que tem registro. Quando
   * o turno de hoje começa a ser preenchido, ele passa a ser o mais recente e
   * a tela volta sozinha para o presente.
   */
  const ultimoDiaComDado = useMemo(() => {
    const datas = [
      ...checklists
        .filter((c) => !usuario?.equipePadrao || c.contexto.equipe === usuario.equipePadrao)
        .map((c) => c.contexto.data),
      ...limpezas.map((l) => l.dataOperacao),
    ].filter((d) => d <= hoje);
    return datas.length > 0 ? datas.reduce((a, b) => (a > b ? a : b)) : null;
  }, [checklists, limpezas, hoje, usuario?.equipePadrao]);

  const data = dataSel ?? ultimoDiaComDado ?? hoje;
  const mostrandoDiaAnterior = data !== hoje;
  const janelasEsperadas = useMemo(
    () => janelasPtpDoTurnoEquipe(usuario?.turnoPadrao, usuario?.equipePadrao),
    [usuario?.turnoPadrao, usuario?.equipePadrao],
  );

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      if (!usuario?.equipePadrao) {
        setOperadoresEquipe(new Set());
        setErroEquipe("Seu perfil de Lideranca nao possui equipe definida.");
        setCarregandoEquipe(false);
        return;
      }
      setErroEquipe("");
      const { data: perfis, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("active", true)
        .eq("equipe_padrao", usuario.equipePadrao);
      if (cancelado) return;
      if (error) {
        console.error("[lider] equipe:", error);
        setErroEquipe("Nao foi possivel confirmar a equipe deste lider.");
        setCarregandoEquipe(false);
        return;
      }
      setOperadoresEquipe(
        new Set(((perfis ?? []) as Array<{ id: string }>).map((perfil) => perfil.id)),
      );
      setCarregandoEquipe(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [usuario?.equipePadrao]);

  const irParaDia = (passos: number) => {
    const d = new Date(`${data}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + passos);
    setDataSel(d.toISOString().slice(0, 10));
  };

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      setErroLimpezas("");
      // NÃO desestruturar como `data`: sombrearia a data selecionada acima.
      const { data: linhasLimpeza, error } = await supabase
        .from("limpeza_turnos" as never)
        .select("*")
        .order("data_operacao", { ascending: false });
      if (cancelado) return;
      if (error) {
        console.error("[lider] limpezas:", error);
        setErroLimpezas("Nao foi possivel carregar a limpeza operacional.");
        setCarregandoLimpezas(false);
        return;
      }
      setLimpezas(((linhasLimpeza ?? []) as unknown as LimpezaTurnoRow[]).map(limpezaTurnoFromRow));
      setCarregandoLimpezas(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      setErroPlanos("");
      try {
        const p = await buscarPlanos();
        if (!cancelado) setPlanos(p);
      } catch (error) {
        console.error("[lider] planos:", error);
        if (!cancelado) setErroPlanos("Nao foi possivel carregar os planos de acao.");
      } finally {
        if (!cancelado) setCarregandoPlanos(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      setErroPtp("");
      // Desde o início oficial do piloto: ocorrências PTP continuam abertas
      // depois que o dia vira e precisam alimentar o plano de ação.
      const { data: linhasPtp, error } = await supabase
        .from("ptp_janelas" as never)
        .select("*")
        .gte(
          "data_operacao",
          data < ROTINA_ENCHEDORA_3.vigenteDesde ? data : ROTINA_ENCHEDORA_3.vigenteDesde,
        )
        .lte("data_operacao", data);
      if (cancelado) return;
      if (error) {
        console.error("[lider] ptp:", error);
        setErroPtp("Nao foi possivel carregar o PTP.");
        setCarregandoPtp(false);
        return;
      }
      setPtp(((linhasPtp ?? []) as unknown as PtpJanelaRow[]).map(ptpJanelaFromRow));
      setCarregandoPtp(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [data, recarga]);

  // O passivo: tudo que continua aberto hoje, de qualquer data.
  const pendencias = useMemo(
    () =>
      levantarPendencias({
        checklists,
        limpezas,
        ptp,
        planos,
        hoje,
        turno: usuario?.turnoPadrao,
        equipe: usuario?.equipePadrao,
        ptpJanelasEsperadas: janelasEsperadas,
        operadorUserIds: operadoresEquipe,
      }),
    [
      checklists,
      limpezas,
      ptp,
      planos,
      hoje,
      usuario?.turnoPadrao,
      usuario?.equipePadrao,
      janelasEsperadas,
      operadoresEquipe,
    ],
  );

  const linhas = useMemo(
    () =>
      montarFarol({
        checklists,
        limpezas,
        ptp,
        data,
        hoje,
        pendencias,
        turno: usuario?.turnoPadrao,
        equipe: usuario?.equipePadrao,
        ptpJanelasEsperadas: janelasEsperadas,
        operadorUserIds: operadoresEquipe,
      }),
    [
      checklists,
      limpezas,
      ptp,
      data,
      hoje,
      pendencias,
      usuario?.turnoPadrao,
      usuario?.equipePadrao,
      janelasEsperadas,
      operadoresEquipe,
    ],
  );

  const validar = (p: Pendencia) => {
    if (p.tipo !== "validacao") return;
    setErroValidacao("");
    setPendenciaValidacao(p);
  };

  const confirmarValidacao = async (assinatura: string) => {
    const p = pendenciaValidacao;
    if (!usuario || !p) return;
    setValidando(p.chave);
    setErroValidacao("");
    const fechamentoId = idsFechamento.current.get(p.chave) ?? novoFechamentoId();
    idsFechamento.current.set(p.chave, fechamentoId);
    const solicitacao: SolicitacaoFinalizacao = {
      fechamentoId,
      checklist:
        p.origemTipo === "checklist"
          ? { id: p.origemId, assinaturaDataUrl: assinatura }
          : undefined,
      limpeza:
        p.origemTipo === "limpeza" ? { id: p.origemId, assinaturaDataUrl: assinatura } : undefined,
    };
    const r = await finalizarValidacaoSessao(solicitacao);
    setValidando(null);
    if (!r.ok) {
      setErroValidacao(r.erro);
      return;
    }
    idsFechamento.current.delete(p.chave);
    setPendenciaValidacao(null);
    setAviso(
      `Validado por ${r.resultado.ator.nome} às ${new Date(r.resultado.validadoEm).toLocaleTimeString("pt-BR", { timeZone: "America/Manaus", hour: "2-digit", minute: "2-digit" })}.`,
    );
    setRecarga((n) => n + 1);
  };

  if (loading || !usuario) return <TelaCarregando />;

  const erroDados = erroChecklists || erroEquipe || erroLimpezas || erroPlanos || erroPtp;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Liderança"
        subtitulo={`Equipe ${usuario.equipePadrao ?? "—"} · ${usuario.turnoPadrao ?? "—"} · Linha 3 · ${formatarDataBR(data)}`}
      />
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => irParaDia(-1)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-accent"
          >
            ← Dia anterior
          </button>
          <input
            type="date"
            value={data}
            onChange={(e) => setDataSel(e.target.value || null)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
            aria-label="Data do farol"
          />
          <button
            type="button"
            onClick={() => irParaDia(1)}
            disabled={data >= hoje}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-40"
          >
            Próximo dia →
          </button>
          {mostrandoDiaAnterior && (
            <button
              type="button"
              onClick={() => setDataSel(hoje)}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              Ir para hoje
            </button>
          )}
        </div>

        {/* Dizer POR QUE não está mostrando hoje. Sem isto o líder acha que a
            tela está atrasada, em vez de entender que hoje ainda não teve
            lançamento da equipe dele. */}
        {mostrandoDiaAnterior && !dataSel && (
          <p className="mb-4 rounded-xl border border-primary/40 bg-primary-soft px-4 py-3 text-sm font-semibold text-primary">
            Ainda não há lançamento da sua equipe em {formatarDataBR(hoje)}. Mostrando o último
            turno com registro: <b>{formatarDataBR(data)}</b>.
          </p>
        )}

        {/* O gate cobre o farol E as filas. Antes cobria só o farol, então as
            filas renderizavam com lista vazia e a tela dizia "Nada aguardando
            validação" enquanto 55 validações carregavam. */}
        {erroDados ? (
          <section className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-bold">Farol indisponivel</p>
            <p className="mt-1">{erroDados} Nenhum numero sera mostrado como zero.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 rounded-lg bg-destructive px-3 py-2 font-semibold text-destructive-foreground"
            >
              Tentar novamente
            </button>
          </section>
        ) : carregandoChecklists ||
          carregandoLimpezas ||
          carregandoPlanos ||
          carregandoPtp ||
          carregandoEquipe ? (
          <p className="text-sm text-muted-foreground">Carregando o farol…</p>
        ) : (
          <>
            <Farol linhas={linhas} data={data} onAbrirCelula={setCelulaAberta} />

            {aviso && (
              <p className="mt-4 rounded-xl border border-primary/40 bg-primary-soft px-4 py-3 text-sm font-semibold text-primary">
                {aviso}
              </p>
            )}

            <PendenciasAbertas
              pendencias={pendencias}
              planos={planos}
              onAbrirPlano={setPendenciaAberta}
              onValidar={validando ? undefined : validar}
            />
          </>
        )}

        {pendenciaAberta && usuario && (
          <PlanoAcaoDialog
            pendencia={pendenciaAberta}
            usuario={usuario}
            onFechar={() => setPendenciaAberta(null)}
            onSalvo={() => setRecarga((n) => n + 1)}
          />
        )}

        {pendenciaValidacao && (
          <ValidarPendenciaDialog
            pendencia={pendenciaValidacao}
            salvando={validando === pendenciaValidacao.chave}
            erro={erroValidacao}
            onFechar={() => {
              if (!validando) setPendenciaValidacao(null);
            }}
            onConfirmar={(assinatura) => void confirmarValidacao(assinatura)}
          />
        )}

        {celulaAberta && (
          <DetalheCelula celula={celulaAberta} onFechar={() => setCelulaAberta(null)} />
        )}
      </main>
    </div>
  );
}

function DetalheCelula({ celula, onFechar }: { celula: CelulaFarol; onFechar: () => void }) {
  const naoConformes = celula.checklists.flatMap((c) =>
    c.respostas
      .filter((r) => r.resposta === "Não conforme")
      .map((r) => ({ checklist: c, resposta: r })),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/50 p-4 md:p-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <p className="font-bold text-foreground">{celula.maquinaId}</p>
            <p className="text-xs text-muted-foreground">
              {celula.coluna.titulo}
              {celula.detalhe ? ` · ${celula.detalhe}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-2 text-2xl leading-none text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="space-y-3 p-4">
          {/* A limpeza e o PTP têm coluna própria agora, e não guardam
              `checklists`. Explicar o porquê da cor com o texto do checklist
              seria falar do formulário errado. */}
          {celula.coluna.tipo !== "checklist" ? (
            <p className="text-sm text-muted-foreground">
              {celula.pendencias.length > 0
                ? `${celula.pendencias.length} pendência(s) desta rotina em aberto — a lista completa está logo abaixo do farol.`
                : "Sem pendência aberta nesta rotina."}
            </p>
          ) : (
            celula.checklists.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum checklist registrado para este momento hoje. É isso que deixa a célula
                marcada como <b className="text-destructive">NR — não realizado</b>.
              </p>
            )
          )}
          {naoConformes.map(({ checklist, resposta }) => (
            <div
              key={`${checklist.id}-${resposta.itemNumero}`}
              className="rounded-xl border-2 border-destructive/40 bg-destructive-soft/50 p-3"
            >
              <p className="font-bold text-foreground">
                Item {resposta.itemNumero} — {resposta.descricao}
              </p>
              {resposta.observacao && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Ação tomada: {resposta.observacao}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {checklist.operadorResponsavel ?? checklist.operador} · {checklist.contexto.turno}
              </p>
            </div>
          ))}
          {celula.checklists.length > 0 && naoConformes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {celula.checklists.length} checklist(s) registrado(s), sem item não conforme.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
