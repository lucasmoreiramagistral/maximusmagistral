// Strings exatas dos momentos do checklist — NUNCA usar enum/classe com .label
export const MOMENTOS_CHECKLIST = [
  "Início / retomada de processo",
  "Setup / longas paradas / PCM",
  "Pós-setup",
] as const;

export type MomentoChecklist = (typeof MOMENTOS_CHECKLIST)[number];

export type Resposta = "Conforme" | "Não conforme" | "Não aplicável";

export type TipoItem = "simples" | "numerico" | "texto";

export interface ItemChecklistDef {
  numero: number;
  descricao: string;
  parametro?: string;
  referencia?: string;
  tipo: TipoItem;
  unidade?: string;
  permiteNA: boolean;
  momento: MomentoChecklist;
}

export interface RespostaItem {
  itemNumero: number;
  descricao: string;
  resposta: Resposta | null;
  observacao: string;
  valorNumerico: string; // armazenamos como string para simplicidade do input
  valorTexto: string;
  horarioVerificacao: string; // ISO string
  momentoChecklist: MomentoChecklist;
  anomaliaId?: string;
}

export type Turno =
  | "12x36 Dia"
  | "12x36 Noite"
  | "Comercial"
  | "1º Turno"
  | "2º Turno"
  | "3º Turno";

export type Equipe =
  | "Karolainny"
  | "Valderlan"
  | "Nilson"
  | "Bruno"
  | "Comercial"
  | "1º Turno"
  | "2º Turno"
  | "3º Turno";

export interface ContextoChecklist {
  data: string; // YYYY-MM-DD
  turno: Turno;
  equipe: Equipe;
  linha: "Linha 3";
  maquina: "Enchedora 3";
  area?: "Envase";
  equipamento?: "Enchedora Zegla 50V";
  operadorResponsavel?: string;
}

/** Assinatura digital capturada no fechamento do dia (Pós-setup). */
export interface AssinaturaDigital {
  /** PNG em data URL (base64). */
  dataUrl: string;
  /** Nome de quem assinou (para registro/Excel). */
  nome: string;
  /** ISO timestamp do momento em que assinou. */
  assinadoEm: string;
}

export interface Checklist {
  id: string;
  contexto: ContextoChecklist;
  momento: MomentoChecklist;
  respostas: RespostaItem[];
  status: "rascunho" | "concluido";
  criadoEm: string;
  concluidoEm?: string;
  operador: string;
  /** Login da conta usada para entrar (operador_login no banco). */
  operadorLogin?: string;
  /** Nome real da pessoa que executou (operador_responsavel no banco). */
  operadorResponsavel?: string;
  /** Chave da folha do dia (data + turno + equipe + linha + máquina). */
  folhaKey?: string;
  /** Número da verificação daquele momento dentro da mesma folha do dia (1, 2 ou 3). */
  verificacaoNumero?: 1 | 2 | 3;
  /** Assinatura digital do operador (capturada no Pós-setup). */
  assinaturaOperador?: AssinaturaDigital;
  /** Assinatura digital do líder (capturada no Pós-setup). */
  assinaturaLider?: AssinaturaDigital;
}

export type StatusMomentoFolha = "pendente" | "em_andamento" | "concluido";

export interface MomentoFolha {
  momento: MomentoChecklist;
  status: StatusMomentoFolha;
  verificacoes: Checklist[];
}

export interface FolhaChecklistDia {
  folhaKey: string;
  contexto: ContextoChecklist;
  momentos: MomentoFolha[];
  totalConformes: number;
  totalNaoConformes: number;
  totalNaoAplicaveis: number;
  totalAnomalias: number;
  ultimaAtualizacao: string;
}

export type CategoriaAnomalia =
  | "Mecânica"
  | "Elétrica"
  | "Automação"
  | "Processo"
  | "Segurança"
  | "Limpeza / 5S"
  | "Operacional"
  | "Predial"
  | "Outro";

export type CriticidadeAnomalia = "Baixa" | "Média" | "Alta" | "Crítica";

export type StatusAnomalia = "Aberta" | "Em andamento" | "Resolvida";

