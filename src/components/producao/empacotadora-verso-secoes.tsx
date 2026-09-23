import { useEffect, useState } from "react";
import { CheckCircle2, Film, Layers3, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TelaCarregando } from "@/components/tela-carregando";
import type { Turno, Usuario } from "@/lib/checklist/types";
import { MAQUINAS } from "@/lib/maquinas/catalogo";
import type { BobinaFilmeEmpacotadora } from "@/lib/producao/empacotadora-verso";
import {
  validarBobinaFilme,
  validarBobinaParaFechamento,
  validarConsolidacaoProduto,
  validarConsolidacaoParaFechamento,
} from "@/lib/producao/empacotadora-verso";
import {
  buscarVersoEmpacotadora,
  salvarBobinaEmpacotadora,
  salvarConsolidacaoEmpacotadora,
  type ConsolidacaoPersistida,
} from "@/lib/producao/empacotadora-verso-supabase";
import {
  PALETIZACAO_EMPACOTADORA,
  calcularPacotesEmpacotadora,
  formacaoPorTamanho,
  type TamanhoProdutoEmpacotadora,
} from "@/lib/producao/paletizacao";

export type MaquinaEmpacotadora = (typeof MAQUINAS)["empacotadora-2" | "empacotadora-3"];

interface EmpacotadoraVersoSecoesProps {
  usuario: Usuario;
  turno: Turno;
  data: string;
  folhaDiaKey: string;
  maquina: MaquinaEmpacotadora;
}

function textoOuNulo(valor: string): string | null {
  return valor.trim() === "" ? null : valor;
}

