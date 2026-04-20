import { AlertTriangle } from "lucide-react";
import { RespostaBadge } from "@/components/badges";
import type { Anomalia, Checklist } from "@/lib/checklist/types";
import { formatarData, formatarDataHora, formatarHora } from "@/lib/checklist/format";

export function ChecklistDetalhe({
  checklist,
  anomaliasVinculadas,
}: {
  checklist: Checklist;
  anomaliasVinculadas: Anomalia[];
}) {
  const respostas = checklist.respostas ?? [];
  const conformes = respostas.filter((r) => r?.resposta === "Conforme").length;
  const naoConformes = respostas.filter((r) => r?.resposta === "Não conforme").length;
  const naoAplicaveis = respostas.filter((r) => r?.resposta === "Não aplicável").length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-lg font-bold text-foreground">Cabeçalho</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <Info label="Data" valor={formatarData(checklist.contexto.data)} />
          <Info label="Turno" valor={checklist.contexto.turno} />
          <Info label="Equipe" valor={checklist.contexto.equipe} />
          <Info label="Operador" valor={checklist.operador} />
          <Info label="Linha" valor={checklist.contexto.linha} />
          <Info label="Máquina" valor={checklist.contexto.maquina} />
          <Info label="Momento" valor={checklist.momento} />
          <Info
            label="Concluído em"
            valor={formatarDataHora(checklist.concluidoEm ?? checklist.criadoEm)}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill cor="success" texto={`${conformes} Conforme`} />
          <Pill cor="destructive" texto={`${naoConformes} Não conforme`} />
          <Pill cor="na" texto={`${naoAplicaveis} Não aplicável`} />
          {anomaliasVinculadas.length > 0 && (
            <Pill cor="warning" texto={`${anomaliasVinculadas.length} anomalias`} />
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-lg font-bold text-foreground">Respostas</h2>
        <ul className="divide-y divide-border">
          {respostas.map((r) => {
            if (!r) return null;
            return (
              <li key={r.itemNumero} className="py-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">
                      <span className="text-primary">Item {r.itemNumero}</span> — {r.descricao}
                    </p>
                    {r.valorNumerico && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Valor:{" "}
                        <span className="font-semibold text-foreground">{r.valorNumerico}</span>
                      </p>
                    )}
                    {r.valorTexto && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Detalhes: <span className="text-foreground">{r.valorTexto}</span>
                      </p>
                    )}
                    {r.observacao && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Obs: <span className="text-foreground">{r.observacao}</span>
                      </p>
                    )}
                    {r.anomaliaId && (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-warning-foreground">
                        <AlertTriangle className="h-3.5 w-3.5" /> Anomalia vinculada
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-start gap-1 md:items-end">
                    <RespostaBadge resposta={r.resposta} />
                    {r.horarioVerificacao && (
                      <p className="text-xs text-muted-foreground">
                        {formatarHora(r.horarioVerificacao)}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {anomaliasVinculadas.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
          <h2 className="mb-4 text-lg font-bold text-foreground">Anomalias vinculadas</h2>
          <ul className="space-y-3">
            {anomaliasVinculadas.map((a) => (
              <li key={a.id} className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">
                  {formatarDataHora(a.criadoEm)}
                  {a.itemOrigem && ` · Item ${a.itemOrigem.numero}`}
                </p>
                <p className="mt-1 font-semibold text-foreground">
                  {a.categoria} · {a.criticidade} · {a.status}
                </p>
                <p className="mt-1 text-sm text-foreground">{a.descricao}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AnomaliaDetalhe({ anomalia }: { anomalia: Anomalia }) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-7">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Info label="Data/hora" valor={formatarDataHora(anomalia.criadoEm)} />
          <Info label="Operador" valor={anomalia.operador} />
          <Info label="Linha" valor={anomalia.linha} />
          <Info label="Área" valor={anomalia.area} />
          <Info label="Equipamento afetado" valor={anomalia.equipamentoAfetado ?? anomalia.maquina} />
          <Info label="Equipe" valor={anomalia.equipe} />
          <Info label="Turno" valor={anomalia.turno} />
          <Info label="Categoria" valor={anomalia.categoria} />
          <Info label="Criticidade" valor={anomalia.criticidade} />
          <Info label="Status" valor={anomalia.status} />
        </div>

        {anomalia.itemOrigem && (
          <div className="mt-5 rounded-xl border border-warning/40 bg-warning/10 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-warning-foreground">
              Item de origem
            </p>
            <p className="mt-1 font-semibold text-foreground">
              Item {anomalia.itemOrigem.numero} — {anomalia.itemOrigem.descricao}
            </p>
          </div>
        )}

        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Descrição
          </p>
          <p className="mt-1 whitespace-pre-wrap text-base text-foreground">{anomalia.descricao}</p>
        </div>
      </div>

      {(anomalia.responsavelManutencao ||
        anomalia.oQueFoiFeito ||
        anomalia.resolvidoEm ||
        anomalia.ultimaAtualizacaoEm) && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
          <h2 className="mb-4 text-lg font-bold text-foreground">Tratativa</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Info label="Status atual" valor={anomalia.status} />
            {anomalia.responsavelManutencao && (
              <Info
                label="Responsável pela manutenção"
                valor={anomalia.responsavelManutencao}
              />
            )}
            {anomalia.resolvidoEm && (
              <Info label="Resolvido em" valor={formatarDataHora(anomalia.resolvidoEm)} />
            )}
            {anomalia.ultimaAtualizacaoEm && (
              <Info
                label="Última atualização"
                valor={formatarDataHora(anomalia.ultimaAtualizacaoEm)}
              />
            )}
          </div>
          {anomalia.oQueFoiFeito && (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                O que foi feito
              </p>
              <p className="mt-1 whitespace-pre-wrap text-base text-foreground">
                {anomalia.oQueFoiFeito}
              </p>
            </div>
          )}
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

function Pill({
  cor,
  texto,
}: {
  cor: "success" | "destructive" | "na" | "warning";
  texto: string;
}) {
  const map = {
    success: "bg-success-soft text-success border-success/30",
    destructive: "bg-destructive-soft text-destructive border-destructive/30",
    na: "bg-na-soft text-na border-na/30",
    warning: "bg-warning/15 text-warning-foreground border-warning/40",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold ${map[cor]}`}
    >
      {texto}
    </span>
  );
}
