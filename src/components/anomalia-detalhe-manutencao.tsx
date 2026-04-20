import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  History,
  CheckCircle2,
  Clock,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusAnomaliaBadge } from "@/components/badges";
import { toast } from "sonner";
import type {
  Anomalia,
  AnomaliaAtualizacao,
  StatusAnomalia,
  Usuario,
} from "@/lib/checklist/types";
import { formatarDataHora } from "@/lib/checklist/format";
import { updateAnomaliaTratativaManutencao } from "@/lib/checklist/supabase-storage";
import { useAnomaliaAtualizacoes } from "@/hooks/use-anomalia-atualizacoes";

type StatusEditavelManutencao = "Em andamento" | "Resolvida";

type FormState = {
  status: StatusEditavelManutencao;
  responsavel: string;
  oQueFoiFeito: string;
};

function getOpcoesStatus(atual: StatusAnomalia): StatusEditavelManutencao[] {
  if (atual === "Aberta") return ["Em andamento", "Resolvida"];
  if (atual === "Em andamento") return ["Resolvida"];
  return [];
}

function rotuloOrigem(o?: Anomalia["origemAnomalia"]): string {
  switch (o) {
    case "checklist_operador":
      return "Checklist do operador";
    case "manual_operador":
      return "Manual — Operador";
    case "manual_manutencao":
      return "Manual — Manutenção";
    case "manual_gestao":
      return "Manual — Gestão";
    default:
      return "—";
  }
}

