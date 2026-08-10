import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Farol } from "@/components/farol";
import { TelaCarregando } from "@/components/tela-carregando";
import { useGuard } from "@/hooks/use-guard";
import { useChecklistsRemote } from "@/hooks/use-storage";
import { supabase } from "@/integrations/supabase/client";
import { montarFarol, type CelulaFarol } from "@/lib/farol/farol";
import { calcularDataOperacional, formatarDataBR } from "@/lib/operacao/data-operacional";
import { limpezaTurnoFromRow, type LimpezaTurnoRow } from "@/lib/verso/mappers";
import type { LimpezaTurno } from "@/lib/verso/types";

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
        .eq("data_operacao", data);
      if (cancelado) return;
      if (error) {
        console.error("[lider] limpezas:", error);
        return;
      }
      setLimpezas(
        ((linhasLimpeza ?? []) as unknown as LimpezaTurnoRow[]).map(limpezaTurnoFromRow),
      );
    })();
    return () => {
      cancelado = true;
    };
  }, [data]);

  const linhas = useMemo(
    () => montarFarol({ checklists, limpezas, data, hoje }),
    [checklists, limpezas, data, hoje],
  );

  const aguardandoValidacao = useMemo(
    () => limpezas.filter((l) => l.status === "aguardando_validacao"),
    [limpezas],
  );

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

        {carregandoChecklists ? (
          <p className="text-sm text-muted-foreground">Carregando o farol…</p>
        ) : (
          <Farol linhas={linhas} data={data} onAbrirCelula={setCelulaAberta} />
        )}

        <section className="mt-8" aria-label="Validações pendentes">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Aguardando a sua validação
          </h3>
          {aguardandoValidacao.length === 0 ? (
            <p className="mt-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Nada pendente de validação hoje.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {aguardandoValidacao.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-warning/40 bg-warning/10 p-4"
                >
                  <div>
                    <p className="font-bold text-foreground">
                      Limpeza da sala de envase · {l.turno}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatarDataBR(l.dataOperacao)}
                      {l.operadorNome ? ` · operador ${l.operadorNome}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full border border-warning/50 bg-warning/20 px-3 py-1 text-xs font-bold text-warning-foreground">
                    Aguarda o líder
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {celulaAberta && (
          <DetalheCelula celula={celulaAberta} onFechar={() => setCelulaAberta(null)} />
        )}
      </main>
    </div>
  );
}

function DetalheCelula({
  celula,
  onFechar,
}: {
  celula: CelulaFarol;
  onFechar: () => void;
}) {
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
            <p className="text-xs text-muted-foreground">{celula.momento}</p>
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
          {celula.checklists.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum checklist registrado para este momento hoje. É isso que deixa a célula
              marcada como <b className="text-destructive">NR — não realizado</b>.
            </p>
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
                {checklist.operadorResponsavel ?? checklist.operador} ·{" "}
                {checklist.contexto.turno}
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
