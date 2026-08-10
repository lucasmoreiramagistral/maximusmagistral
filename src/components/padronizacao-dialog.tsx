/**
 * O A do PDCA — a etapa que não tinha tela.
 *
 * As colunas `padronizacao_*` existem desde a migration 04 e nada as
 * preenchia, então todo plano parava no C: checava-se se o problema saiu e
 * pronto. Só que "saiu" não é o fim do ciclo. O fim é decidir o que fazer com
 * o que se aprendeu — e é essa decisão que impede o mesmo problema de voltar
 * daqui a três meses com outro operador.
 *
 * Quem decide é supervisor ou gestão. Quem executou a ação não é quem julga
 * que ela virou padrão; a migration 06 impõe isso também no banco.
 */

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Usuario } from "@/lib/checklist/types";
import { padronizarPlano, type DecisaoPadronizacao } from "@/lib/farol/planos-storage";
import type { PlanoAcao } from "@/lib/farol/planos-types";

const OPCOES: Array<{
  valor: DecisaoPadronizacao;
  titulo: string;
  descricao: string;
}> = [
  {
    valor: "padronizar",
    titulo: "Virou padrão",
    descricao:
      "A ação entra no procedimento. Exige dizer qual documento mudou — senão padronizar é só palavra.",
  },
  {
    valor: "monitorar",
    titulo: "Seguir monitorando",
    descricao: "Funcionou, mas ainda não dá para confiar. Continua sob observação.",
  },
  {
    valor: "girar",
    titulo: "Girar o ciclo de novo",
    descricao: "Não resolveu de verdade. Volta para o planejamento com o que se aprendeu.",
  },
];

export function PadronizacaoDialog({
  plano,
  titulo,
  usuario,
  onFechar,
  onPronto,
}: {
  plano: PlanoAcao | null;
  titulo: string;
  usuario: Usuario;
  onFechar: () => void;
  onPronto: () => void;
}) {
  const [decisao, setDecisao] = useState<DecisaoPadronizacao | null>(null);
  const [analise, setAnalise] = useState("");
  const [padraoRef, setPadraoRef] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  if (!plano) return null;

  const salvar = async () => {
    if (!decisao) {
      setErro("Escolha o que fazer com o aprendizado.");
      return;
    }
    setSalvando(true);
    setErro("");
    const r = await padronizarPlano(plano, { decisao, analise, padraoRef }, usuario);
    setSalvando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    onPronto();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-padronizacao"
    >
      <div className="my-8 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-xl font-black text-primary-foreground">
            A
          </span>
          <div className="flex-1">
            <h2 id="titulo-padronizacao" className="text-lg font-bold text-foreground">
              Fechar o ciclo
            </h2>
            <p className="text-sm text-muted-foreground">{titulo}</p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-border bg-muted/30 p-3 text-sm">
          <p className="font-semibold text-foreground">{plano.oQue}</p>
          <p className="text-xs text-muted-foreground">
            {plano.quem} · checado por {plano.checadoPorNome ?? "—"}
          </p>
          {plano.checagemEvidencia && (
            <p className="mt-1 text-xs text-muted-foreground">
              Evidência: {plano.checagemEvidencia}
            </p>
          )}
        </div>

        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-bold text-foreground">
            O que fazer com o aprendizado? *
          </legend>
          <div className="space-y-2">
            {OPCOES.map((o) => (
              <button
                key={o.valor}
                type="button"
                onClick={() => setDecisao(o.valor)}
                aria-pressed={decisao === o.valor}
                className={cn(
                  "w-full rounded-xl border-2 p-3 text-left transition-colors",
                  decisao === o.valor
                    ? "border-primary bg-primary-soft"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <p className="font-bold text-foreground">{o.titulo}</p>
                <p className="text-xs text-muted-foreground">{o.descricao}</p>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mb-3">
          <Label htmlFor="pad-analise">O que foi aprendido? *</Label>
          <p className="mb-1 text-xs text-muted-foreground">
            A causa, não o sintoma. É isto que a próxima equipe vai ler.
          </p>
          <textarea
            id="pad-analise"
            value={analise}
            onChange={(e) => setAnalise(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="Ex.: o dispenser ficava sem recipiente porque a reposição não tinha responsável definido no turno da noite."
          />
        </div>

        {decisao === "padronizar" && (
          <div className="mb-3">
            <Label htmlFor="pad-ref">Qual procedimento mudou? *</Label>
            <Input
              id="pad-ref"
              value={padraoRef}
              onChange={(e) => setPadraoRef(e.target.value)}
              placeholder="Ex.: FM28 rev.3 — item 2"
            />
          </div>
        )}

        {erro && (
          <p
            role="alert"
            className="mb-3 rounded-lg border border-destructive/40 bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive"
          >
            {erro}
          </p>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={salvando}
            onClick={() => void salvar()}
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar decisão"}
          </Button>
        </div>
      </div>
    </div>
  );
}
