import type { Turno } from "@/lib/checklist/types";

/** Máquinas deste relatório. O código LE identifica a opção impressa na folha. */
export type ContextoEmpacotadora =
  | { maquina: "Empacotadora 2"; linha: "Linha 2"; codigoEquipamento: "LE-02" }
  | { maquina: "Empacotadora 3"; linha: "Linha 3"; codigoEquipamento: "LE-03" };

export const EMPACOTADORAS: readonly ContextoEmpacotadora[] = [
  { maquina: "Empacotadora 2", linha: "Linha 2", codigoEquipamento: "LE-02" },
  { maquina: "Empacotadora 3", linha: "Linha 3", codigoEquipamento: "LE-03" },
];

/**
 * Cada linha do verso pertence à folha de uma máquina/dia operacional.
 * `id` é identidade persistente; `ordem` apenas conserva a ordem no papel.
 * Não gerar `id` a partir de `ordem`: dois tablets offline podem criar linhas
 * ao mesmo tempo. O turno registra quem iniciou a linha, mesmo que ela seja
 * encerrada por outro turno.
 */
export type EmpacotadoraVersoBase = ContextoEmpacotadora & {
  id: string;
  folhaDiaKey: string;
  dataOperacao: string; // YYYY-MM-DD, dia operacional 06:00 até 06:00
  turno: Turno;
  ordem: number;
  operadorUserId?: string | null;
  operadorLogin?: string | null;
  operadorNome?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

/** Uma linha por bobina de filme utilizada. A bobina em uso fica sem término. */
export type BobinaFilmeEmpacotadora = EmpacotadoraVersoBase & {
  produto: string | null;
  especificacaoFilme: string | null;
  fabricante: string | null;
  numeroLote: string | null;
  pesoLiquidoInicialKg: number | null;
  /** O cabeçalho do papel diz peso *bruto* final, conforme POP 002. */
  pesoBrutoFinalKg: number | null;
  horaInicio: string | null; // HH:mm, relógio local
  horaTermino: string | null; // HH:mm, relógio local
  dataTerminoOperacao?: string | null; // Dia operacional em que a bobina terminou
};

/**
 * Uma linha por produção/produto/turno, mesmo se sabor e tamanho se repetirem.
 * No impresso, `pct` significa pacotes; `quebra` não é porcentagem.
 * O total é um lançamento próprio: pacotes por palete variam com o produto.
 */
export type ConsolidacaoProdutoEmpacotadora = EmpacotadoraVersoBase & {
  sabor: string | null;
  tamanho: string | null;
  horaInicio: string | null;
  horaFinal: string | null;
  quantidadePaletes: number | null;
  quebraPacotes: number | null;
  totalPacotes: number | null;
};

export type CampoBobina =
  | "id"
  | "folhaDiaKey"
  | "dataOperacao"
  | "maquina"
  | "linha"
  | "codigoEquipamento"
  | "ordem"
  | "produto"
  | "especificacaoFilme"
  | "fabricante"
  | "numeroLote"
  | "pesoLiquidoInicialKg"
  | "pesoBrutoFinalKg"
  | "horaInicio"
  | "horaTermino"
  | "dataTerminoOperacao";

export type CampoConsolidacao =
  | "id"
  | "folhaDiaKey"
  | "dataOperacao"
  | "maquina"
  | "linha"
  | "codigoEquipamento"
  | "ordem"
  | "sabor"
  | "tamanho"
  | "horaInicio"
  | "horaFinal"
  | "quantidadePaletes"
  | "quebraPacotes"
  | "totalPacotes";

export interface ErroVersoEmpacotadora<Campo extends string> {
  campo: Campo;
  codigo: "obrigatorio" | "formato" | "fora_da_faixa" | "intervalo_invalido" | "total_divergente";
  mensagem: string;
}

const DATA_ISO = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const HORA_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

function emBranco(valor: string | null | undefined): boolean {
  return valor == null || valor.trim().length === 0;
}

function validarBase<Campo extends string>(
  linha: EmpacotadoraVersoBase,
): ErroVersoEmpacotadora<Campo>[] {
  const erros: ErroVersoEmpacotadora<Campo>[] = [];
  const erro = (campo: string, codigo: ErroVersoEmpacotadora<Campo>["codigo"], mensagem: string) =>
    erros.push({ campo: campo as Campo, codigo, mensagem });
  if (emBranco(linha.id)) erro("id", "obrigatorio", "Identificador da linha ausente.");
  if (emBranco(linha.folhaDiaKey)) {
    erro("folhaDiaKey", "obrigatorio", "Folha do dia operacional ausente.");
  }
  if (!DATA_ISO.test(linha.dataOperacao) || !dataCalendarioValida(linha.dataOperacao)) {
    erro("dataOperacao", "formato", "Informe uma data operacional válida em YYYY-MM-DD.");
  }
  if (!Number.isSafeInteger(linha.ordem) || linha.ordem < 1) {
    erro("ordem", "fora_da_faixa", "A ordem deve ser um inteiro maior que zero.");
  }
  const contextoValido = EMPACOTADORAS.some(
    (contexto) =>
      contexto.maquina === linha.maquina &&
      contexto.linha === linha.linha &&
      contexto.codigoEquipamento === linha.codigoEquipamento,
  );
  if (!contextoValido) {
    erro("maquina", "formato", "Máquina, linha e código LE não correspondem.");
  }
  return erros;
}

function dataCalendarioValida(data: string): boolean {
  const [ano, mes, dia] = data.split("-").map(Number);
  const normalizada = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    normalizada.getUTCFullYear() === ano &&
    normalizada.getUTCMonth() === mes - 1 &&
    normalizada.getUTCDate() === dia
  );
}

