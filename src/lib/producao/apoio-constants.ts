import type {
  ApoioMarcacao,
  AssepsiaTroca,
  CipEtapa,
  CipEtapaCodigo,
} from "./apoio-types";

// ─── Checklist de Apoio (texto OFICIAL do FM08 PSGQ07 rev. 04) ───────
export interface ApoioAtividadeDef {
  codigo: number;
  grupo: "No início do expediente" | "Durante o expediente" | "No fim do expediente";
  descricao: string;
}

export const APOIO_ATIVIDADES: ApoioAtividadeDef[] = [
  {
    codigo: 1,
    grupo: "No início do expediente",
    descricao: "Verificar programação de produção.",
  },
  {
    codigo: 2,
    grupo: "No início do expediente",
    descricao: "Fazer login no coletor Injet.",
  },
  {
    codigo: 3,
    grupo: "No início do expediente",
    descricao: "Atualizar OP do Injet se necessário.",
  },
  {
    codigo: 4,
    grupo: "No início do expediente",
    descricao:
      "Verificar status dos tanques de xarope e registrar NO VERSO DA FOLHA.",
  },
  {
    codigo: 5,
    grupo: "Durante o expediente",
    descricao: "Realizar a Checklist Diário Operacional.",
  },
  {
    codigo: 6,
    grupo: "No fim do expediente",
    descricao:
      "Verificar status dos tanques de xarope e registrar NO VERSO DA FOLHA.",
  },
  {
    codigo: 7,
    grupo: "No fim do expediente",
    descricao: "Fazer logout no coletor Injet.",
  },
  {
    codigo: 8,
    grupo: "No fim do expediente",
    descricao:
      "Realizar Passagem de Turno para o próximo operador repassando as informações importantes sobre a máquina NO VERSO DA FOLHA.",
  },
];

export const APOIO_GRUPOS = [
  "No início do expediente",
  "Durante o expediente",
  "No fim do expediente",
] as const;

// ─── Assepsia ────────────────────────────────────────────────────────
export const ASSEPSIA_TROCAS_MAX = 5;

export const ASSEPSIA_DESCRICAO =
  "Pré-lavagem com água seguida de utilização de aproximadamente 200L de solução soda cáustica por 20min, finalizando com enxágue para remoção do produto.";

// ─── CIP ─────────────────────────────────────────────────────────────
export interface CipEtapaDef {
  codigo: CipEtapaCodigo;
  ordem: number;
  titulo: string;
  descricao: string;
  /** Etapas com horário de início/fim; as demais são só marcação. */
  comHorario: boolean;
}

export const CIP_DESCRICAO =
  "CONTROLE DE PROCESSO DE CIP (troca de sabor p/ produto sem açúcar/água)";

export const CIP_ETAPAS: CipEtapaDef[] = [
  {
    codigo: "PRE_LAVAGEM",
    ordem: 1,
    titulo: "PRÉ-LAVAGEM",
    descricao: "1 - Pré-lavagem p/ remoção do excesso de xarope da tubulação.",
    comHorario: true,
  },
  {
    codigo: "FIXAR_CANECAS",
    ordem: 2,
    titulo: "Fixação das canecas nos tubos de ar",
    descricao: "2 - Fixar canecas",
    comHorario: false,
  },
  {
    codigo: "SODA",
    ordem: 3,
    titulo: "SOLUÇÃO SODA CÁUSTICA",
    descricao:
      "3 - Circulação de solução soda cáustica no sistema por aproximadamente 40min.",
    comHorario: true,
  },
  {
    codigo: "ENXAGUE_SODA",
    ordem: 4,
    titulo: "ENXÁGUE DA SODA CÁUSTICA",
    descricao:
      "4 - Enxágue para remoção de resíduo de soda cáustica. 10 ~15 min",
    comHorario: true,
  },
  {
    codigo: "PERACETICO",
    ordem: 5,
    titulo: "SOLUÇÃO ÁCIDO PERACÉTICO",
    descricao:
      "5 - Circulação de solução ácido peracético no sistema por aproximadamente 40min.",
    comHorario: true,
  },
  {
    codigo: "ENXAGUE_PERACETICO",
    ordem: 6,
    titulo: "ENXÁGUE ÁCIDO PERACÉTICO",
    descricao:
      "6 - Enxágue para remoção de resíduo de ác. peracético. 10 ~15 min",
    comHorario: true,
  },
  {
    codigo: "RETIRAR_CANECAS",
    ordem: 7,
    titulo: "Retirada das canecas dos tubos de ar e enxágue final",
    descricao: "7 - Retirar canecas e enxaguar",
    comHorario: false,
  },
];

// ─── Fábricas de estado vazio ────────────────────────────────────────
export function criarMarcacoesApoioVazias(): ApoioMarcacao[] {
  return APOIO_ATIVIDADES.map((a) => ({
    codigo: a.codigo,
    feito: false,
    marcadoEm: null,
  }));
}

export function criarTrocasAssepsiaVazias(): AssepsiaTroca[] {
  return Array.from({ length: ASSEPSIA_TROCAS_MAX }, (_, i) => ({
    ordem: i + 1,
    sabor: null,
    inicio: null,
    fim: null,
  }));
}

export function criarEtapasCipVazias(): CipEtapa[] {
  return CIP_ETAPAS.map((e) => ({
    codigo: e.codigo,
    feito: false,
    inicio: null,
    fim: null,
  }));
}