export function AnomaliaDetalheManutencao({
  anomalia,
  usuario,
  onUpdated,
}: {
  anomalia: Anomalia;
  usuario: Usuario;
  onUpdated?: () => void;
}) {
  const opcoes = useMemo(() => getOpcoesStatus(anomalia.status), [anomalia.status]);
  const podeEditar = opcoes.length > 0;

  const [form, setForm] = useState<FormState>({
    status: opcoes[0] ?? "Em andamento",
    responsavel: anomalia.responsavelManutencao ?? "",
    oQueFoiFeito: anomalia.oQueFoiFeito ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Partial<Record<keyof FormState, string>>>({});
  const historicoRef = useRef<HTMLDivElement | null>(null);

  const {
    data: historico,
    loading: loadingHistorico,
    refetch: refetchHistorico,
  } = useAnomaliaAtualizacoes(anomalia.id);

  function validar(): boolean {
    const novosErros: Partial<Record<keyof FormState, string>> = {};
    const resp = form.responsavel.trim();
    if (resp.length < 3) novosErros.responsavel = "Mínimo 3 caracteres";
    else if (/^\d+$/.test(resp)) novosErros.responsavel = "Não pode conter apenas números";

    if (form.oQueFoiFeito.trim().length < 5) novosErros.oQueFoiFeito = "Mínimo 5 caracteres";
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function salvar() {
    if (!validar()) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    setSalvando(true);
    try {
      await updateAnomaliaTratativaManutencao(anomalia.id, {
        status: form.status,
        responsavelManutencao: form.responsavel.trim(),
        oQueFoiFeito: form.oQueFoiFeito.trim(),
        atualizadoPorLogin: usuario.usuario,
      });
      toast.success("Atualização concluída");
      await refetchHistorico();
      onUpdated?.();
      requestAnimationFrame(() => {
        historicoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar atualização");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Resumo */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-7">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusAnomaliaBadge status={anomalia.status} />
          <span className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {anomalia.criticidade}
          </span>
          <span className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {anomalia.categoria}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Info label="Aberta em" valor={formatarDataHora(anomalia.criadoEm)} />
          <Info label="Origem" valor={rotuloOrigem(anomalia.origemAnomalia)} />
          <Info label="Linha" valor={anomalia.linha} />
          <Info label="Área" valor={anomalia.area} />
          <Info label="Equipamento afetado" valor={anomalia.equipamentoAfetado ?? anomalia.maquina} />
          <Info label="Equipe" valor={anomalia.equipe} />
          <Info label="Turno" valor={anomalia.turno} />
          {anomalia.tecnicoResponsavel && (
            <Info label="Técnico responsável" valor={anomalia.tecnicoResponsavel} />
          )}
        </div>

        {anomalia.itemOrigem && (
          <div className="mt-5 rounded-xl border border-warning/40 bg-warning/10 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-warning-foreground">
              Item de origem (checklist)
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
          <p className="mt-1 whitespace-pre-wrap text-base text-foreground">
            {anomalia.descricao}
          </p>
        </div>
      </div>

      {/* Tratativa atual */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          Tratativa atual
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Info label="Status atual" valor={anomalia.status} />
          <Info
            label="Responsável pela manutenção"
            valor={anomalia.responsavelManutencao ?? "—"}
          />
          <Info
            label="Em andamento em"
            valor={anomalia.emAndamentoEm ? formatarDataHora(anomalia.emAndamentoEm) : "—"}
          />
          <Info
            label="Resolvida em"
            valor={anomalia.resolvidoEm ? formatarDataHora(anomalia.resolvidoEm) : "—"}
          />
          <Info
            label="Última atualização em"
            valor={
              anomalia.ultimaAtualizacaoEm
                ? formatarDataHora(anomalia.ultimaAtualizacaoEm)
                : "—"
            }
          />
          <Info
            label="Última atualização por"
            valor={
              anomalia.ultimaAtualizacaoPorLogin
                ? `${anomalia.ultimaAtualizacaoPorLogin}${anomalia.ultimaAtualizacaoPorPerfil ? ` (${anomalia.ultimaAtualizacaoPorPerfil})` : ""}`
                : "—"
            }
          />
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

      {/* Formulário ou bloqueio */}
      {!podeEditar ? (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-5 text-sm text-muted-foreground md:p-6">
          <Lock className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <p>
            Esta anomalia já foi resolvida. Somente a Gestão Industrial pode corrigir dados de
            fechamento.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
            <AlertTriangle className="h-5 w-5 text-warning-foreground" />
            Atualizar status
          </h2>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="status">Novo status *</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm((s) => ({ ...s, status: v as StatusEditavelManutencao }))
                }
              >
                <SelectTrigger id="status" className="w-full md:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {opcoes.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="responsavel">Responsável pela manutenção *</Label>
              <Input
                id="responsavel"
                placeholder="Nome do técnico que executou"
                value={form.responsavel}
                onChange={(e) => setForm((s) => ({ ...s, responsavel: e.target.value }))}
                maxLength={120}
              />
              {erros.responsavel && (
                <p className="text-sm text-destructive">{erros.responsavel}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="oque">O que foi feito? *</Label>
              <Textarea
                id="oque"
                placeholder="Descreva o que foi feito ou está sendo feito para resolver"
                value={form.oQueFoiFeito}
                onChange={(e) => setForm((s) => ({ ...s, oQueFoiFeito: e.target.value }))}
                maxLength={2000}
                rows={4}
              />
              {erros.oQueFoiFeito && (
                <p className="text-sm text-destructive">{erros.oQueFoiFeito}</p>
              )}
            </div>

            {form.status === "Resolvida" && (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                O horário de resolução será registrado automaticamente neste momento. Para
                ajustar manualmente, peça à Gestão Industrial.
              </p>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={salvar} disabled={salvando} size="lg">
                {salvando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  "Salvar atualização"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Histórico */}
      <div
        ref={historicoRef}
        className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6"
      >
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
          <History className="h-5 w-5 text-primary" />
          Histórico de atualizações
        </h2>
        {loadingHistorico ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : historico.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Nenhuma atualização registrada ainda.
          </p>
        ) : (
          <ol className="space-y-3">
            {historico.map((h) => (
              <HistoricoItem key={h.id} item={h} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function HistoricoItem({ item }: { item: AnomaliaAtualizacao }) {
  return (
    <li className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">
          {formatarDataHora(item.atualizadoEm)}
        </span>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs font-semibold text-foreground">{item.atualizadoPorLogin}</span>
        <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
          {item.atualizadoPorPerfil}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusAnomaliaBadge status={item.statusAnterior} />
        <span className="text-xs text-muted-foreground">→</span>
        <StatusAnomaliaBadge status={item.statusNovo} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Responsável
          </p>
          <p className="text-foreground">{item.responsavelManutencao || "—"}</p>
        </div>
        {item.resolvidoEmInformado && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Resolvido em (informado)
            </p>
            <p className="text-foreground">
              {formatarDataHora(item.resolvidoEmInformado)}{" "}
              <span className="text-xs text-muted-foreground">
                · {item.origemHorario === "manual_gestao" ? "manual" : "automático"}
              </span>
            </p>
          </div>
        )}
      </div>

      {item.oQueFoiFeito && (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            O que foi feito
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{item.oQueFoiFeito}</p>
        </div>
      )}
    </li>
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
