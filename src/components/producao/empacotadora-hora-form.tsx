import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  calcularPacotesEmpacotadora,
  formacaoPorTamanho,
  PALETIZACAO_EMPACOTADORA,
  type TamanhoProdutoEmpacotadora,
} from "@/lib/producao/paletizacao";

export interface EntradaHoraEmpacotadora {
  tamanhoProduto: TamanhoProdutoEmpacotadora | null;
  /** Pode citar dois sabores quando a troca ocorrer dentro desta hora. */
  sabor: string | null;
  paletesCompletos: number;
  /** Pacotes do palete incompleto, não porcentagem nem perdas. */
  quebraPacotes: number;
  pacotesPorPalete: number | null;
  /** (paletesCompletos × pacotesPorPalete) + quebraPacotes. */
  quantidade: number;
  meta: number | null;
  tempoParadaMin: number;
  motivoParada: string | null;
  tipoSetup: "troca_sabor" | "troca_tamanho" | null;
}

export interface EmpacotadoraHoraFormProps {
  horaRotulo: string;
  maquina: "Empacotadora 2" | "Empacotadora 3";
  /** O componente deve ser remontado com uma chave por máquina/hora ao trocar de registro. */
  valorInicial?:
    | (Partial<Omit<EntradaHoraEmpacotadora, "tempoParadaMin">> & {
        tempoParadaMin?: number | null;
      })
    | null;
  /** Um registro salvo é só para consulta. A imutabilidade real também deve existir no banco. */
  jaSalvo?: boolean;
  salvando?: boolean;
  /** Resolver apenas depois da confirmação do banco; erros mantêm a revisão aberta. */
  onSalvar: (entrada: EntradaHoraEmpacotadora) => Promise<void> | void;
}

function inteiroDigitado(valor: string): number | null {
  if (!/^\d+$/.test(valor.trim())) return null;
  const numero = Number(valor);
  return Number.isSafeInteger(numero) ? numero : null;
}

function formatoPacotes(valor: number): string {
  return valor.toLocaleString("pt-BR");
}

function formacaoValida(valor: string): valor is TamanhoProdutoEmpacotadora {
  return PALETIZACAO_EMPACOTADORA.some((item) => item.tamanho === valor);
}

/**
 * Entrada para o Hora x Hora das duas empacotadoras. Mantém a conta à vista
 * enquanto o operador digita e exige uma segunda conferência antes do save.
 */