function inteiroNaoNegativo(valor: number | null): boolean {
  return valor === null || (Number.isSafeInteger(valor) && valor >= 0);
}

function numeroNaoNegativo(valor: number | null): boolean {
  return valor === null || (Number.isFinite(valor) && valor >= 0);
}

/**
 * Minutos desde 06:00 do dia operacional. `06:00` no campo final encerra o
 * dia (1440); no inicial abre o dia (0). Isso evita comparar 23:00 > 01:00.
 */
export function minutoNoDiaOperacional(
  hora: string,
  posicao: "inicio" | "fim" = "inicio",
): number | null {
  if (!HORA_24H.test(hora)) return null;
  const [h, m] = hora.split(":").map(Number);
  const minutoRelogio = h * 60 + m;
  if (minutoRelogio === 360 && posicao === "fim") return 1440;
  return minutoRelogio >= 360 ? minutoRelogio - 360 : minutoRelogio + 1080;
}

/** Duração de um intervalo da mesma folha; `null` quando incompleto/inválido. */
export function duracaoNoDiaOperacional(inicio: string | null, fim: string | null): number | null {
  if (inicio === null || fim === null) return null;
  const inicioMin = minutoNoDiaOperacional(inicio, "inicio");
  const fimMin = minutoNoDiaOperacional(fim, "fim");
  return inicioMin !== null && fimMin !== null && fimMin > inicioMin ? fimMin - inicioMin : null;
}