function inteiroOuNulo(valor: string): number | null {
  if (valor.trim() === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : Number.NaN;
}

function decimalOuNulo(valor: string): number | null {
  if (valor.trim() === "") return null;
  const numero = Number(valor.replace(",", "."));
  return Number.isFinite(numero) ? numero : Number.NaN;
}

function tamanhoConhecido(valor: string | null): valor is TamanhoProdutoEmpacotadora {
  return PALETIZACAO_EMPACOTADORA.some((item) => item.tamanho === valor);
}

function comTotalCalculado(linha: ConsolidacaoPersistida): ConsolidacaoPersistida {
  if (!tamanhoConhecido(linha.tamanho)) {
    return { ...linha, pacotesPorPalete: null, totalPacotes: null };
  }
  const capacidadeAtual = formacaoPorTamanho(linha.tamanho).pacotesPorPalete;
  const pacotesPorPalete = linha.pacotesPorPalete ?? capacidadeAtual;
  if (linha.quantidadePaletes === null || linha.quebraPacotes === null) {
    return { ...linha, pacotesPorPalete, totalPacotes: null };
  }
  try {
    if (pacotesPorPalete === capacidadeAtual) {
      const calculo = calcularPacotesEmpacotadora(
        linha.tamanho,
        linha.quantidadePaletes,
        linha.quebraPacotes,
      );
      return { ...linha, pacotesPorPalete, totalPacotes: calculo.totalPacotes };
    }
    if (
      !Number.isSafeInteger(linha.quantidadePaletes) ||
      linha.quantidadePaletes < 0 ||
      !Number.isSafeInteger(linha.quebraPacotes) ||
      linha.quebraPacotes < 0 ||
      linha.quebraPacotes >= pacotesPorPalete
    ) {
      return { ...linha, pacotesPorPalete, totalPacotes: null };
    }
    const totalPacotes = linha.quantidadePaletes * pacotesPorPalete + linha.quebraPacotes;
    return {
      ...linha,
      pacotesPorPalete,
      totalPacotes: Number.isSafeInteger(totalPacotes) ? totalPacotes : null,
    };
  } catch {
    return { ...linha, pacotesPorPalete, totalPacotes: null };
  }
}

function novaBobina(props: EmpacotadoraVersoSecoesProps, ordem: number): BobinaFilmeEmpacotadora {
  const contexto =
    props.maquina.id === "empacotadora-2"
      ? ({ maquina: "Empacotadora 2", linha: "Linha 2", codigoEquipamento: "LE-02" } as const)
      : ({ maquina: "Empacotadora 3", linha: "Linha 3", codigoEquipamento: "LE-03" } as const);
  return {
    ...contexto,
    id: globalThis.crypto.randomUUID(),
    folhaDiaKey: props.folhaDiaKey,
    dataOperacao: props.data,
    turno: props.turno,
    ordem,
    operadorUserId: props.usuario.userId ?? null,
    operadorLogin: props.usuario.usuario,
    operadorNome: props.usuario.nome,
    produto: null,
    especificacaoFilme: null,
    fabricante: null,
    numeroLote: null,
    pesoLiquidoInicialKg: null,
    pesoBrutoFinalKg: null,
    horaInicio: null,
    horaTermino: null,
  };
}

function novaConsolidacao(
  props: EmpacotadoraVersoSecoesProps,
  ordem: number,
): ConsolidacaoPersistida {
  const contexto =
    props.maquina.id === "empacotadora-2"
      ? ({ maquina: "Empacotadora 2", linha: "Linha 2", codigoEquipamento: "LE-02" } as const)
      : ({ maquina: "Empacotadora 3", linha: "Linha 3", codigoEquipamento: "LE-03" } as const);
  return {
    ...contexto,
    id: globalThis.crypto.randomUUID(),
    folhaDiaKey: props.folhaDiaKey,
    dataOperacao: props.data,
    turno: props.turno,
    ordem,
    operadorUserId: props.usuario.userId ?? null,
    operadorLogin: props.usuario.usuario,
    operadorNome: props.usuario.nome,
    sabor: null,
    tamanho: null,
    horaInicio: null,
    horaFinal: null,
    quantidadePaletes: null,
    quebraPacotes: null,
    totalPacotes: null,
    pacotesPorPalete: null,
  };
}

function proximaOrdem(linhas: Array<{ ordem: number }>): number {
  return Math.max(0, ...linhas.map((linha) => linha.ordem)) + 1;
}

function bobinaTemDados(linha: BobinaFilmeEmpacotadora): boolean {
  return Boolean(
    linha.produto ||
    linha.especificacaoFilme ||
    linha.fabricante ||
    linha.numeroLote ||
    linha.pesoLiquidoInicialKg !== null ||
    linha.pesoBrutoFinalKg !== null ||
    linha.horaInicio ||
    linha.horaTermino,
  );
}

function consolidacaoTemDados(linha: ConsolidacaoPersistida): boolean {
  return Boolean(
    linha.sabor ||
    linha.tamanho ||
    linha.horaInicio ||
    linha.horaFinal ||
    linha.quantidadePaletes !== null ||
    linha.quebraPacotes !== null,
  );
}

export function EmpacotadoraVersoSecoes(props: EmpacotadoraVersoSecoesProps) {
  const { usuario, maquina, folhaDiaKey } = props;
  const [bobinas, setBobinas] = useState<BobinaFilmeEmpacotadora[]>([]);
  const [consolidacoes, setConsolidacoes] = useState<ConsolidacaoPersistida[]>([]);
  const [salvos, setSalvos] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErroCarga(null);
    buscarVersoEmpacotadora(folhaDiaKey, maquina.nome)
      .then((resultado) => {
        if (!ativo) return;
        setBobinas(resultado.bobinas);
        setConsolidacoes(resultado.consolidacoes);
        setSalvos(
          Object.fromEntries(
            [...resultado.bobinas, ...resultado.consolidacoes].map((linha) => [
              linha.id,
              JSON.stringify(linha),
            ]),
          ),
        );
      })
      .catch((erro: unknown) => {
        if (!ativo) return;
        setErroCarga(erro instanceof Error ? erro.message : "Não foi possível carregar o verso.");
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [folhaDiaKey, maquina.nome, tentativa]);

  function patchBobina(
    id: string,
    patch: Partial<
      Pick<
        BobinaFilmeEmpacotadora,
        | "produto"
        | "especificacaoFilme"
        | "fabricante"
        | "numeroLote"
        | "pesoLiquidoInicialKg"
        | "pesoBrutoFinalKg"
        | "horaInicio"
        | "horaTermino"
      >
    >,
  ) {
    setBobinas((anteriores) =>
      anteriores.map((linha) => (linha.id === id ? { ...linha, ...patch } : linha)),
    );
  }

  function patchConsolidacao(
    id: string,
    patch: Partial<
      Pick<
        ConsolidacaoPersistida,
        "sabor" | "tamanho" | "horaInicio" | "horaFinal" | "quantidadePaletes" | "quebraPacotes"
      >
    >,
  ) {
    setConsolidacoes((anteriores) =>
      anteriores.map((linha) =>
        linha.id === id
          ? comTotalCalculado({
              ...linha,
              ...patch,
              pacotesPorPalete:
                "tamanho" in patch && patch.tamanho !== linha.tamanho
                  ? null
                  : linha.pacotesPorPalete,
            })
          : linha,
      ),
    );
  }

  async function salvarBobina(linha: BobinaFilmeEmpacotadora) {
    if (!usuario.userId) {
      toast.error("Entre novamente antes de salvar.");
      return;
    }
    if (!bobinaTemDados(linha)) {
      toast.error("Preencha ao menos um campo antes de salvar a bobina.");
      return;
    }
    const erros = linha.horaTermino
      ? validarBobinaParaFechamento(linha)
      : validarBobinaFilme(linha);
    if (erros.length) {
      toast.error(erros[0].mensagem);
      return;
    }
    setSalvandoId(linha.id);
    try {
      const salva = await salvarBobinaEmpacotadora(linha, usuario.userId);
      setBobinas((anteriores) =>
        anteriores.map((item) => {
          if (item.id !== linha.id) return item;
          return JSON.stringify(item) === JSON.stringify(linha)
            ? salva
            : { ...item, createdAt: salva.createdAt, updatedAt: salva.updatedAt };
        }),
      );
      setSalvos((anteriores) => ({ ...anteriores, [linha.id]: JSON.stringify(salva) }));
      toast.success(`Bobina ${linha.ordem} salva.`);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar a bobina.");
    } finally {
      setSalvandoId(null);
    }
  }

  async function salvarConsolidacao(linha: ConsolidacaoPersistida) {
    if (!usuario.userId) {
      toast.error("Entre novamente antes de salvar.");
      return;
    }
    if (!consolidacaoTemDados(linha)) {
      toast.error("Preencha ao menos um campo antes de salvar o produto.");
      return;
    }
    const calculada = comTotalCalculado(linha);
    if (calculada.tamanho && !tamanhoConhecido(calculada.tamanho)) {
      toast.error("Escolha um tamanho da tabela de formação de paletes.");
      return;
    }
    const errosDeIntegridade = validarConsolidacaoProduto(calculada);
    if (errosDeIntegridade.length) {
      toast.error(errosDeIntegridade[0].mensagem);
      return;
    }
    if (
      calculada.quantidadePaletes !== null &&
      calculada.quebraPacotes !== null &&
      calculada.totalPacotes === null
    ) {
      toast.error("Confira os paletes e a quebra; a quebra deve ser menor que um palete completo.");
      return;
    }
    if (calculada.horaFinal) {
      const errosDeFechamento = validarConsolidacaoParaFechamento(calculada);
      if (errosDeFechamento.length) {
        toast.error(errosDeFechamento[0].mensagem);
        return;
      }
    }
    setSalvandoId(linha.id);
    try {
      const salva = await salvarConsolidacaoEmpacotadora(calculada, usuario.userId);
      setConsolidacoes((anteriores) =>
        anteriores.map((item) => {
          if (item.id !== linha.id) return item;
          return JSON.stringify(item) === JSON.stringify(linha)
            ? salva
            : { ...item, createdAt: salva.createdAt, updatedAt: salva.updatedAt };
        }),
      );
      setSalvos((anteriores) => ({ ...anteriores, [linha.id]: JSON.stringify(salva) }));
      toast.success(`Fechamento ${linha.ordem} salvo.`);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar o fechamento.");
    } finally {
      setSalvandoId(null);
    }
  }

  if (carregando) return <TelaCarregando />;
  if (erroCarga) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
        <p className="font-semibold text-destructive">Não foi possível abrir o verso.</p>
        <p className="mt-1 break-words text-sm text-muted-foreground">{erroCarga}</p>
        <Button className="mt-4 h-12" onClick={() => setTentativa((valor) => valor + 1)}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <Tabs defaultValue="bobinas">
      <TabsList className="mb-4 grid w-full grid-cols-2">
        <TabsTrigger value="bobinas">Bobinas ({bobinas.length})</TabsTrigger>
        <TabsTrigger value="produtos">Por produto ({consolidacoes.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="bobinas" className="space-y-4">
        <Cabecalho
          icone={<Film className="h-5 w-5" />}
          titulo="Bobinas de filme"
          texto="Uma linha por bobina. Você pode salvar o início agora e completar o peso e horário final quando a bobina terminar."
        />
        {bobinas.map((linha) => {
          const pendente = salvos[linha.id] !== JSON.stringify(linha);
          return (
            <section key={linha.id} className="rounded-2xl border border-border bg-card p-4">
              <StatusLinha ordem={linha.ordem} pendente={pendente} />
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <CampoTexto
                  label="Produto"
                  valor={linha.produto}
                  aoMudar={(valor) => patchBobina(linha.id, { produto: valor })}
                  placeholder="Ex.: 600 ml natural"
                />
                <CampoTexto
                  label="Especificação do filme"
                  valor={linha.especificacaoFilme}
                  aoMudar={(valor) => patchBobina(linha.id, { especificacaoFilme: valor })}
                />
                <CampoTexto
                  label="Fabricante"
                  valor={linha.fabricante}
                  aoMudar={(valor) => patchBobina(linha.id, { fabricante: valor })}
                />
                <CampoTexto
                  label="Número do lote"
                  valor={linha.numeroLote}
                  aoMudar={(valor) => patchBobina(linha.id, { numeroLote: valor })}
                />
                <CampoNumero
                  label="Peso líquido inicial (kg)"
                  valor={linha.pesoLiquidoInicialKg}
                  decimal
                  aoMudar={(valor) => patchBobina(linha.id, { pesoLiquidoInicialKg: valor })}
                />
                <CampoNumero
                  label="Peso bruto final (kg)"
                  valor={linha.pesoBrutoFinalKg}
                  decimal
                  aoMudar={(valor) => patchBobina(linha.id, { pesoBrutoFinalKg: valor })}
                />
                <CampoHora
                  label="Hora de início"
                  valor={linha.horaInicio}
                  aoMudar={(valor) => patchBobina(linha.id, { horaInicio: valor })}
                />
                <CampoHora
                  label="Hora de término"
                  valor={linha.horaTermino}
                  aoMudar={(valor) => patchBobina(linha.id, { horaTermino: valor })}
                />
              </div>
              <Button
                className="mt-4 h-12 w-full text-base font-bold"
                disabled={!pendente || salvandoId !== null}
                onClick={() => void salvarBobina(linha)}
              >
                <CheckCircle2 className="mr-2 h-5 w-5" />
                {salvandoId === linha.id ? "Salvando..." : "Salvar bobina"}
              </Button>
              {!linha.createdAt && (
                <Button
                  variant="ghost"
                  className="mt-2 h-11 w-full text-muted-foreground"
                  disabled={salvandoId !== null}
                  onClick={() =>
                    setBobinas((anteriores) => anteriores.filter((item) => item.id !== linha.id))
                  }
                >
                  Descartar linha não salva
                </Button>
              )}
            </section>
          );
        })}
        <Button
          variant="outline"
          className="h-12 w-full text-base"
          onClick={() =>
            setBobinas((anteriores) => [...anteriores, novaBobina(props, proximaOrdem(anteriores))])
          }
        >
          <Plus className="mr-2 h-5 w-5" />
          Adicionar bobina
        </Button>
      </TabsContent>

      <TabsContent value="produtos" className="space-y-4">
        <Cabecalho
          icone={<Layers3 className="h-5 w-5" />}
          titulo="Fechamento por produto"
          texto="Informe os paletes completos e os pacotes do palete incompleto (quebra). O total de pacotes é calculado automaticamente."
        />
        {consolidacoes.map((linha) => {
          const pendente = salvos[linha.id] !== JSON.stringify(linha);
          return (
            <section key={linha.id} className="rounded-2xl border border-border bg-card p-4">
              <StatusLinha ordem={linha.ordem} pendente={pendente} />
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <CampoTexto
                  label="Sabor"
                  valor={linha.sabor}
                  aoMudar={(valor) => patchConsolidacao(linha.id, { sabor: valor })}
                  placeholder="Ex.: Natural"
                />
                <div>
                  <Label>Tamanho / embalagem</Label>
                  <select
                    value={linha.tamanho ?? ""}
                    onChange={(evento) =>
                      patchConsolidacao(linha.id, { tamanho: textoOuNulo(evento.target.value) })
                    }
                    className="mt-1 h-12 w-full rounded-md border border-input bg-background px-3 text-base text-foreground"
                  >
                    <option value="">Selecione</option>
                    {PALETIZACAO_EMPACOTADORA.map((produto) => (
                      <option key={produto.tamanho} value={produto.tamanho}>
                        {produto.tamanho} · {produto.pacotesPorPalete} pacotes/palete
                      </option>
                    ))}
                  </select>
                </div>
                <CampoHora
                  label="Hora de início"
                  valor={linha.horaInicio}
                  aoMudar={(valor) => patchConsolidacao(linha.id, { horaInicio: valor })}
                />
                <CampoHora
                  label="Hora final"
                  valor={linha.horaFinal}
                  aoMudar={(valor) => patchConsolidacao(linha.id, { horaFinal: valor })}
                />
                <CampoNumero
                  label="Paletes completos"
                  valor={linha.quantidadePaletes}
                  aoMudar={(valor) => patchConsolidacao(linha.id, { quantidadePaletes: valor })}
                />
                <CampoNumero
                  label="Quebra (pacotes do palete incompleto)"
                  valor={linha.quebraPacotes}
                  aoMudar={(valor) => patchConsolidacao(linha.id, { quebraPacotes: valor })}
                />
              </div>
              <div className="mt-4 rounded-xl border border-primary/30 bg-primary-soft/50 p-4">
                <p className="text-sm text-muted-foreground">Total de pacotes</p>
                <p className="text-2xl font-bold text-foreground">
                  {linha.totalPacotes === null
                    ? "Aguardando paletes e quebra"
                    : linha.totalPacotes.toLocaleString("pt-BR")}
                </p>
                {linha.pacotesPorPalete !== null && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {linha.quantidadePaletes ?? "?"} paletes × {linha.pacotesPorPalete} pacotes +{" "}
                    {linha.quebraPacotes ?? "?"} de quebra
                  </p>
                )}
              </div>
              <Button
                className="mt-4 h-12 w-full text-base font-bold"
                disabled={!pendente || salvandoId !== null}
                onClick={() => void salvarConsolidacao(linha)}
              >
                <CheckCircle2 className="mr-2 h-5 w-5" />
                {salvandoId === linha.id ? "Salvando..." : "Salvar fechamento"}
              </Button>
              {!linha.createdAt && (
                <Button
                  variant="ghost"
                  className="mt-2 h-11 w-full text-muted-foreground"
                  disabled={salvandoId !== null}
                  onClick={() =>
                    setConsolidacoes((anteriores) =>
                      anteriores.filter((item) => item.id !== linha.id),
                    )
                  }
                >
                  Descartar linha não salva
                </Button>
              )}
            </section>
          );
        })}
        <Button
          variant="outline"
          className="h-12 w-full text-base"
          onClick={() =>
            setConsolidacoes((anteriores) => [
              ...anteriores,
              novaConsolidacao(props, proximaOrdem(anteriores)),
            ])
          }
        >
          <Plus className="mr-2 h-5 w-5" />
          Adicionar produto
        </Button>
      </TabsContent>
    </Tabs>
  );
}

function Cabecalho({
  icone,
  titulo,
  texto,
}: {
  icone: React.ReactNode;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-primary-soft/40 p-4">
      <span className="mt-0.5 text-primary">{icone}</span>
      <div>
        <p className="text-sm font-bold text-foreground">{titulo}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}

function StatusLinha({ ordem, pendente }: { ordem: number; pendente: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-bold text-foreground">Linha {ordem}</p>
      <span
        className={`rounded-full px-3 py-1 text-xs font-semibold ${pendente ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}
      >
        {pendente ? "Alterações não salvas" : "Salvo"}
      </span>
    </div>
  );
}

function CampoTexto({
  label,
  valor,
  aoMudar,
  placeholder,
}: {
  label: string;
  valor: string | null;
  aoMudar: (valor: string | null) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        value={valor ?? ""}
        onChange={(evento) => aoMudar(textoOuNulo(evento.target.value))}
        placeholder={placeholder}
        className="mt-1 h-12 text-base"
      />
    </div>
  );
}

function CampoNumero({
  label,
  valor,
  aoMudar,
  decimal = false,
}: {
  label: string;
  valor: number | null;
  aoMudar: (valor: number | null) => void;
  decimal?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        inputMode={decimal ? "decimal" : "numeric"}
        min="0"
        step={decimal ? "0.001" : "1"}
        value={Number.isNaN(valor) ? "" : (valor ?? "")}
        onChange={(evento) =>
          aoMudar(decimal ? decimalOuNulo(evento.target.value) : inteiroOuNulo(evento.target.value))
        }
        className="mt-1 h-12 text-base"
      />
    </div>
  );
}

function CampoHora({
  label,
  valor,
  aoMudar,
}: {
  label: string;
  valor: string | null;
  aoMudar: (valor: string | null) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="time"
        value={valor ?? ""}
        onChange={(evento) => aoMudar(textoOuNulo(evento.target.value))}
        className="mt-1 h-12 text-base"
      />
    </div>
  );
}
