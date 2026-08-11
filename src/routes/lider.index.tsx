import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Farol } from "@/components/farol";
import { TelaCarregando } from "@/components/tela-carregando";
import { useGuard } from "@/hooks/use-guard";
import { useChecklistsRemote } from "@/hooks/use-storage";
import { supabase } from "@/integrations/supabase/client";
import { montarFarol, type CelulaFarol } from "@/lib/farol/farol";
import { levantarPendencias, type Pendencia } from "@/lib/farol/pendencias";
import { buscarPlanos } from "@/lib/farol/planos-storage";
import { validarLimpeza } from "@/lib/farol/validacao-storage";
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

function somarDiasISO(data: string, passos: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + passos);
  return d.toISOString().slice(0, 10);
}

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
  const { data: checklists, loading: carregandoChecklists } = useChecklistsRemote({
    realtime: true,
  });

  const [limpezas, setLimpezas] = useState<LimpezaTurno[]>([]);
  const [celulaAberta, setCelulaAberta] = useState<CelulaFarol | null>(null);
  const [planos, setPlanos] = useState<PlanoAcao[]>([]);
  const [pendenciaAberta, setPendenciaAberta] = useState<Pendencia | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [validando, setValidando] = useState<string | null>(null);
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

  // Data operacional respeita a regra de madrugada: no turno da noite, antes
  // do fim do turno, a folha ainda é a do dia anterior.
  const hoje = useMemo(
    () => calcularDataOperacional(usuario?.equipePadrao, usuario?.turnoPadrao),
    [usuario?.equipePadrao, usuario?.turnoPadrao],
  );

  // O líder chega no turno e precisa olhar o que acabou de fechar, não só o
  // que está aberto. Por isso a data é navegável, começando em hoje.
  const [dataSel, setDataSel] = useState<string | null>(null);
  const data = dataSel ?? hoje;

  const irParaDia = (passos: number) => {
    const d = new Date(`${data}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + passos);
    setDataSel(d.toISOString().slice(0, 10));
  };

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      // NÃO desestruturar como `data`: sombrearia a data selecionada acima.
      const { data: linhasLimpeza, error } = await supabase
        .from("limpeza_turnos" as never)
        .select("*")
        .order("data_operacao", { ascending: false });
      if (cancelado) return;
      if (error) {
        console.error("[lider] limpezas:", error);
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
      const p = await buscarPlanos();
      if (cancelado) return;
      setPlanos(p);
      setCarregandoPlanos(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      // Só a janela navegável do farol: o PTP não tem passivo para arrastar,
      // e puxar 742 janelas de 4 meses seria peso à toa no tablet.
      const { data: linhasPtp, error } = await supabase
        .from("ptp_janelas" as never)
        .select("*")
        .gte("data_operacao", somarDiasISO(data, -1))
        .lte("data_operacao", data);
      if (cancelado) return;
      if (error) {
        console.error("[lider] ptp:", error);
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
    () => levantarPendencias({ checklists, limpezas, planos, hoje }),
    [checklists, limpezas, planos, hoje],
  );

  const linhas = useMemo(
    () => montarFarol({ checklists, limpezas, ptp, data, hoje, pendencias }),
    [checklists, limpezas, ptp, data, hoje, pendencias],
  );

  const validar = async (p: Pendencia) => {
    if (!usuario) return;
    setValidando(p.chave);
    setAviso("");
    const r = await validarLimpeza(p.origemId, usuario);
    setValidando(null);
    if (!r.ok) {
      setAviso(r.erro);
      return;
    }
    setAviso(`Validado por ${usuario.nome}.`);
    setRecarga((n) => n + 1);
  };

  if (loading || !usuario) return <TelaCarregando />;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader titulo="Liderança" subtitulo={`Linha 3 · ${formatarDataBR(data)}`} />
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
          {data !== hoje && (
            <button
              type="button"
              onClick={() => setDataSel(null)}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              Voltar para hoje
            </button>
          )}
        </div>

        {/* O gate cobre o farol E as filas. Antes cobria só o farol, então as
            filas renderizavam com lista vazia e a tela dizia "Nada aguardando
            validação" enquanto 55 validações carregavam. */}
        {carregandoChecklists || carregandoLimpezas || carregandoPlanos || carregandoPtp ? (
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
