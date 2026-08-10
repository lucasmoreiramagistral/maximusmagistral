/**
 * Abrir plano de ação e checar o resultado.
 *
 * As duas metades do que o papel do gerente pede da liderança:
 *   "Itens NC → Plano Ação"
 *   "Plano de Ação cumprido? Farol Sim/Não · Saiu NC"
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Usuario } from "@/lib/checklist/types";
import type { Pendencia } from "@/lib/farol/pendencias";
import { abrirPlano, checarPlano, type Checagem } from "@/lib/farol/planos-storage";
import { formatarDataBR } from "@/lib/operacao/data-operacional";

type Modo = "plano" | "checagem";

export function PlanoAcaoDialog({
  pendencia,
  usuario,
  onFechar,
  onSalvo,
}: {
  pendencia: Pendencia;
  usuario: Usuario;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  // Plano em aberto → o que falta é checar. Sem plano ou reprovado → planejar.
  const modoInicial: Modo =
    pendencia.plano && pendencia.plano.status === "aberto" ? "checagem" : "plano";
  const [modo] = useState<Modo>(modoInicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/50 p-4 md:p-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <p className="text-lg font-bold text-foreground">
              {modo === "plano"
                ? pendencia.plano
                  ? "Replanejar ação"
                  : "Abrir plano de ação"
                : "Checar o resultado"}
            </p>
            <p className="text-xs text-muted-foreground">
              {pendencia.maquina} · {pendencia.turno} · aberta há{" "}
              <b className={pendencia.idadeDias > 30 ? "text-destructive" : undefined}>
                {pendencia.idadeDias} dias
              </b>{" "}
              (desde {formatarDataBR(pendencia.dataOrigem)})
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-md px-2 text-2xl leading-none text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              A não conformidade
            </p>
            <p className="mt-1 font-bold text-foreground">{pendencia.titulo}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ação tomada na hora: {pendencia.detalhe}
            </p>
          </div>

          {erro && (
            <p className="rounded-lg bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive">
              {erro}
            </p>
          )}

          {modo === "plano" ? (
            <FormPlano
              pendencia={pendencia}
              usuario={usuario}
              salvando={salvando}
              setSalvando={setSalvando}
              setErro={setErro}
              onFechar={onFechar}
              onSalvo={onSalvo}
            />
          ) : (
            <FormChecagem
              pendencia={pendencia}
              usuario={usuario}
              salvando={salvando}
              setSalvando={setSalvando}
              setErro={setErro}
              onFechar={onFechar}
              onSalvo={onSalvo}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface FormProps {
  pendencia: Pendencia;
  usuario: Usuario;
  salvando: boolean;
  setSalvando: (v: boolean) => void;
  setErro: (v: string) => void;
  onFechar: () => void;
  onSalvo: () => void;
}

const campo =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const rotulo = "block text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1";

function FormPlano({
  pendencia,
  usuario,
  salvando,
  setSalvando,
  setErro,
  onFechar,
  onSalvo,
}: FormProps) {
  const anterior = pendencia.plano;
  const [oQue, setOQue] = useState(anterior?.oQue ?? "");
  const [quem, setQuem] = useState(anterior?.quem ?? "");
  const [quando, setQuando] = useState("");
  const [como, setComo] = useState(anterior?.como ?? "");

  const salvar = async () => {
    if (!oQue.trim() || !quem.trim() || !quando) {
      setErro("Preencha o quê, quem e o prazo.");
      return;
    }
    setSalvando(true);
    setErro("");
    const r = await abrirPlano(
      pendencia,
      { oQue: oQue.trim(), quem: quem.trim(), quando, como: como.trim() || undefined },
      usuario,
    );
    setSalvando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    onSalvo();
    onFechar();
  };

  return (
    <>
      {anterior?.status === "nao_cumprido" && (
        <div className="rounded-xl border-2 border-destructive/40 bg-destructive-soft/50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-destructive">
            Plano anterior não cumprido
          </p>
          <p className="mt-1 text-sm text-foreground">
            {anterior.oQue} · {anterior.quem}
          </p>
          {anterior.checagemEvidencia && (
            <p className="mt-1 text-sm text-muted-foreground">{anterior.checagemEvidencia}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            O anterior fica no histórico. Este é um plano novo.
          </p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className={rotulo} htmlFor="pa-oque">
            O quê será feito *
          </label>
          <input
            id="pa-oque"
            className={campo}
            value={oQue}
            onChange={(e) => setOQue(e.target.value)}
            placeholder="Ex.: Trocar guarnição e sede do bico 14"
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="pa-quem">
            Quem é o responsável *
          </label>
          <input
            id="pa-quem"
            className={campo}
            value={quem}
            onChange={(e) => setQuem(e.target.value)}
            placeholder="Ex.: Manutenção — Jonas"
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="pa-quando">
            Prazo *
          </label>
          <input
            id="pa-quando"
            type="date"
            className={campo}
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <label className={rotulo} htmlFor="pa-como">
            Como será feito
          </label>
          <textarea
            id="pa-como"
            className={cn(campo, "min-h-[72px] resize-y")}
            value={como}
            onChange={(e) => setComo(e.target.value)}
            placeholder="Recursos, parada necessária, peça, procedimento…"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Fica registrado no seu nome: <b className="text-foreground">{usuario.nome}</b>.
      </p>

      <div className="flex justify-end gap-2">
        <BotaoSecundario onClick={onFechar}>Cancelar</BotaoSecundario>
        <BotaoPrimario onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar plano de ação"}
        </BotaoPrimario>
      </div>
    </>
  );
}

function FormChecagem({
  pendencia,
  usuario,
  salvando,
  setSalvando,
  setErro,
  onFechar,
  onSalvo,
}: FormProps) {
  // Começam VAZIOS de propósito: obrigam escolha consciente. Um "Sim"
  // pré-marcado é exatamente o tipo de coisa que um black belt testa.
  const [cumprido, setCumprido] = useState<boolean | null>(null);
  const [saiuNc, setSaiuNc] = useState<boolean | null>(null);
  const [evidencia, setEvidencia] = useState("");
  const plano = pendencia.plano!;

  const salvar = async () => {
    if (cumprido === null || saiuNc === null) {
      setErro("Responda as duas perguntas.");
      return;
    }
    if (!evidencia.trim()) {
      setErro("Descreva a evidência do que você viu na máquina.");
      return;
    }
    setSalvando(true);
    setErro("");
    const c: Checagem = { cumprido, saiuNc, evidencia: evidencia.trim() };
    const r = await checarPlano(plano, c, usuario);
    setSalvando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    onSalvo();
    onFechar();
  };

  const encerra = cumprido === true && saiuNc === true;

  return (
    <>
      <div className="rounded-xl border-2 border-warning/40 bg-warning/10 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-warning-foreground">
          Plano combinado
        </p>
        <p className="mt-1 font-bold text-foreground">{plano.oQue}</p>
        <p className="text-sm text-muted-foreground">
          {plano.quem} · prazo {formatarDataBR(plano.quando)} · aberto por{" "}
          {plano.criadoPorNome}
        </p>
      </div>

      <SimNao
        pergunta="O plano de ação foi cumprido?"
        valor={cumprido}
        onChange={setCumprido}
      />
      <SimNao
        pergunta="O item saiu da não conformidade?"
        valor={saiuNc}
        onChange={setSaiuNc}
        ajuda="Cumprir o combinado sem resolver o problema não fecha a pendência."
      />

      <div>
        <label className={rotulo} htmlFor="pa-evid">
          Evidência — o que você viu na máquina *
        </label>
        <textarea
          id="pa-evid"
          className={cn(campo, "min-h-[72px] resize-y")}
          value={evidencia}
          onChange={(e) => setEvidencia(e.target.value)}
          placeholder="Ex.: Pressão estabilizada em 3,4 bar, sem gotejamento em 2 horas."
        />
      </div>

      {cumprido !== null && saiuNc !== null && (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-semibold",
            encerra
              ? "bg-success-soft text-success"
              : "bg-destructive-soft text-destructive",
          )}
        >
          {encerra
            ? "A pendência será encerrada e a célula sai do vermelho."
            : "A pendência continua aberta e volta para replanejamento."}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <BotaoSecundario onClick={onFechar}>Cancelar</BotaoSecundario>
        <BotaoPrimario onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Registrar checagem"}
        </BotaoPrimario>
      </div>
    </>
  );
}

function SimNao({
  pergunta,
  valor,
  onChange,
  ajuda,
}: {
  pergunta: string;
  valor: boolean | null;
  onChange: (v: boolean) => void;
  ajuda?: string;
}) {
  return (
    <div>
      <p className="text-sm font-bold text-foreground">{pergunta}</p>
      {ajuda && <p className="mb-1 text-xs text-muted-foreground">{ajuda}</p>}
      <div className="mt-1 flex gap-2">
        {[
          { v: true, r: "SIM" },
          { v: false, r: "NÃO" },
        ].map(({ v, r }) => (
          <button
            key={r}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={valor === v}
            className={cn(
              "flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-bold transition-colors",
              valor === v
                ? v
                  ? "border-success bg-success text-success-foreground"
                  : "border-destructive bg-destructive text-destructive-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40",
            )}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

function BotaoPrimario({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function BotaoSecundario({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-accent"
    >
      {children}
    </button>
  );
}
