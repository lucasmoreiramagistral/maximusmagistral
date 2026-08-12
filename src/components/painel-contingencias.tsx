/**
 * O painel que impede a contingência de virar rotina silenciosa.
 *
 * Mostra quantos turnos fecharam sem a assinatura do líder, quem autorizou e
 * por quê. O motivo é a informação que decide o que fazer: "líder ainda não
 * tem login" repetido 40 vezes é problema de cadastro, não de disciplina.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  agruparFechamentos,
  buscarContingencias,
  contarPorMotivo,
  type Contingencia,
} from "@/lib/farol/contingencias";
import { formatarDataBR } from "@/lib/operacao/data-operacional";

export function PainelContingencias({ de, ate }: { de: string; ate: string }) {
  const [itens, setItens] = useState<Contingencia[]>([]);
  const [indisponivel, setIndisponivel] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro("");
    void (async () => {
      const r = await buscarContingencias(de, ate);
      if (cancelado) return;
      if (r.ok) {
        setItens(r.itens);
        setIndisponivel(false);
        setErro("");
      } else {
        setItens([]);
        setIndisponivel(!!r.indisponivel);
        setErro(r.indisponivel ? "" : r.erro);
      }
      setCarregando(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [de, ate]);

  if (carregando) return null;

  // "Ainda não sei contar" não é "nenhuma". Mostrar zero aqui seria afirmar
  // algo que o banco não disse.
  if (indisponivel) {
    return (
      <section className="mt-8" aria-label="Fechamentos em contingência">
        <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Contagem de fechamentos em contingência indisponível — a estrutura de auditoria ainda não
          está instalada no banco.
        </p>
      </section>
    );
  }

  if (erro) {
    return (
      <section className="mt-8" aria-label="Fechamentos em contingência">
        <p className="rounded-xl border border-destructive/40 bg-destructive-soft p-4 text-sm font-semibold text-destructive">
          Não foi possível consultar os fechamentos em contingência. O total não será mostrado como
          zero. Tente recarregar a página.
        </p>
      </section>
    );
  }

  const fechamentos = agruparFechamentos(itens);
  const porMotivo = contarPorMotivo(fechamentos);

  return (
    <section className="mt-8" aria-label="Fechamentos em contingência">
      <h3 className="text-2xl font-black tracking-tight text-foreground">
        Fechamentos em contingência
      </h3>
      <p className="mb-3 text-sm text-muted-foreground">
        Turnos fechados <b className="text-foreground">sem a assinatura do líder</b>, de{" "}
        {formatarDataBR(de)} a {formatarDataBR(ate)}. Existe para a produção não parar — e é contado
        aqui para não virar o normal.
      </p>

      {fechamentos.length === 0 ? (
        <p className="rounded-xl border border-success/40 bg-success-soft p-4 text-sm font-semibold text-success">
          Nenhum turno fechado em contingência no período. Toda validação teve líder autenticado.
        </p>
      ) : (
        <div
          className={cn(
            "rounded-2xl border-2 p-5",
            fechamentos.length >= 10
              ? "border-destructive/50 bg-destructive-soft/40"
              : "border-warning/50 bg-warning/10",
          )}
        >
          <div className="flex flex-wrap items-center gap-4">
            <span
              className={cn(
                "flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-xl text-white",
                fechamentos.length >= 10 ? "bg-destructive" : "bg-warning",
              )}
            >
              <span className="text-2xl font-black leading-none">{fechamentos.length}</span>
              <span className="text-[9px] font-bold opacity-90">turnos</span>
            </span>
            <div className="min-w-[240px] flex-1">
              <p className="text-sm text-muted-foreground">Por que o líder não pôde validar:</p>
              <ul className="mt-1 space-y-0.5">
                {porMotivo.map((m) => (
                  <li key={m.motivo} className="text-sm font-semibold text-foreground">
                    {m.qtd}× {m.motivo}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              aria-expanded={aberto}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold hover:bg-accent"
            >
              {aberto ? "Ocultar" : "Ver a lista"}
            </button>
          </div>

          {aberto && (
            <ul className="mt-4 max-h-96 space-y-1.5 overflow-y-auto border-t border-border/40 pt-4">
              {fechamentos.map((c) => (
                <li key={c.id} className="rounded-lg bg-card px-3 py-2 text-sm">
                  <p className="font-semibold text-foreground">
                    {formatarDataBR(c.dataOperacao)} · {c.turno}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Fechado por <b className="text-foreground">{c.registradoPorNome}</b> ·
                    autorizado por {c.autorizou ?? "—"} · {c.motivo ?? "sem motivo"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
