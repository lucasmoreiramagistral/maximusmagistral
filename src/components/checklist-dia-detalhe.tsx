import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { CheckCircle2, Clock, Circle, AlertTriangle, History } from "lucide-react";
import { ChecklistDetalhe } from "@/components/checklist-detalhe";
import { Button } from "@/components/ui/button";
import { VersoDiaResumoBadges } from "@/components/verso-dia-resumo-badges";
import { formatarData, formatarDataHora } from "@/lib/checklist/format";
import { itensPorMomento } from "@/lib/checklist/itens";
import { useEdicoesChecklists } from "@/hooks/use-edicoes-checklists";
import type { ResumoVerso } from "@/lib/verso/resumo";
import type {
  Anomalia,
  FolhaChecklistDia,
  MomentoFolha,
  StatusMomentoFolha,
} from "@/lib/checklist/types";

const STATUS_LABEL: Record<StatusMomentoFolha, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

function StatusBadge({ status }: { status: StatusMomentoFolha }) {
  const map: Record<StatusMomentoFolha, string> = {
    pendente: "bg-muted text-muted-foreground border-border",
    em_andamento: "bg-warning/15 text-warning-foreground border-warning/40",
    concluido: "bg-success-soft text-success border-success/30",
  };
  const Icon = status === "concluido" ? CheckCircle2 : status === "em_andamento" ? Clock : Circle;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${map[status]}`}
    >
      <Icon className="h-3.5 w-3.5" /> {STATUS_LABEL[status]}
    </span>
  );
}

export function ChecklistDiaResumoCard({
  folha,
  href,
  versoResumo,
}: {
  folha: FolhaChecklistDia;
  href: string;
  versoResumo?: ResumoVerso;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Folha do dia
          </p>
          <p className="text-lg font-bold text-foreground md:text-xl">
            {formatarData(folha.contexto.data)} · {folha.contexto.turno}
          </p>
          <p className="text-sm text-muted-foreground">
            {folha.contexto.equipe} · {folha.contexto.linha} · {folha.contexto.maquina}
          </p>
        </div>
        <Button asChild>
          <Link to={href}>Ver checklist completo do dia</Link>
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
        {folha.momentos.map((m) => {
          const total = itensPorMomento(m.momento).length;
          const concluido = m.verificacoes.find((v) => v.status === "concluido");
          const preenchidos = concluido
            ? concluido.respostas.filter((r) => r?.resposta).length
            : 0;
          const exibePreenchidos = concluido ? preenchidos : 0;
          return (
            <div key={m.momento} className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold text-foreground">{m.momento}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <StatusBadge status={m.status} />
                <span className="text-xs text-muted-foreground">
                  {exibePreenchidos}/{total} itens
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center rounded-md bg-success-soft px-2 py-0.5 font-bold text-success">
          {folha.totalConformes} Conforme
        </span>
        <span className="inline-flex items-center rounded-md bg-destructive-soft px-2 py-0.5 font-bold text-destructive">
          {folha.totalNaoConformes} NC
        </span>
        <span className="inline-flex items-center rounded-md bg-na-soft px-2 py-0.5 font-bold text-na">
          {folha.totalNaoAplicaveis} N/A
        </span>
        {folha.totalAnomalias > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 font-bold text-warning-foreground">
            <AlertTriangle className="h-3 w-3" /> {folha.totalAnomalias} anomalias
          </span>
        )}
      </div>

      {versoResumo && <VersoDiaResumoBadges resumo={versoResumo} />}
    </div>
  );
}

export function ChecklistDiaDetalhe({
  folha,
  anomalias,
  onExportar,
}: {
  folha: FolhaChecklistDia;
  anomalias: Anomalia[];
  onExportar: () => void;
}) {
  const idsChecklists = useMemo(
    () =>
      folha.momentos.flatMap((m) =>
        m.verificacoes.filter((v) => v.status === "concluido").map((v) => v.id),
      ),
    [folha],
  );
  const edicoesPorChecklist = useEdicoesChecklists(idsChecklists);
  const totalEdicoesDia = useMemo(
    () => Array.from(edicoesPorChecklist.values()).reduce((a, b) => a + b, 0),
    [edicoesPorChecklist],
  );

  return (
    <div className="space-y-6">
      <div
        className={`rounded-2xl border p-5 shadow-sm md:p-6 ${
          totalEdicoesDia > 0 ? "border-warning/40 bg-warning/10" : "border-border bg-card"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground md:text-xl">
              Checklist Completo do Dia
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Última atualização: {formatarDataHora(folha.ultimaAtualizacao)}
            </p>
            {totalEdicoesDia > 0 && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-md border border-warning/50 bg-warning/20 px-2.5 py-1 text-xs font-bold text-warning-foreground">
                <History className="h-3.5 w-3.5" />
                Alteração no dia
              </span>
            )}
          </div>
          <Button variant="outline" onClick={onExportar}>
            Exportar Excel
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Info label="Data" valor={formatarData(folha.contexto.data)} />
          <Info label="Turno" valor={folha.contexto.turno} />
          <Info label="Equipe" valor={folha.contexto.equipe} />
          <Info label="Linha" valor={folha.contexto.linha} />
          <Info label="Máquina" valor={folha.contexto.maquina} />
          <Info label="Anomalias" valor={String(folha.totalAnomalias)} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-md border border-success/30 bg-success-soft px-2.5 py-1 text-xs font-bold text-success">
            {folha.totalConformes} Conforme
          </span>
          <span className="inline-flex items-center rounded-md border border-destructive/30 bg-destructive-soft px-2.5 py-1 text-xs font-bold text-destructive">
            {folha.totalNaoConformes} Não conforme
          </span>
          <span className="inline-flex items-center rounded-md border border-na/30 bg-na-soft px-2.5 py-1 text-xs font-bold text-na">
            {folha.totalNaoAplicaveis} Não aplicável
          </span>
        </div>
      </div>

      {folha.momentos.map((bloco) => (
        <BlocoMomento
          key={bloco.momento}
          bloco={bloco}
          anomalias={anomalias}
          edicoesPorChecklist={edicoesPorChecklist}
        />
      ))}
    </div>
  );
}

