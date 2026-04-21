import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import {
  fetchObservacoesVerso,
  formatarLinhaObservacao,
  type ObservacaoVerso,
} from "@/lib/verso/observacoes";

interface Props {
  folhaDiaKey: string;
  /** Texto opcional do título. Default: "Observações da folha (verso)" */
  titulo?: string;
}

/**
 * Espelho consolidado das observações do verso (PTP + Limpeza) que
 * aparece dentro do campo "Observações" oficial da frente da folha.
 *
 * Cada linha:  [PTP J01 21/04 08:13] texto...
 */
export function ObservacoesVersoConsolidado({ folhaDiaKey, titulo }: Props) {
  const [obs, setObs] = useState<ObservacaoVerso[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setErro(null);
    setObs(null);
    fetchObservacoesVerso(folhaDiaKey)
      .then((data) => {
        if (ativo) setObs(data);
      })
      .catch((e) => {
        console.error(e);
        if (ativo) setErro("Não foi possível carregar as observações do verso.");
      });
    return () => {
      ativo = false;
    };
  }, [folhaDiaKey]);

  if (erro) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        {erro}
      </div>
    );
  }

  if (!obs) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Carregando observações da folha...
      </div>
    );
  }

  if (obs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted-foreground">
        Nenhuma observação registrada no verso desta folha.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-primary" />
        <h3 className="text-base font-bold text-foreground">
          {titulo ?? "Observações da folha (verso)"}
        </h3>
      </div>
      <ul className="space-y-1.5 font-mono text-xs leading-relaxed text-foreground">
        {obs.map((o) => (
          <li key={o.id} className="whitespace-pre-wrap">
            {formatarLinhaObservacao(o)}
          </li>
        ))}
      </ul>
    </div>
  );
}
