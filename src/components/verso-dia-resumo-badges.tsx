import { CheckCircle2, AlertTriangle, Clock, MinusCircle, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LABEL_LIMPEZA_STATUS } from "@/lib/verso/constants";
import type { ResumoVerso } from "@/lib/verso/resumo";

function tonClasses(tone: "verde" | "ambar" | "vermelho" | "cinza"): string {
  switch (tone) {
    case "verde":
      return "border-success/30 bg-success-soft text-success";
    case "ambar":
      return "border-warning/40 bg-warning/15 text-warning-foreground";
    case "vermelho":
      return "border-destructive/40 bg-destructive-soft text-destructive";
    case "cinza":
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

function tonLimpeza(status: ResumoVerso["limpeza"]["dia"]): {
  tone: "verde" | "ambar" | "vermelho" | "cinza";
  Icon: typeof CheckCircle2;
} {
  if (status === "validado") return { tone: "verde", Icon: CheckCircle2 };
  if (status === "aguardando_validacao") return { tone: "ambar", Icon: Clock };
  if (status === "rascunho" || status === "pendente")
    return { tone: "ambar", Icon: Clock };
  return { tone: "cinza", Icon: MinusCircle };
}

function labelLimpeza(status: ResumoVerso["limpeza"]["dia"]): string {
  if (!status) return "Sem registro";
  return LABEL_LIMPEZA_STATUS[status] ?? status;
}

/**
 * Mostra os badges de saúde do verso (PTP + Limpeza) no card da folha do dia.
 * Renderiza apenas se `resumo` foi calculado (chamador deve gatear por
 * `temVerso(folha)`).
 */
export function VersoDiaResumoBadges({ resumo }: { resumo: ResumoVerso | undefined }) {
  if (!resumo) return null;

  const { ptp, limpeza, saude } = resumo;

  // PTP ─────
  let tonPtp: "verde" | "ambar" | "vermelho" | "cinza" = "cinza";
  let IconPtp = MinusCircle;
  let labelPtp = "Verso não iniciado";
  if (ptp.registradas === 0) {
    tonPtp = "cinza";
    IconPtp = MinusCircle;
    labelPtp = "PTP não iniciado";
  } else if (ptp.comOcorrencia > 0) {
    tonPtp = "vermelho";
    IconPtp = AlertTriangle;
    labelPtp = `PTP ${ptp.finalizadas}/${TOTAL_JANELAS} · ${ptp.comOcorrencia} c/ ocorrência`;
  } else if (ptp.finalizadas === TOTAL_JANELAS) {
    tonPtp = "verde";
    IconPtp = CheckCircle2;
    labelPtp = `PTP ${TOTAL_JANELAS}/${TOTAL_JANELAS} completo`;
  } else {
    tonPtp = "ambar";
    IconPtp = Clock;
    labelPtp = `PTP ${ptp.finalizadas}/${TOTAL_JANELAS}`;
  }

  // Saúde geral
  const labelSaude: Record<typeof saude, string> = {
    completo: "Verso completo",
    atencao: "Verso com atenção",
    parcial: "Verso parcial",
    nao_iniciado: "Verso não iniciado",
  };
  const tonSaude: Record<typeof saude, "verde" | "ambar" | "vermelho" | "cinza"> = {
    completo: "verde",
    atencao: "vermelho",
    parcial: "ambar",
    nao_iniciado: "cinza",
  };
  const IconSaude =
    saude === "completo"
      ? CheckCircle2
      : saude === "atencao"
        ? AlertTriangle
        : saude === "parcial"
          ? Clock
          : MinusCircle;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 md:flex-row md:items-center md:flex-wrap">
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${tonClasses(tonSaude[saude])}`}
        >
          <IconSaude className="h-3.5 w-3.5" />
          {labelSaude[saude]}
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`inline-flex cursor-help items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${tonClasses(tonPtp)}`}
            >
              <IconPtp className="h-3.5 w-3.5" />
              {labelPtp}
              <Info className="h-3 w-3 opacity-60" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-xs">
              <strong>PTP Garrafas</strong> — 12 janelas de 2h cada, ciclo
              operacional <strong>06h → 06h do dia seguinte</strong>.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {ptp.semOcorrencia} sem ocorrência · {ptp.comOcorrencia} c/
              ocorrência · {ptp.naoRodou} não rodou · {ptp.rascunho} rascunho ·{" "}
              {ptp.pendente} pendente
            </p>
          </TooltipContent>
        </Tooltip>

        {(["dia", "noite"] as const).map((slot) => {
          const status = slot === "dia" ? limpeza.dia : limpeza.noite;
          if (!status) return null;
          const { tone, Icon } = tonLimpeza(status);
          return (
            <span
              key={slot}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${tonClasses(tone)}`}
            >
              <Icon className="h-3.5 w-3.5" />
              Limpeza {slot === "dia" ? "Dia" : "Noite"}: {labelLimpeza(status)}
            </span>
          );
        })}

        {ptp.naoPreenchidas > 0 && ptp.registradas > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`inline-flex cursor-help items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${tonClasses("vermelho")}`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {ptp.naoPreenchidas} de {totalJanelas} não preenchida
                {ptp.naoPreenchidas > 1 ? "s" : ""}
                <Info className="h-3 w-3 opacity-60" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">
                <strong>Janelas faltantes:</strong>{" "}
                {ptp.codigosFaltantes.join(", ")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Operador não chegou a preencher essas janelas. Verifique se
                houve perda de dados (sem conexão, logout sem enviar).
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {ptp.comAssinaturaCorrupta > 0 && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${tonClasses("vermelho")}`}
            title="Janelas concluídas sem assinatura — corrupção anterior aos CHECK do banco"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {ptp.comAssinaturaCorrupta} sem assinatura
          </span>
        )}

        {limpeza.itensNaoRealizados > 0 && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${tonClasses("vermelho")}`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {limpeza.itensNaoRealizados}{" "}
            {limpeza.itensNaoRealizados === 1
              ? "item não realizado"
              : "itens não realizados"}
          </span>
        )}

      </div>
    </TooltipProvider>
  );
}
