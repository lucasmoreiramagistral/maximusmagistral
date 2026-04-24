import type { LimpezaItem, PtpItem, PtpItemCodigo } from "./types";
import type { Turno } from "@/lib/checklist/types";
import {
  escalaPorTurnoEquipe,
  janelasPtpDaEscala,
  type Escala,
} from "@/lib/operacao/escalas";

// ─── Contexto fixo ───────────────────────────────────────────────────
export const VERSO_CONTEXTO_FIXO = {
  linha: "Linha 3" as const,
  area: "Envase" as const,
  maquina: "Enchedora 3" as const,
  equipamento: "Enchedora Zegla 50V" as const,
};

// ─── PTP — janelas fixas do dia ──────────────────────────────────────
export interface PtpJanelaDef {
  codigo: string;
  inicio: string;
  fim: string;
  rotulo: string;
}

export const PTP_JANELAS: PtpJanelaDef[] = [
  { codigo: "J01", inicio: "06:00", fim: "08:00", rotulo: "06:00 às 08:00" },
  { codigo: "J02", inicio: "08:00", fim: "10:00", rotulo: "08:00 às 10:00" },
  { codigo: "J03", inicio: "10:00", fim: "12:00", rotulo: "10:00 às 12:00" },
  { codigo: "J04", inicio: "12:00", fim: "14:20", rotulo: "12:00 às 14:20" },
  { codigo: "J05", inicio: "14:20", fim: "16:00", rotulo: "14:20 às 16:00" },
  { codigo: "J06", inicio: "16:00", fim: "18:00", rotulo: "16:00 às 18:00" },
  { codigo: "J07", inicio: "18:00", fim: "20:00", rotulo: "18:00 às 20:00" },
  { codigo: "J08", inicio: "20:00", fim: "22:40", rotulo: "20:00 às 22:40" },
  { codigo: "J09", inicio: "22:40", fim: "00:00", rotulo: "22:40 às 00:00" },
  { codigo: "J10", inicio: "00:00", fim: "02:00", rotulo: "00:00 às 02:00" },
  { codigo: "J11", inicio: "02:00", fim: "04:00", rotulo: "02:00 às 04:00" },
  { codigo: "J12", inicio: "04:00", fim: "06:00", rotulo: "04:00 às 06:00" },
];

export interface PtpItemDef {
  codigo: PtpItemCodigo;
  nome: string;
}

export const PTP_ITENS: PtpItemDef[] = [
  { codigo: "TAMPA_ALTA", nome: "GARRAFAS C/ TAMPA ALTA" },
  { codigo: "ESTOURANDO", nome: "GARRAFAS ESTOURANDO" },
  { codigo: "FINISH_QUEBRANDO", nome: "FINISH QUEBRANDO NO ENCHIMENTO" },
  { codigo: "NIVEL_BAIXO", nome: "NÍVEL BAIXO" },
  { codigo: "SEM_TAMPA", nome: "SEM TAMPA" },
];

export function criarItensPtpVazios(): PtpItem[] {
  return PTP_ITENS.map((d) => ({
    codigo: d.codigo,
    nome: d.nome,
    quantidade: 0,
    status: "sem_ocorrencia",
  }));
}

// ─── Limpeza — modelo LAZY ──────────────────────────────────────────
// NÃO existe mais lista fixa de turnos pré-criados.
// A limpeza é criada SOB DEMANDA quando o operador da escala ativa
// abre/preenche limpeza. Para a UI/relatórios consumirem turnos com dado,
// derivar dos próprios registros existentes.

// ─── Mapeamento PTP → janelas (via fonte única) ─────────────────────
// Substitui o antigo PTP_JANELAS_POR_TURNO (literal Dia/Noite).
// Usa SEMPRE a fonte única em escalas.ts; janela parcial conta.
//
// Importante: uma janela isolada não define escala — o contexto ativo
// do operador/folha sempre manda. Para inferir janelas a partir de uma
// escala completa, usar `janelasPtpDaEscala()` direto da fonte única.
export function janelasPtpDoTurno(
  turno: Turno | null | undefined,
  equipe?: Turno | string | null,
): string[] {
  // O 2º parâmetro aceita equipe; se vier ausente, o helper aplica fallback
  // de legado por nome de turno (ver escalaPorTurnoEquipe).
  const escala: Escala | null = escalaPorTurnoEquipe(
    turno,
    (equipe as never) ?? null,
  );
  return janelasPtpDaEscala(escala);
}

