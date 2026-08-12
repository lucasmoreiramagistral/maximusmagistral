/**
 * GI — "Disponibilizar Recursos p/ Execução PA (NC)".
 *
 * É a tarefa que o 2º papel dá à Gestão Industrial. Não é padronizar nem
 * executar: é destravar o que a liderança já planejou e não consegue tocar.
 *
 * O critério de "travado" aqui é o prazo: plano aberto cujo prazo passou.
 * A liderança fez a parte dela — combinou o quê, quem e quando. Se venceu
 * e não andou, ou falta recurso ou falta cobrança, e as duas coisas são
 * da GI.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Usuario } from "@/lib/checklist/types";
import type { Pendencia } from "@/lib/farol/pendencias";
import { liberarRecurso } from "@/lib/farol/planos-storage";
import { etapaDoPlano } from "@/lib/farol/planos-types";
import type { PlanoAcao } from "@/lib/farol/planos-types";
import { agruparPendencias, ocorrenciaRepresentante } from "@/lib/farol/grupos";
import { formatarDataBR } from "@/lib/operacao/data-operacional";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function GestaoRecursos({
  pendencias,
  planos,
  usuario,
  onAtualizar,
}: {
  pendencias: Pendencia[];
  planos: PlanoAcao[];
  usuario: Usuario;
  onAtualizar: () => void;
}) {
  const hoje = hojeISO();

  // Pendencia de validacao NAO e problema que pede plano de acao: e turno que
  // o lider nunca fechou. Contar as duas juntas inflava "sem plano de accao"
  // com dezenas de itens que nao precisam de plano nenhum, e era o mesmo erro
  // conceitual ja corrigido na tela do lider (pendencias-abertas.tsx separa as
  // duas filas). Aqui ficou passando.
  const problemas = pendencias.filter((p) => p.tipo === "nc");
  const validacoes = pendencias.filter((p) => p.tipo === "validacao");
  const gruposProblemas = agruparPendencias(problemas, planos);

  const comPlano = gruposProblemas.filter((g) => g.plano && g.plano.status === "aberto");
  const vencidos = comPlano.filter((g) => g.plano!.quando < hoje && !g.plano!.recursoLiberadoEm);
  const semPlano = gruposProblemas.filter((g) => !g.plano || g.plano.status === "nao_cumprido");

  const maisAntiga = pendencias.reduce<Pendencia | null>(
    (a, p) => (a === null || p.idadeDias > a.idadeDias ? p : a),
    null,
  );
  const validacaoMaisAntiga = validacoes.reduce((m, p) => Math.max(m, p.idadeDias), 0);

  return (
    <section className="mt-8" aria-label="Ciclo PDCA da linha">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Ciclo PDCA — onde está travado
      </h3>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Cartao
          rotulo="Sem plano de ação"
          valor={semPlano.length}
          nota="problema sem quem assuma"
          letra="P"
          tom={semPlano.length > 0 ? "ruim" : "bom"}
        />
        <Cartao
          rotulo="Plano em execução"
          valor={comPlano.length - vencidos.length}
          nota="dentro do prazo"
          letra="D"
          tom="neutro"
        />
        <Cartao
          rotulo="Prazo vencido"
          valor={vencidos.length}
          nota="precisa da GI destravar"
          letra="D"
          tom={vencidos.length > 0 ? "ruim" : "bom"}
        />
        <Cartao
          rotulo="Validação em atraso"
          valor={validacoes.length}
          nota={
            validacoes.length > 0
              ? `turno que o líder não fechou · mais antiga há ${validacaoMaisAntiga}d`
              : "todo turno fechado"
          }
          letra="C"
          tom={validacoes.length > 0 ? "ruim" : "bom"}
        />
        <Cartao
          rotulo="Pendência mais antiga"
          valor={maisAntiga ? `${maisAntiga.idadeDias}d` : "—"}
          nota={maisAntiga ? `desde ${formatarDataBR(maisAntiga.dataOrigem)}` : "nada em aberto"}
          letra="—"
          tom={!maisAntiga ? "bom" : maisAntiga.idadeDias > 30 ? "ruim" : "atencao"}
        />
      </div>

      {vencidos.length > 0 ? (
        <>
          <p className="mb-2 text-sm font-semibold text-foreground">
            Planos com prazo vencido aguardando a GI
          </p>
          <ul className="space-y-2">
            {vencidos.map((g) => (
              <ItemVencido
                key={g.chave}
                pendencia={ocorrenciaRepresentante(g)}
                usuario={usuario}
                onAtualizar={onAtualizar}
              />
            ))}
          </ul>
        </>
      ) : (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Nenhum plano de ação com prazo vencido. Quando um vencer, ele aparece aqui para a GI
          liberar recurso ou cobrar.
        </p>
      )}
    </section>
  );
}

function ItemVencido({
  pendencia,
  usuario,
  onAtualizar,
}: {
  pendencia: Pendencia;
  usuario: Usuario;
  onAtualizar: () => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const plano = pendencia.plano!;

  const atrasoDias = Math.max(
    0,
    Math.round((Date.parse(hojeISO()) - Date.parse(plano.quando)) / 86_400_000),
  );

  const liberar = async () => {
    if (!observacao.trim()) {
      setErro("Descreva o recurso liberado ou o encaminhamento.");
      return;
    }
    setSalvando(true);
    setErro("");
    const r = await liberarRecurso(plano, observacao.trim(), usuario);
    setSalvando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setAbrindo(false);
    setObservacao("");
    onAtualizar();
  };

  return (
    <li className="rounded-xl border-2 border-destructive/40 bg-destructive-soft/30 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-destructive text-destructive-foreground">
          <span className="text-base font-black leading-none">{atrasoDias}</span>
          <span className="text-[9px] font-bold opacity-90">atraso</span>
        </span>
        <div className="min-w-[220px] flex-1">
          <p className="font-bold text-foreground">{plano.oQue}</p>
          <p className="text-xs text-muted-foreground">
            {plano.quem} · prazo era {formatarDataBR(plano.quando)} · aberto por{" "}
            {plano.criadoPorNome}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{pendencia.titulo}</p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
          {etapaDoPlano(plano)}
        </span>
        <button
          type="button"
          onClick={() => setAbrindo((v) => !v)}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
        >
          {abrindo ? "Cancelar" : "Liberar recurso"}
        </button>
      </div>

      {abrindo && (
        <div className="mt-3 border-t border-destructive/20 pt-3">
          <label
            className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
            htmlFor={`rec-${plano.id}`}
          >
            O que a GI está liberando *
          </label>
          <textarea
            id={`rec-${plano.id}`}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: Compra da peça aprovada + 30 min de parada programada autorizados."
            className="min-h-[70px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          {erro && <p className="mt-1 text-sm font-semibold text-destructive">{erro}</p>}
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={liberar}
              disabled={salvando}
              className="rounded-lg bg-success px-4 py-2 text-sm font-bold text-success-foreground hover:brightness-110 disabled:opacity-50"
            >
              {salvando ? "Salvando…" : "Confirmar liberação"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Cartao({
  rotulo,
  valor,
  nota,
  letra,
  tom,
}: {
  rotulo: string;
  valor: number | string;
  nota: string;
  letra: string;
  tom: "bom" | "atencao" | "ruim" | "neutro";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{rotulo}</p>
        <span className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-black text-muted-foreground">
          {letra}
        </span>
      </div>
      <p
        className={cn(
          "mt-1 text-3xl font-black tracking-tight",
          tom === "ruim" && "text-destructive",
          tom === "atencao" && "text-warning-foreground",
          tom === "bom" && "text-success",
          tom === "neutro" && "text-foreground",
        )}
      >
        {valor}
      </p>
      <p className="text-xs text-muted-foreground">{nota}</p>
    </div>
  );
}