function BlocoMomento({
  bloco,
  anomalias,
  edicoesPorChecklist,
}: {
  bloco: MomentoFolha;
  anomalias: Anomalia[];
  edicoesPorChecklist: Map<string, number>;
}) {
  const totalItens = itensPorMomento(bloco.momento).length;
  const concluido = bloco.verificacoes.find((v) => v.status === "concluido");
  const preenchidos = concluido
    ? concluido.respostas.filter((r) => r?.resposta).length
    : 0;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-bold text-foreground md:text-lg">{bloco.momento}</h3>
        <div className="flex items-center gap-2">
          <StatusBadge status={bloco.status} />
          <span className="text-xs text-muted-foreground">
            {concluido ? preenchidos : 0}/{totalItens} itens
          </span>
        </div>
      </div>

      {bloco.verificacoes.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Momento ainda não preenchido.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {bloco.verificacoes.map((c) => {
            const vinculadas = anomalias.filter(
              (a) => a.checklistId === c.id || c.respostas.some((r) => r?.anomaliaId === a.id),
            );
            const totalEdicoes = edicoesPorChecklist.get(c.id) ?? 0;
            return (
              <div key={c.id} className="rounded-xl border border-border bg-muted/20 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-foreground">
                      Equipe {c.contexto.equipe}
                      {c.operadorResponsavel ? ` · ${c.operadorResponsavel}` : ""}
                    </p>
                    {totalEdicoes > 0 && (
                      <Link
                        to="/gestao/visualizar/checklist/$id"
                        params={{ id: c.id }}
                        hash="historico"
                        className="inline-flex items-center gap-1 rounded-md border border-warning/50 bg-warning/20 px-2 py-0.5 text-xs font-bold text-warning-foreground transition-colors hover:bg-warning/30"
                        title="Ver histórico de alterações"
                      >
                        <History className="h-3 w-3" />
                        Checklist alterado
                      </Link>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.status === "concluido" ? "Concluído em " : "Iniciado em "}
                    {formatarDataHora(c.concluidoEm ?? c.criadoEm)}
                  </p>
                </div>
                <ChecklistDetalhe checklist={c} anomaliasVinculadas={vinculadas} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Info({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{valor}</p>
    </div>
  );
}