export function EmpacotadoraHoraForm({
  horaRotulo,
  maquina,
  valorInicial,
  jaSalvo = false,
  salvando = false,
  onSalvar,
}: EmpacotadoraHoraFormProps) {
  const [tamanho, setTamanho] = useState<string>(valorInicial?.tamanhoProduto ?? "");
  const [sabor, setSabor] = useState(valorInicial?.sabor ?? "");
  const [paletes, setPaletes] = useState(String(valorInicial?.paletesCompletos ?? 0));
  const [quebra, setQuebra] = useState(String(valorInicial?.quebraPacotes ?? 0));
  const [meta, setMeta] = useState(valorInicial?.meta == null ? "" : String(valorInicial.meta));
  const [tempoParada, setTempoParada] = useState(
    valorInicial?.tempoParadaMin == null ? "" : String(valorInicial.tempoParadaMin),
  );
  const [motivoParada, setMotivoParada] = useState(valorInicial?.motivoParada ?? "");
  const [tipoSetup, setTipoSetup] = useState<EntradaHoraEmpacotadora["tipoSetup"]>(
    valorInicial?.tipoSetup ?? null,
  );
  const [revisao, setRevisao] = useState<EntradaHoraEmpacotadora | null>(null);
  const [confirmadoLocal, setConfirmadoLocal] = useState<EntradaHoraEmpacotadora | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Dados podem chegar após o carregamento da folha; não zerar a digitação em
  // re-renderizações normais do pai porque os deps são valores primitivos.
  useEffect(() => {
    setTamanho(valorInicial?.tamanhoProduto ?? "");
    setSabor(valorInicial?.sabor ?? "");
    setPaletes(String(valorInicial?.paletesCompletos ?? 0));
    setQuebra(String(valorInicial?.quebraPacotes ?? 0));
    setMeta(valorInicial?.meta == null ? "" : String(valorInicial.meta));
    setTempoParada(valorInicial?.tempoParadaMin == null ? "" : String(valorInicial.tempoParadaMin));
    setMotivoParada(valorInicial?.motivoParada ?? "");
    setTipoSetup(valorInicial?.tipoSetup ?? null);
    setRevisao(null);
    setConfirmadoLocal(null);
    setErro(null);
  }, [
    maquina,
    horaRotulo,
    valorInicial?.tamanhoProduto,
    valorInicial?.sabor,
    valorInicial?.paletesCompletos,
    valorInicial?.quebraPacotes,
    valorInicial?.meta,
    valorInicial?.tempoParadaMin,
    valorInicial?.motivoParada,
    valorInicial?.tipoSetup,
  ]);

  const formacao = formacaoValida(tamanho) ? formacaoPorTamanho(tamanho) : null;
  const paletesNumero = inteiroDigitado(paletes);
  const quebraNumero = inteiroDigitado(quebra);
  const quebraExcedeCapacidade =
    formacao !== null && quebraNumero !== null && quebraNumero >= formacao.pacotesPorPalete;
  const subtotal =
    formacao && paletesNumero !== null && quebraNumero !== null && !quebraExcedeCapacidade
      ? paletesNumero * formacao.pacotesPorPalete + quebraNumero
      : !formacao && paletesNumero === 0 && quebraNumero === 0
        ? 0
        : null;
  const inativo = salvando || enviando;

  function prepararRevisao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (jaSalvo || confirmadoLocal || inativo) return;
    setErro(null);

    if (paletesNumero === null || quebraNumero === null) {
      setErro("Informe números inteiros de paletes completos e pacotes de quebra.");
      return;
    }
    const minutos = inteiroDigitado(tempoParada);
    if (minutos === null || minutos > 60) {
      setErro("Informe os minutos parados desta hora, de 0 a 60.");
      return;
    }
    const metaNumero = meta.trim() === "" ? null : inteiroDigitado(meta);
    if (meta.trim() !== "" && metaNumero === null) {
      setErro("A meta deve ser um número inteiro de pacotes, igual ou maior que zero.");
      return;
    }
    if (!formacao && (paletesNumero > 0 || quebraNumero > 0)) {
      setErro("Selecione o tamanho do produto para calcular os pacotes.");
      return;
    }

    let quantidade = 0;
    let pacotesPorPalete: number | null = null;
    if (formacao) {
      try {
        const calculo = calcularPacotesEmpacotadora(formacao.tamanho, paletesNumero, quebraNumero);
        quantidade = calculo.totalPacotes;
        pacotesPorPalete = calculo.pacotesPorPalete;
      } catch (falha) {
        setErro(falha instanceof Error ? falha.message : "Confira os valores de produção.");
        return;
      }
    }
    if (quantidade > 0 && !sabor.trim()) {
      setErro("Informe o sabor produzido. Se houve troca, escreva os dois sabores.");
      return;
    }
    if (minutos > 0 && !motivoParada.trim() && !tipoSetup) {
      setErro("Informe o motivo da parada ou selecione o tipo de setup.");
      return;
    }
    if (quantidade === 0 && !motivoParada.trim() && !tipoSetup) {
      setErro("Sem produção: informe o motivo ou selecione o tipo de setup.");
      return;
    }
    setRevisao({
      tamanhoProduto: formacao?.tamanho ?? null,
      sabor: sabor.trim() || null,
      paletesCompletos: paletesNumero,
      quebraPacotes: quebraNumero,
      pacotesPorPalete,
      quantidade,
      meta: metaNumero,
      tempoParadaMin: minutos,
      motivoParada: motivoParada.trim() || null,
      tipoSetup,
    });
  }

  async function confirmarSalvar() {
    if (!revisao || jaSalvo || confirmadoLocal || inativo) return;
    setEnviando(true);
    setErro(null);
    try {
      await onSalvar(revisao);
      setConfirmadoLocal(revisao);
      setRevisao(null);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível salvar a hora.");
    } finally {
      setEnviando(false);
    }
  }

  const registroFechado = jaSalvo ? valorInicial : confirmadoLocal;
  if (jaSalvo || confirmadoLocal) {
    return (
      <section
        className="space-y-3 rounded-2xl border border-border bg-card p-4"
        aria-label="Hora salva"
      >
        <div>
          <p className="text-sm font-bold text-foreground">
            {maquina} · {horaRotulo}
          </p>
          <p className="text-xs text-muted-foreground">
            Registro salvo. Esta hora está fechada para edição.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Dado rotulo="Produto" valor={registroFechado?.tamanhoProduto ?? "Sem produção"} />
          <Dado rotulo="Sabor" valor={registroFechado?.sabor ?? "—"} />
          <Dado rotulo="Paletes completos" valor={registroFechado?.paletesCompletos ?? "—"} />
          <Dado rotulo="Quebra (pacotes)" valor={registroFechado?.quebraPacotes ?? "—"} />
          <Dado rotulo="Produção (pacotes)" valor={registroFechado?.quantidade ?? "—"} />
          <Dado rotulo="Meta (pacotes)" valor={registroFechado?.meta ?? "—"} />
          <Dado rotulo="Minutos parados" valor={registroFechado?.tempoParadaMin ?? "—"} />
        </div>
        {(registroFechado?.tipoSetup || registroFechado?.motivoParada) && (
          <p className="text-sm text-muted-foreground">
            {registroFechado.tipoSetup === "troca_sabor"
              ? "Troca de sabor. "
              : registroFechado.tipoSetup === "troca_tamanho"
                ? "Troca de tamanho. "
                : ""}
            {registroFechado.motivoParada}
          </p>
        )}
      </section>
    );
  }

  if (revisao) {
    return (
      <section
        className="space-y-4 rounded-2xl border-2 border-primary/40 bg-card p-4"
        aria-label="Conferir hora"
      >
        <div>
          <h3 className="text-base font-bold text-foreground">Confira antes de salvar</h3>
          <p className="text-sm text-muted-foreground">
            {maquina} · {horaRotulo}
          </p>
        </div>
        <div className="rounded-xl bg-primary-soft p-4 text-sm">
          <p className="font-semibold text-foreground">
            {revisao.pacotesPorPalete === null
              ? "Sem produção nesta hora"
              : `${revisao.paletesCompletos} palete(s) × ${revisao.pacotesPorPalete} pacotes + ${revisao.quebraPacotes} de quebra`}
          </p>
          <p className="mt-1 text-xl font-bold text-primary">
            {formatoPacotes(revisao.quantidade)} pacotes produzidos
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Dado rotulo="Tamanho" valor={revisao.tamanhoProduto ?? "Sem produção"} />
          <Dado rotulo="Sabor(es)" valor={revisao.sabor ?? "—"} />
          <Dado rotulo="Meta (pacotes)" valor={revisao.meta ?? "Não informada"} />
          <Dado rotulo="Minutos parados" valor={revisao.tempoParadaMin} />
          <Dado
            rotulo="Setup"
            valor={
              revisao.tipoSetup === "troca_sabor"
                ? "Troca de sabor"
                : revisao.tipoSetup === "troca_tamanho"
                  ? "Troca de tamanho"
                  : "Não houve"
            }
          />
        </div>
        {revisao.motivoParada && <Dado rotulo="Motivo da parada" valor={revisao.motivoParada} />}
        <p className="rounded-lg border border-amber-400/50 bg-amber-100/60 px-3 py-2 text-sm font-semibold text-foreground">
          Depois de confirmar, o operador não poderá alterar estes valores.
        </p>
        {erro && (
          <p className="text-sm font-semibold text-destructive" role="alert">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={inativo}
            onClick={() => setRevisao(null)}
          >
            Corrigir antes de salvar
          </Button>
          <Button type="button" disabled={inativo} onClick={confirmarSalvar}>
            {inativo ? "Salvando..." : "Confirmar e salvar hora"}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <form className="space-y-4" onSubmit={prepararRevisao}>
      <div>
        <h3 className="text-base font-bold text-foreground">
          {maquina} · {horaRotulo}
        </h3>
        <p className="text-sm text-muted-foreground">
          Informe os paletes completos e os pacotes do palete incompleto.
        </p>
      </div>

      <div>
        <Label htmlFor="emp-tamanho">Tamanho do produto</Label>
        <select
          id="emp-tamanho"
          value={tamanho}
          onChange={(evento) => setTamanho(evento.target.value)}
          className="mt-1 flex h-12 w-full rounded-md border border-input bg-background px-3 text-base text-foreground"
        >
          <option value="">Selecione se produziu</option>
          {PALETIZACAO_EMPACOTADORA.map((produto) => (
            <option key={produto.tamanho} value={produto.tamanho}>
              {produto.tamanho} · {produto.pacotesPorPalete} pacotes/palete
            </option>
          ))}
        </select>
        {formacao && (
          <p className="mt-1 text-xs text-muted-foreground">
            {formacao.unidadesPorPacote} unidades por pacote · {formacao.pacotesPorPalete} pacotes
            por palete
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="emp-sabor">Sabor produzido</Label>
        <Input
          id="emp-sabor"
          value={sabor}
          onChange={(evento) => setSabor(evento.target.value)}
          placeholder="Se houve troca nesta hora, escreva os dois sabores"
          className="mt-1 h-12 text-base"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="emp-paletes">Paletes completos</Label>
          <Input
            id="emp-paletes"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={paletes}
            onChange={(evento) => setPaletes(evento.target.value)}
            className="mt-1 h-12 text-base"
          />
        </div>
        <div>
          <Label htmlFor="emp-quebra">Quebra: pacotes do palete incompleto</Label>
          <Input
            id="emp-quebra"
            type="number"
            min="0"
            max={formacao ? formacao.pacotesPorPalete - 1 : undefined}
            step="1"
            inputMode="numeric"
            value={quebra}
            onChange={(evento) => setQuebra(evento.target.value)}
            className="mt-1 h-12 text-base"
            aria-invalid={quebraExcedeCapacidade}
          />
          {quebraExcedeCapacidade && (
            <p className="mt-1 text-xs font-semibold text-destructive">
              {formacao.pacotesPorPalete} pacotes já formam outro palete completo.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-primary-soft px-4 py-3" aria-live="polite">
        <p className="text-sm text-foreground">
          {formacao
            ? `${paletesNumero ?? "—"} palete(s) × ${formacao.pacotesPorPalete} + ${quebraNumero ?? "—"} de quebra`
            : subtotal === 0
              ? "Sem produção nesta hora. Informe o motivo abaixo."
              : "Selecione o produto para ver a conta."}
        </p>
        <p className="mt-1 text-xl font-bold text-primary">
          {subtotal !== null && Number.isSafeInteger(subtotal)
            ? `${formatoPacotes(subtotal)} pacotes produzidos`
            : "Total a calcular"}
        </p>
      </div>

      <div>
        <Label htmlFor="emp-meta">Meta da hora (pacotes, opcional)</Label>
        <Input
          id="emp-meta"
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={meta}
          onChange={(evento) => setMeta(evento.target.value)}
          placeholder="Informe a meta se estiver definida"
          className="mt-1 h-12 text-base"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="emp-parada">Minutos parados nesta hora</Label>
          <Input
            id="emp-parada"
            type="number"
            min="0"
            max="60"
            step="1"
            inputMode="numeric"
            value={tempoParada}
            onChange={(evento) => setTempoParada(evento.target.value)}
            placeholder="0 a 60"
            className="mt-1 h-12 text-base"
          />
        </div>
        <div>
          <Label htmlFor="emp-setup">Tipo de setup (se houve)</Label>
          <select
            id="emp-setup"
            value={tipoSetup ?? ""}
            onChange={(evento) =>
              setTipoSetup(
                evento.target.value === "troca_sabor" || evento.target.value === "troca_tamanho"
                  ? evento.target.value
                  : null,
              )
            }
            className="mt-1 flex h-12 w-full rounded-md border border-input bg-background px-3 text-base text-foreground"
          >
            <option value="">Não houve</option>
            <option value="troca_sabor">Troca de sabor</option>
            <option value="troca_tamanho">Troca de tamanho</option>
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="emp-motivo">Motivo da parada ou observação (quando houver)</Label>
        <Textarea
          id="emp-motivo"
          value={motivoParada}
          onChange={(evento) => setMotivoParada(evento.target.value)}
          placeholder="Ex.: falta de filme, manutenção, sem programação"
          className="mt-1 text-base"
        />
      </div>

      {erro && (
        <p className="text-sm font-semibold text-destructive" role="alert">
          {erro}
        </p>
      )}
      <Button type="submit" className="h-12 w-full" disabled={inativo}>
        Revisar hora
      </Button>
    </form>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="font-semibold text-foreground">{valor}</p>
    </div>
  );
}