export interface Anomalia {
  id: string;
  criadoEm: string;
  linha: "Linha 3";
  area: "Envase";
  maquina: "Enchedora 3";
  itemOrigem?: { numero: number; descricao: string };
  checklistId?: string;
  categoria: CategoriaAnomalia;
  criticidade: CriticidadeAnomalia;
  descricao: string;
  status: StatusAnomalia;
  equipe: Equipe;
  turno: Turno;
  operador: string;
  operadorLogin?: string;
  operadorResponsavel?: string;
  folhaKey?: string;
  momento?: MomentoChecklist;
  /** Tratativa */
  responsavelManutencao?: string;
  oQueFoiFeito?: string;
  resolvidoEm?: string;
  ultimaAtualizacaoEm?: string;
  ultimaAtualizacaoPorLogin?: string;
  ultimaAtualizacaoPorPerfil?: string;
  origemHorarioResolucao?: "manual_gestao" | "automatico_manutencao";
  /** Origem da anomalia: como/por quem foi aberta. */
  origemAnomalia?:
    | "checklist_operador"
    | "manual_operador"
    | "manual_manutencao"
    | "manual_gestao";
  abertoPorLogin?: string;
  abertoPorPerfil?: string;
  /** Técnico responsável quando aberta pela manutenção. */
  tecnicoResponsavel?: string;
  /** Carimbado automaticamente pelo banco quando entra em "Em andamento". */
  emAndamentoEm?: string;
  /** Equipamento específico afetado pela anomalia (Enchedora 3, Unimix 3, Trocador de Calor 3, Outro). */
  equipamentoAfetado?: string;
}

export interface AnomaliaAtualizacao {
  id: number;
  anomaliaId: string;
  statusAnterior: StatusAnomalia;
  statusNovo: StatusAnomalia;
  responsavelManutencao: string;
  oQueFoiFeito: string;
  atualizadoEm: string;
  resolvidoEmInformado?: string;
  atualizadoPorLogin: string;
  atualizadoPorPerfil: string;
  origemHorario: "manual_gestao" | "automatico_manutencao";
}

export type Perfil = "operador" | "gestao" | "manutencao";

/**
 * Hierarquia organizacional (8 níveis). Usada para autorizar ações
 * administrativas (ex.: cadastro de usuários). Não substitui `perfil`,
 * que define qual módulo principal o usuário usa no login.
 */
export type Hierarquia =
  | "desenvolvedor"
  | "gerente"
  | "coordenador"
  | "supervisor"
  | "lider"
  | "assistente"
  | "operador"
  | "externo";

/** Módulos de acesso. Hoje apenas `perfil` é usado pelo login/useGuard;
 *  `modulosAcesso` é salvo para o futuro (multi-módulo). */
export type ModuloAcesso = "operador" | "gestao" | "manutencao" | "admin";

export const HIERARQUIAS: Hierarquia[] = [
  "desenvolvedor",
  "gerente",
  "coordenador",
  "supervisor",
  "lider",
  "assistente",
  "operador",
  "externo",
];

export const MODULOS_ACESSO: ModuloAcesso[] = ["operador", "gestao", "manutencao", "admin"];

/** Hierarquias autorizadas a cadastrar/editar usuários. */
export const HIERARQUIAS_ADMIN_GESTAO: Hierarquia[] = [
  "desenvolvedor",
  "gerente",
  "coordenador",
];

export interface Usuario {
  perfil: Perfil;
  nome: string;
  usuario: string;
  /** Equipe padrão sugerida no contexto do checklist. */
  equipePadrao?: Equipe | null;
  /** Turno padrão sugerido no contexto do checklist. */
  turnoPadrao?: Turno | null;
  /** uuid do auth.users (quando logado via Supabase). */
  userId?: string;
  /** Matrícula opcional (única quando preenchida). */
  matricula?: string | null;
  /** Nível hierárquico — default 'operador'. */
  hierarquia?: Hierarquia;
  /** Módulos liberados (ainda não consumido por useGuard — débito técnico). */
  modulosAcesso?: ModuloAcesso[];
  /** Se true, ações de escrita devem ser bloqueadas no frontend. */
  somenteLeitura?: boolean;
}
