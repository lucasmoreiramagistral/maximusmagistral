/**
 * "Avaliar Melhorias" + "Análise cump. Rotina Sup/Coord."
 *
 * As duas tarefas dos papéis que ainda não tinham tela.
 *
 * Melhoria não é declaração, é o problema deixar de aparecer. Por isso a
 * pergunta aqui não é "o plano foi cumprido?" (isso é o C, já existe), e
 * sim: depois do plano, ele voltou?
 */

import { cn } from "@/lib/utils";
import {
  DIAS_PARA_ELIMINADO,
  resumirMelhorias,
  type Melhoria,
  type RotinaLideranca,
  type StatusMelhoria,
} from "@/lib/farol/eficacia";
import { formatarDataBR } from "@/lib/operacao/data-operacional";

const ROTULO: Record<StatusMelhoria, string> = {
  reincidiu: "Voltou a acontecer",
  sem_plano: "Sem plano de ação",
  em_execucao: "Plano em execução",
  monitorando: "Em monitoramento",
  eliminado: "Eliminado",
};

const COR: Record<StatusMelhoria, string> = {
  reincidiu: "border-destructive bg-destructive text-destructive-foreground",
  sem_plano: "border-destructive/40 bg-destructive-soft text-destructive",
  em_execucao: "border-warning/50 bg-warning/15 text-warning-foreground",
  monitorando: "border-primary/40 bg-primary-soft text-primary",
  eliminado: "border-success/40 bg-success-soft text-success",
};

export function MelhoriasERotina({
  melhorias,
  rotina,
}: {
  melhorias: Melhoria[];
  rotina: RotinaLideranca;
}) {
  const r = resumirMelhorias(melhorias);

  return (
    <>
      <section className="mt-10" aria-label="Cumprimento da rotina da liderança">
        <h3 className="text-2xl font-black tracking-tight text-foreground">
          Cumprimento da rotina — Sup/Coord
        </h3>
        <p className="mb-3 text-sm text-muted-foreground">
          A cascata do papel: o líder valida o operador, o Sup/Coord acompanha os NC-PA, e
          a GI acompanha o Sup/Coord.
        </p>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cartao
            rotulo="Problemas com plano"
            valor={`${rotina.pctComPlano}%`}
            nota={`${rotina.comPlano} de ${rotina.comPlano + rotina.semPlano}`}
            tom={rotina.pctComPlano >= 80 ? "bom" : rotina.pctComPlano >= 50 ? "atencao" : "ruim"}
          />
          <Cartao
            rotulo="Tempo até virar plano"
            valor={
              rotina.tempoMedioAberturaDias === null
                ? "—"
                : `${rotina.tempoMedioAberturaDias}d`
            }
            nota={
              rotina.tempoMedioAberturaDias === null
                ? "nenhum plano aberto ainda"
                : "do problema aparecer até alguém assumir"
            }
            tom={
              rotina.tempoMedioAberturaDias === null
                ? "neutro"
                : rotina.tempoMedioAberturaDias <= 2
                  ? "bom"
                  : rotina.tempoMedioAberturaDias <= 7
                    ? "atencao"
                    : "ruim"
            }
          />
          <Cartao
            rotulo="Vencidos sem recurso"
            valor={rotina.vencidosSemRecurso}
            nota="a GI precisa destravar"
            tom={rotina.vencidosSemRecurso > 0 ? "ruim" : "bom"}
          />
          <Cartao
            rotulo="Planos checados"
            valor={rotina.planosChecados}
            nota="o C do ciclo aconteceu"
            tom={rotina.planosChecados > 0 ? "bom" : "neutro"}
          />
        </div>
      </section>

      <section className="mt-10" aria-label="Avaliar melhorias">
        <h3 className="text-2xl font-black tracking-tight text-foreground">
          Avaliar melhorias
        </h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Melhoria é o problema parar de acontecer. Um item é dado como{" "}
          <b className="text-foreground">eliminado</b> quando o plano foi aprovado e ele
          não voltou por {DIAS_PARA_ELIMINADO} dias.
        </p>

        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cartao
            rotulo="Eliminados"
            valor={r.eliminados}
            nota={`${r.ocorrenciasEvitadas} ocorrências deixaram de acontecer`}
            tom={r.eliminados > 0 ? "bom" : "neutro"}
          />
          <Cartao
            rotulo="Em monitoramento"
            valor={r.monitorando}
            nota={`aprovados há menos de ${DIAS_PARA_ELIMINADO} dias`}
            tom="neutro"
          />
          <Cartao
            rotulo="Voltaram"
            valor={r.reincidiram}
            nota="plano cumprido não resolveu"
            tom={r.reincidiram > 0 ? "ruim" : "bom"}
          />
          <Cartao
            rotulo="Sem plano"
            valor={r.semPlano}
            nota="ninguém assumiu"
            tom={r.semPlano > 0 ? "ruim" : "bom"}
          />
        </div>

        {melhorias.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Nenhum problema registrado para avaliar.
          </p>
        ) : (
          <ul className="space-y-2">
            {melhorias.map((m) => (
              <li
                key={m.chave}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-xl border-2 p-4",
                  m.status === "reincidiu"
                    ? "border-destructive bg-destructive-soft/50"
                    : m.status === "eliminado"
                      ? "border-success/40 bg-success-soft/40"
                      : "border-border bg-card",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs font-black",
                    COR[m.status],
                  )}
                >
                  {ROTULO[m.status]}
                </span>

                <div className="min-w-[220px] flex-1">
                  <p className="font-bold leading-snug text-foreground">{m.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.maquina} · última vez em {formatarDataBR(m.ultimaOcorrencia)}
                    {m.diasSemOcorrer > 0 && ` · há ${m.diasSemOcorrer} dias`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-4 text-center">
                  <div>
                    <p className="text-lg font-black text-foreground">{m.antes}</p>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">
                      antes
                    </p>
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <div>
                    <p
                      className={cn(
                        "text-lg font-black",
                        m.depois === 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {m.depois}
                    </p>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">
                      depois
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Cartao({
  rotulo,
  valor,
  nota,
  tom,
}: {
  rotulo: string;
  valor: number | string;
  nota: string;
  tom: "bom" | "atencao" | "ruim" | "neutro";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </p>
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