function validarIntervalo<Campo extends string>(
  inicio: string | null,
  fim: string | null,
  campoInicio: Campo,
  campoFim: Campo,
): ErroVersoEmpacotadora<Campo>[] {
  const erros: ErroVersoEmpacotadora<Campo>[] = [];
  if (inicio !== null && minutoNoDiaOperacional(inicio, "inicio") === null) {
    erros.push({
      campo: campoInicio,
      codigo: "formato",
      mensagem: "Use horário HH:mm entre 00:00 e 23:59.",
    });
  }
  if (fim !== null && minutoNoDiaOperacional(fim, "fim") === null) {
    erros.push({
      campo: campoFim,
      codigo: "formato",
      mensagem: "Use horário HH:mm entre 00:00 e 23:59.",
    });
  }
  if (
    inicio !== null &&
    fim !== null &&
    minutoNoDiaOperacional(inicio, "inicio") !== null &&
    minutoNoDiaOperacional(fim, "fim") !== null &&
    duracaoNoDiaOperacional(inicio, fim) === null
  ) {
    erros.push({
      campo: campoFim,
      codigo: "intervalo_invalido",
      mensagem: "O término deve ser posterior ao início na mesma folha operacional.",
    });
  }
  return erros;
}

/** Checagens de integridade para rascunho ou bobina em uso. `null` permanece vazio. */
export function validarBobinaFilme(
  bobina: BobinaFilmeEmpacotadora,
): ErroVersoEmpacotadora<CampoBobina>[] {
  const erros = validarBase<CampoBobina>(bobina);
  if (!numeroNaoNegativo(bobina.pesoLiquidoInicialKg)) {
    erros.push({
      campo: "pesoLiquidoInicialKg",
      codigo: "fora_da_faixa",
      mensagem: "O peso inicial deve ser zero ou positivo, em kg.",
    });
  }
  if (!numeroNaoNegativo(bobina.pesoBrutoFinalKg)) {
    erros.push({
      campo: "pesoBrutoFinalKg",
      codigo: "fora_da_faixa",
      mensagem: "O peso final deve ser zero ou positivo, em kg.",
    });
  }
  const dataTermino = bobina.dataTerminoOperacao ?? bobina.dataOperacao;
  if (bobina.dataTerminoOperacao &&
      (!DATA_ISO.test(dataTermino) || !dataCalendarioValida(dataTermino))) {
    erros.push({ campo: "dataTerminoOperacao", codigo: "formato", mensagem: "Data de término inválida." });
  }
  const inicioMin = bobina.horaInicio === null ? null : minutoNoDiaOperacional(bobina.horaInicio, "inicio");
  const fimMin = bobina.horaTermino === null ? null : minutoNoDiaOperacional(bobina.horaTermino, "fim");
  if (bobina.horaInicio !== null && inicioMin === null) {
    erros.push({ campo: "horaInicio", codigo: "formato", mensagem: "Use horário HH:mm entre 00:00 e 23:59." });
  }
  if (bobina.horaTermino !== null && fimMin === null) {
    erros.push({ campo: "horaTermino", codigo: "formato", mensagem: "Use horário HH:mm entre 00:00 e 23:59." });
  }
  if (inicioMin !== null && fimMin !== null && DATA_ISO.test(dataTermino)) {
    const dias = (Date.parse(`${dataTermino}T00:00:00Z`) - Date.parse(`${bobina.dataOperacao}T00:00:00Z`)) / 86400000;
    if (!Number.isInteger(dias) || dias * 1440 + fimMin - inicioMin <= 0) {
      erros.push({ campo: "horaTermino", codigo: "intervalo_invalido", mensagem: "O término deve ser posterior ao início da bobina." });
    }
  }
  if (bobina.horaTermino !== null && bobina.horaInicio === null) {
    erros.push({
      campo: "horaInicio",
      codigo: "obrigatorio",
      mensagem: "Informe o início antes do término da bobina.",
    });
  }
  return erros;
}

