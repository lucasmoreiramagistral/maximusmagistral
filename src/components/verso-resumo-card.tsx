import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { VersoDiaResumoBadges } from "@/components/verso-dia-resumo-badges";
import { formatarData } from "@/lib/checklist/format";
import type { FolhaChecklistDia } from "@/lib/checklist/types";
import {
  LABEL_LIMPEZA_STATUS,
  PTP_JANELAS,
} from "@/lib/verso/constants";
import type { ResumoVerso } from "@/lib/verso/resumo";

const TOTAL_JANELAS = PTP_JANELAS.length;

function statusLimpezaLabel(status: ResumoVerso["limpeza"]["dia"]): string {
  if (!status) return "Sem registro";
  return LABEL_LIMPEZA_STATUS[status] ?? status;
}

function blocoClasses(tone: "default" | "success" | "warning" | "danger") {
  switch (tone) {
    case "success":
      return "border-success/30 bg-success-soft text-success";
    case "warning":
      return "border-warning/40 bg-warning/15 text-warning-foreground";
    case "danger":
      return "border-destructive/40 bg-destructive-soft text-destructive";
    case "default":
    default:
      return "border-border bg-muted/30 text-foreground";
  }
}

function MiniInfo({
  label,
  valor,
  tone = "default",
}: {
  label: string;
  valor: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${blocoClasses(tone)}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-sm font-bold">{valor}</p>
    </div>
  );
}

export function VersoResumoCard({
  folha,
  href,
  resumo,
}: {
  folha: FolhaChecklistDia;
  href: string;
  resumo: ResumoVerso | undefined;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Verso do dia
          </p>
          <p className="text-lg font-bold text-foreground md:text-xl">
            {formatarData(folha.contexto.data)} · {folha.contexto.linha} · {folha.contexto.maquina}
          </p>
          <p className="text-sm text-muted-foreground">
            PTP Garrafas + Limpeza Sala de Envase
          </p>
        </div>
        <Button asChild>
          <Link to={href}>Abrir dia</Link>
        </Button>
      </div>

      {resumo ? (
        <>
          <VersoDiaResumoBadges resumo={resumo} />

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-border bg-muted/20 p-4">
              <h3 className="text-sm font-bold text-foreground">PTP</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MiniInfo
                  label="Finalizadas"
                  valor={`${resumo.ptp.finalizadas}/${TOTAL_JANELAS}`}
                  tone={resumo.ptp.finalizadas === TOTAL_JANELAS ? "success" : "warning"}
                />
                <MiniInfo
                  label="Registradas"
                  valor={`${resumo.ptp.registradas}/${TOTAL_JANELAS}`}
                />
                <MiniInfo
                  label="Ocorrências"
                  valor={String(resumo.ptp.comOcorrencia)}
                  tone={resumo.ptp.comOcorrencia > 0 ? "danger" : "success"}
                />
                <MiniInfo
                  label="Pendentes / rascunho"
                  valor={String(resumo.ptp.pendente + resumo.ptp.rascunho)}
                  tone={resumo.ptp.pendente + resumo.ptp.rascunho > 0 ? "warning" : "default"}
                />
              </div>
            </section>

            <section className="rounded-xl border border-border bg-muted/20 p-4">
              <h3 className="text-sm font-bold text-foreground">Limpeza</h3>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <MiniInfo
                  label="12x36 Dia"
                  valor={statusLimpezaLabel(resumo.limpeza.dia)}
                  tone={
                    resumo.limpeza.dia === "validado"
                      ? "success"
                      : resumo.limpeza.dia
                        ? "warning"
                        : "default"
                  }
                />
                <MiniInfo
                  label="12x36 Noite"
                  valor={statusLimpezaLabel(resumo.limpeza.noite)}
                  tone={
                    resumo.limpeza.noite === "validado"
                      ? "success"
                      : resumo.limpeza.noite
                        ? "warning"
                        : "default"
                  }
                />
                <MiniInfo
                  label="Itens não realizados"
                  valor={String(resumo.limpeza.itensNaoRealizados)}
                  tone={resumo.limpeza.itensNaoRealizados > 0 ? "danger" : "success"}
                />
              </div>
            </section>
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          Carregando informações do verso…
        </div>
      )}
    </div>
  );
}