// ─── Limpeza — 21 itens (texto OFICIAL) ──────────────────────────────
export const LIMPEZA_ITENS_DEF: Omit<LimpezaItem, "status">[] = [
  {
    codigo: 1,
    grupo: "Antessala de envase",
    secao: "Limpeza",
    descricao:
      "A antessala de envase deve estar com piso e paredes limpas e em boas condições.",
  },
  {
    codigo: 2,
    grupo: "Antessala de envase",
    secao: "Abastecimento",
    descricao:
      "O dispenser de sabão deve estar funcional, limpo e abastecido com sabão neutro líquido e inodoro.",
  },
  {
    codigo: 3,
    grupo: "Antessala de envase",
    secao: "Abastecimento",
    descricao:
      "O dispenser de papel deve estar funcional, limpo e abastecido com papel-toalha.",
  },
  {
    codigo: 4,
    grupo: "Antessala de envase",
    secao: "Funcionalidade",
    descricao:
      "A torneira, que possui sensor de proximidade, deve estar limpa e funcional.",
  },
  {
    codigo: 5,
    grupo: "Antessala de envase",
    secao: "Funcionalidade",
    descricao:
      "A lixeira de material inox com pedal deve estar em boas condições de funcionamento e higiene.",
  },
  {
    codigo: 6,
    grupo: "Antessala de envase",
    secao: "Funcionalidade",
    descricao:
      "O sistema de higienização de botas que encontra-se no lado externo da entrada da antessala deve estar abastecido em perfeito funcionamento.",
  },
  {
    codigo: 7,
    grupo: "Sala de envase",
    secao: "Piso",
    descricao:
      "Livre de acúmulo de líquidos e sujidades externas (poeira, lixo, óleo, graxa, papel, insetos ou qualquer outro que não seja a bebida que está no processo).",
  },
  {
    codigo: 8,
    grupo: "Sala de envase",
    secao: "Paredes, portas e vidros",
    descricao:
      "Livres de manchas de bebida, óleo, graxa, descamação, ferrugem, avarias, lodo ou qualquer outro tipo de sujidade.",
  },
  {
    codigo: 9,
    grupo: "Sala de envase",
    secao: "Teto",
    descricao: "Livres de manchas de bebida, poeira, insetos e livre de avarias.",
  },
  {
    codigo: 10,
    grupo: "Sala de envase",
    secao: "Ralos",
    descricao:
      "Livres de excesso de lodo, tampas, garrafas ou qualquer outro tipo de obstrução.",
  },
  {
    codigo: 11,
    grupo: "Sala de envase",
    secao: "Máquinas e tubulações",
    descricao:
      "A enchedora, o sistema de rinsagem e o sistema de arrolhamento devem estar livres de: excesso de tampas e garrafas refugadas, sujidades, lodo, bolores, ferramentas e gambiarras.",
  },
  {
    codigo: 12,
    grupo: "Sala de envase",
    secao: "Máquinas e tubulações",
    descricao:
      "As tubulações de inox e mangueiras de ar devem estar livre de: sujidades, objetos e avarias.",
  },
  {
    codigo: 13,
    grupo: "Sala de envase",
    secao: "Máquinas e tubulações",
    descricao:
      "As cubas de mistura, o desaerador e o tanque de mistura devem estar livres de lodo, óleo, graxa ou qualquer outro tipo de sujidade.",
  },
  {
    codigo: 14,
    grupo: "Sala de envase",
    secao: "Máquinas e tubulações",
    descricao:
      "As esteiras devem estar com o sistema de lubrificação em funcionamento (sabão) e livres de lodo, graxa, óleo, tampas e garrafas refugadas ou qualquer outro tipo de material ou sujidade.",
  },
  {
    codigo: 15,
    grupo: "Sala de envase",
    secao: "Máquinas e tubulações",
    descricao:
      "Os painéis elétricos devem estar fechados e limpos (externa e internamente), sem a presença de avarias ou qualquer ponto que gere risco de acidente.",
  },
  {
    codigo: 16,
    grupo: "Sala de envase",
    secao: "Durante manutenções",
    descricao:
      "As operações de envase devem ser paralisadas durante todo e qualquer tipo de manutenção preventiva e corretiva, não sendo permitida a retomada do processo até que o manutentor finalize os trabalhos no ambiente.",
  },
  {
    codigo: 17,
    grupo: "Sala de envase",
    secao: "Após manutenções",
    descricao:
      "A sala de envase deverá ser higienizada, assim como os equipamentos que foram manutenidos a fim de evitar contaminação.",
  },
  {
    codigo: 18,
    grupo: "Sala de envase",
    secao: "Acesso de terceiros",
    descricao:
      "Se houver necessidade de pessoas estranhas na sala de envase, a operação deverá ser suspensa, sendo feita a higienização completa da sala e dos equipamentos antes da retomada do processo.",
  },
  {
    codigo: 19,
    grupo: "Sala de envase",
    secao: "Ambiente",
    descricao:
      "A sala de envase deve estar internamente livre de ferramentas soltas, produtos de limpeza, pessoas externas, itens pessoais, alimentos ou qualquer outro tipo de material que não seja de material inox, salvo quando estiver em processo de limpeza ou manutenção.",
  },
  {
    codigo: 20,
    grupo: "Sala de envase",
    secao: "Fardamento",
    descricao:
      "O operador deve estar com uniforme de cor clara, máscara, touca, botas de borracha branca, luvas látex branca e protetor auricular, estando todos os EPIs em boas condições.",
  },
  {
    codigo: 21,
    grupo: "Sala de envase",
    secao: "Adereços",
    descricao:
      "O operador, durante o trabalho operacional, não pode utilizar jóias, relógios, cordões, pulseiras ou perfumes.",
  },
];

export function criarItensLimpezaVazios(): LimpezaItem[] {
  return LIMPEZA_ITENS_DEF.map((d) => ({ ...d, status: null }));
}

// ─── Labels ──────────────────────────────────────────────────────────
export const LABEL_PTP_STATUS: Record<string, string> = {
  pendente: "Pendente",
  rascunho: "Rascunho",
  sem_ocorrencia: "Sem ocorrência",
  houve_ocorrencia: "Houve ocorrência",
  nao_rodou: "Não rodou",
};

export const LABEL_LIMPEZA_STATUS: Record<string, string> = {
  pendente: "Pendente",
  rascunho: "Rascunho",
  aguardando_validacao: "Aguardando líder",
  validado: "Validado",
};

export const LABEL_LIMPEZA_ITEM_STATUS: Record<string, string> = {
  realizado: "Realizado",
  nao_realizado: "Não realizado",
  nao_aplicavel: "Não se aplica",
};