/** Requisitos de fechamento; peso bruto final continua opcional como no uso observado do papel. */
export function validarBobinaParaFechamento(
  bobina: BobinaFilmeEmpacotadora,
): ErroVersoEmpacotadora<CampoBobina>[] {
  const erros = validarBobinaFilme(bobina);
  const obrigatorios: Array<[CampoBobina, string | number | null]> = [
    ["produto", bobina.produto],
    ["especificacaoFilme", bobina.especificacaoFilme],
    ["fabricante", bobina.fabricante],
    ["numeroLote", bobina.numeroLote],
    ["pesoLiquidoInicialKg", bobina.pesoLiquidoInicialKg],
    ["horaInicio", bobina.horaInicio],
    ["horaTermino", bobina.horaTermino],
    ["dataTerminoOperacao", bobina.dataTerminoOperacao ?? null],
  ];
  for (const [campo, valor] of obrigatorios) {
    if (valor === null || (typeof valor === "string" && emBranco(valor))) {
      erros.push({
        campo,
        codigo: "obrigatorio",
        mensagem: "Campo necessário para fechar a bobina.",
      });
    }
  }
  return erros;
}

/** Checagens de integridade sem inferir uma capacidade fixa de palete. */
export function validarConsolidacaoProduto(
  consolidacao: ConsolidacaoProdutoEmpacotadora,
): ErroVersoEmpacotadora<CampoConsolidacao>[] {
  const erros = validarBase<CampoConsolidacao>(consolidacao);
  for (const campo of ["quantidadePaletes", "quebraPacotes", "totalPacotes"] as const) {
    if (!inteiroNaoNegativo(consolidacao[campo])) {
      erros.push({
        campo,
        codigo: "fora_da_faixa",
        mensagem: "Informe um número inteiro de unidades, zero ou maior.",
      });
    }
  }
  erros.push(
    ...validarIntervalo(consolidacao.horaInicio, consolidacao.horaFinal, "horaInicio", "horaFinal"),
  );
  if (consolidacao.horaFinal !== null && consolidacao.horaInicio === null) {
    erros.push({
      campo: "horaInicio",
      codigo: "obrigatorio",
      mensagem: "Informe o horário inicial antes do final.",
    });
  }
  return erros;
}

export function validarConsolidacaoParaFechamento(
  consolidacao: ConsolidacaoProdutoEmpacotadora,
): ErroVersoEmpacotadora<CampoConsolidacao>[] {
  const erros = validarConsolidacaoProduto(consolidacao);
  const obrigatorios: Array<[CampoConsolidacao, string | number | null]> = [
    ["sabor", consolidacao.sabor],
    ["tamanho", consolidacao.tamanho],
    ["horaInicio", consolidacao.horaInicio],
    ["horaFinal", consolidacao.horaFinal],
    ["quantidadePaletes", consolidacao.quantidadePaletes],
    ["quebraPacotes", consolidacao.quebraPacotes],
    ["totalPacotes", consolidacao.totalPacotes],
  ];
  for (const [campo, valor] of obrigatorios) {
    if (valor === null || (typeof valor === "string" && emBranco(valor))) {
      erros.push({
        campo,
        codigo: "obrigatorio",
        mensagem: "Campo necessário para fechar a consolidação.",
      });
    }
  }
  return erros;
}

/** Conferência opcional quando a capacidade deste produto for conhecida. */
export function conferirTotalPacotes(
  consolidacao: ConsolidacaoProdutoEmpacotadora,
  pacotesPorPalete: number,
): ErroVersoEmpacotadora<"totalPacotes">[] {
  if (!Number.isSafeInteger(pacotesPorPalete) || pacotesPorPalete < 1) {
    throw new RangeError("Pacotes por palete deve ser inteiro positivo.");
  }
  const { quantidadePaletes, quebraPacotes, totalPacotes } = consolidacao;
  if (quantidadePaletes === null || quebraPacotes === null || totalPacotes === null) return [];
  if (![quantidadePaletes, quebraPacotes, totalPacotes].every((n) => inteiroNaoNegativo(n)))
    return [];
  const esperado = quantidadePaletes * pacotesPorPalete + quebraPacotes;
  return esperado === totalPacotes
    ? []
    : [
        {
          campo: "totalPacotes",
          codigo: "total_divergente",
          mensagem: `Total esperado: ${esperado} pacotes.`,
        },
      ];
}
