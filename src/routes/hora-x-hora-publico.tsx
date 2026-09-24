import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MAQUINAS_ORDENADAS } from "@/lib/maquinas/catalogo";
import { HORA_X_HORA_FAIXAS } from "@/lib/producao/constants";
import { fimDaHoraEpoch } from "@/lib/producao/horario";
import { rotuloMotivoParada } from "@/lib/producao/motivos-parada";

interface RegistroPublico {
  maquina: string;
  horaCodigo: string;
  quantidade: number;
  perdaMin: number | null;
  motivoCodigo: string | null;
  operadorNome: string | null;
  produtoSabor: string | null;
  produtoTamanho: string | null;
  cadencia: number | null;
  naoRodou: boolean;
}

interface PainelPublico {
  dataOperacao: string;
  horaReferencia: string;
  consultadoEm: string;
  registros: RegistroPublico[];
}

export const Route = createFileRoute("/hora-x-hora-publico")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search.token)
      ? search.token
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Hora x Hora da Produção · Maximus" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: PainelHoraXHoraPublico,
});

function motivo(registro: RegistroPublico): string {
  if (registro.motivoCodigo) return rotuloMotivoParada(registro.motivoCodigo) ?? "Não informado";
  if (registro.perdaMin === null) return "Cadência não informada";
  return registro.perdaMin > 0 ? "Motivo não informado" : "Sem perda pela cadência";
}

function PainelHoraXHoraPublico() {
  const { token } = Route.useSearch();
  const [painel, setPainel] = useState<PainelPublico | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!token) {
      setErro("Link inválido ou revogado.");
      setPainel(null);
      setCarregando(false);
      return;
    }
    let ativo = true;
    setCarregando(true);
    setErro(null);
    supabase.functions.invoke<PainelPublico>("hora-x-hora-publico", { body: { token } })
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error || !data || !/^\d{4}-\d{2}-\d{2}$/.test(data.dataOperacao)
            || !Array.isArray(data.registros)) {
          setErro("Não foi possível abrir este link. Ele pode ter sido revogado; tente novamente.");
          setPainel(null);
          return;
        }
        setPainel(data);
      })
      .catch(() => {
        if (ativo) {
          setErro("Falha de conexão. Tente novamente.");
          setPainel(null);
        }
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => { ativo = false; };
  }, [token, tentativa]);

  const porHora = useMemo(() => new Map(
    (painel?.registros ?? []).map((registro) => [`${registro.horaCodigo}:${registro.maquina}`, registro]),
  ), [painel]);
  const [ano, mes, dia] = painel?.dataOperacao.split("-") ?? [];
  const agora = painel ? Date.parse(painel.consultadoEm) : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-[#203b61] px-4 py-7 text-white md:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Maximus · Produção</p>
          <h1 className="mt-2 text-2xl font-bold md:text-3xl">Hora x Hora</h1>
          <p className="mt-1 text-sm text-slate-200">
            {painel ? `Dia operacional ${dia}/${mes}/${ano} · 06h às 06h` : "Consulta pública somente de leitura"}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        {carregando && <p className="rounded-xl bg-white p-5 text-sm shadow-sm">Carregando o Hora x Hora...</p>}
        {!carregando && erro && (
          <div className="rounded-xl border border-rose-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-rose-700">{erro}</p>
            <Button className="mt-4" variant="outline" onClick={() => setTentativa((atual) => atual + 1)}>
              Tentar novamente
            </Button>
          </div>
        )}
        {!carregando && !erro && painel && (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm">
              <div>
                <p className="text-sm font-semibold">Linhas 2 e 3 · Enchedora e Empacotadora</p>
                <p className="text-xs text-slate-600">Atualizado ao abrir a página. Registros feitos depois do card aparecem aqui após atualizar.</p>
              </div>
              <Button variant="outline" onClick={() => setTentativa((atual) => atual + 1)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
              </Button>
            </div>
            <div className="space-y-4">
              {HORA_X_HORA_FAIXAS.map((faixa) => {
                const futura = fimDaHoraEpoch(painel.dataOperacao, faixa.codigo) > agora;
                return (
                  <section key={faixa.codigo} className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
                    painel.horaReferencia === faixa.codigo ? "border-sky-500" : "border-slate-200"
                  }`}>
                    <div className="border-b bg-slate-100 px-4 py-3 text-sm font-semibold">
                      {faixa.rotulo} {painel.horaReferencia === faixa.codigo &&
                        <span className="ml-2 rounded bg-sky-100 px-2 py-1 text-xs text-sky-800">Hora do card</span>}
                    </div>
                    <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
                      {MAQUINAS_ORDENADAS.map((maquina) => {
                        const registro = porHora.get(`${faixa.codigo}:${maquina.nome}`);
                        return (
                          <div key={maquina.id} className="rounded-lg border border-slate-200 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{maquina.linha}</p>
                            <h2 className="mt-1 text-sm font-semibold">{maquina.nome}</h2>
                            {registro ? (
                              <>
                                <p className="mt-2 text-lg font-bold">{registro.quantidade.toLocaleString("pt-BR")}
                                  <span className="ml-1 text-xs font-normal text-slate-600">{maquina.unidadeProducao}</span>
                                </p>
                                {registro.naoRodou && <p className="mt-1 text-xs font-semibold text-amber-700">Máquina não rodou</p>}
                                <p className="mt-1 text-xs text-slate-600">
                                  Produto: {[registro.produtoSabor, registro.produtoTamanho].filter(Boolean).join(" · ") || "Não informado"}
                                </p>
                                <p className="mt-1 text-xs text-slate-600">Cadência: {registro.cadencia === null ? "Não informada" : `${registro.cadencia.toLocaleString("pt-BR")} ${maquina.unidadeProducao}/h`}</p>
                                <p className="mt-1 text-xs">Perda equivalente: {registro.perdaMin === null ? "—" : `${registro.perdaMin} min`}</p>
                                <p className="mt-1 text-xs text-slate-600">{motivo(registro)}</p>
                                <p className="mt-2 border-t pt-2 text-xs text-slate-600">Operador: <span className="font-medium text-slate-800">{registro.operadorNome?.trim() || "Não informado"}</span></p>
                              </>
                            ) : (
                              <p className="mt-2 text-sm font-medium text-slate-500">
                                {futura ? "Aguardando fechamento" : "Não realizado"}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            <p className="mt-6 pb-6 text-xs leading-relaxed text-slate-600">
              “Perda equivalente” é estimada pela cadência informada, não é parada cronometrada.
              Este link pode ser repassado e permanece válido até ser revogado pela Gestão Industrial.
              Não permite editar registros nem acessar outros formulários.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
