import { supabase } from "@/integrations/supabase/client";
import {
  anomaliaAtualizacaoFromRow,
  anomaliaFromRow,
  anomaliaToRow,
  checklistFromRow,
  checklistToRow,
  type AnomaliaAtualizacaoRow,
  type AnomaliaRow,
  type ChecklistRow,
} from "./mappers";
import type {
  Anomalia,
  AnomaliaAtualizacao,
  Checklist,
  ContextoChecklist,
  FolhaChecklistDia,
  MomentoChecklist,
  MomentoFolha,
  StatusAnomalia,
  StatusMomentoFolha,
} from "./types";
import { MOMENTOS_CHECKLIST } from "./types";

/**
 * Folha do dia (formato NOVO): data__turno__linha__maquina
 * NÃO inclui equipe — regra atual da operação: 1 folha por turno por dia.
 */
export function buildFolhaKey(ctx: ContextoChecklist): string {
  return `${ctx.data}__${ctx.turno}__${ctx.linha}__${ctx.maquina}`;
}

/**
 * Formato ANTIGO (compatibilidade de leitura): data__turno__equipe__linha__maquina
 * Usado apenas para localizar registros já salvos antes da mudança.
 */
export function buildFolhaKeyLegado(ctx: ContextoChecklist): string {
  return `${ctx.data}__${ctx.turno}__${ctx.equipe}__${ctx.linha}__${ctx.maquina}`;
}

/**
 * Chave NORMALIZADA para agrupamento na visão da gestão.
 * SEMPRE usa o formato novo (sem equipe) — mesmo se o registro foi salvo
 * com folha_key antiga (com equipe), agrupamos pela folha do dia
 * (data + turno + linha + máquina), conforme a regra atual da operação.
 */
function checklistFolhaKey(c: Checklist): string {
  return buildFolhaKey(c.contexto);
}

/**
 * Verifica REMOTAMENTE no banco se já existe folha (qualquer checklist) para
 * a mesma data + turno + linha + maquina. Retorna o primeiro checklist achado
 * (ou null). Usado para bloquear que outra conta do mesmo turno crie folha
 * paralela no mesmo dia.
 */
export async function fetchFolhaExistenteRemota(
  ctx: ContextoChecklist,
): Promise<Checklist | null> {
  const { data, error } = await supabase
    .from("checklists")
    .select("*")
    .eq("data_operacao", ctx.data)
    .eq("turno", ctx.turno)
    .eq("linha", ctx.linha)
    .eq("maquina", ctx.maquina)
    .order("criado_em", { ascending: true })
    .limit(1);
  if (error) {
    console.error("[fetchFolhaExistenteRemota] Supabase error:", error);
    throw error;
  }
  const rows = (data ?? []) as unknown as ChecklistRow[];
  return rows[0] ? checklistFromRow(rows[0]) : null;
}

/**
 * Verifica REMOTAMENTE se um momento específico já foi preenchido
 * (status concluido) na mesma folha (data + turno + linha + maquina).
 */
export async function fetchMomentoConcluidoRemoto(
  ctx: ContextoChecklist,
  momento: MomentoChecklist,
): Promise<Checklist | null> {
  const { data, error } = await supabase
    .from("checklists")
    .select("*")
    .eq("data_operacao", ctx.data)
    .eq("turno", ctx.turno)
    .eq("linha", ctx.linha)
    .eq("maquina", ctx.maquina)
    .eq("momento", momento)
    .eq("status", "concluido")
    .limit(1);
  if (error) {
    console.error("[fetchMomentoConcluidoRemoto] Supabase error:", error);
    throw error;
  }
  const rows = (data ?? []) as unknown as ChecklistRow[];
  return rows[0] ? checklistFromRow(rows[0]) : null;
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Usuário não autenticado");
  return data.user.id;
}

// ─────────── Checklists ───────────
export async function fetchChecklists(): Promise<Checklist[]> {
  const { data, error } = await supabase
    .from("checklists")
    .select("*")
    .eq("status", "concluido")
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as ChecklistRow[]).map(checklistFromRow);
}

export async function upsertChecklist(c: Checklist): Promise<void> {
  const userId = await requireUserId();
  const row = checklistToRow(c, userId);
  const { error } = await supabase
    .from("checklists")
    .upsert(row as never, { onConflict: "id" });
  if (error) {
    console.error("[upsertChecklist] Supabase error:", error);
    throw error;
  }
}

// ─────────── Anomalias ───────────
export async function fetchAnomalias(): Promise<Anomalia[]> {
  const { data, error } = await supabase
    .from("anomalias")
    .select("*")
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as AnomaliaRow[]).map(anomaliaFromRow);
}

export async function insertAnomalia(a: Anomalia, dataOperacao?: string): Promise<void> {
  const userId = await requireUserId();
  const row = anomaliaToRow(a, userId, { dataOperacao });
  const { error } = await supabase.from("anomalias").insert(row as never);
  if (error) {
    console.error("[insertAnomalia] Supabase error:", error);
    throw error;
  }
}

/**
 * Após concluir um checklist no banco, vincula as anomalias soltas
 * (que foram criadas durante o rascunho, sem checklist_id) ao checklist real.
 */
export async function linkAnomaliasToChecklist(
  anomaliaIds: string[],
  checklistId: string,
): Promise<void> {
  if (anomaliaIds.length === 0) return;
  const { error } = await supabase
    .from("anomalias")
    .update({ checklist_id: checklistId } as never)
    .in("id", anomaliaIds)
    .is("checklist_id", null);
  if (error) {
    console.error("[linkAnomaliasToChecklist] Supabase error:", error);
    throw error;
  }
}

/**
 * Atualiza status/tratativa de uma anomalia (Gestão).
 * O histórico é gravado AUTOMATICAMENTE pelo trigger no banco.
 */
export async function updateAnomaliaTratativa(
  anomaliaId: string,
  payload: {
    status: StatusAnomalia;
    responsavelManutencao: string;
    oQueFoiFeito: string;
    resolvidoEm?: string;
    atualizadoPorLogin: string;
    atualizadoPorPerfil: string;
    origemHorarioResolucao?: "manual_gestao" | "automatico_manutencao";
  },
): Promise<void> {
  const agora = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: payload.status,
    responsavel_manutencao: payload.responsavelManutencao,
    o_que_foi_feito: payload.oQueFoiFeito,
    ultima_atualizacao_em: agora,
    ultima_atualizacao_por_login: payload.atualizadoPorLogin,
    ultima_atualizacao_por_perfil: payload.atualizadoPorPerfil,
  };
  if (payload.status === "Resolvida") {
    update.resolvido_em = payload.resolvidoEm ?? null;
    update.origem_horario_resolucao = payload.origemHorarioResolucao ?? "manual_gestao";
  } else {
    update.resolvido_em = null;
    update.origem_horario_resolucao = null;
  }
  const { error } = await supabase
    .from("anomalias")
    .update(update as never)
    .eq("id", anomaliaId);
  if (error) {
    console.error("[updateAnomaliaTratativa] Supabase error:", error);
    throw error;
  }
}

/**
 * Atualiza status/tratativa de uma anomalia (Manutenção).
 * - Em andamento: NÃO mexe em resolvido_em (em_andamento_em é carimbado pelo trigger).
 * - Resolvida: resolvido_em = agora; origem_horario_resolucao = "automatico_manutencao".
 * Manutenção NÃO pode editar horário manualmente.
 */
export async function updateAnomaliaTratativaManutencao(
  anomaliaId: string,
  payload: {
    status: "Em andamento" | "Resolvida";
    responsavelManutencao: string;
    oQueFoiFeito: string;
    atualizadoPorLogin: string;
  },
): Promise<void> {
  const agora = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: payload.status,
    responsavel_manutencao: payload.responsavelManutencao,
    o_que_foi_feito: payload.oQueFoiFeito,
    ultima_atualizacao_em: agora,
    ultima_atualizacao_por_login: payload.atualizadoPorLogin,
    ultima_atualizacao_por_perfil: "manutencao",
  };
  if (payload.status === "Resolvida") {
    update.resolvido_em = agora;
    update.origem_horario_resolucao = "automatico_manutencao";
  }
  const { error } = await supabase
    .from("anomalias")
    .update(update as never)
    .eq("id", anomaliaId);
  if (error) {
    console.error("[updateAnomaliaTratativaManutencao] Supabase error:", error);
    throw error;
  }
}

export async function fetchAnomaliaAtualizacoes(
  anomaliaId: string,
): Promise<AnomaliaAtualizacao[]> {
  const { data, error } = await supabase
    .from("anomalia_atualizacoes")
    .select("*")
    .eq("anomalia_id", anomaliaId)
    .order("atualizado_em", { ascending: false });
  if (error) {
    console.error("[fetchAnomaliaAtualizacoes] Supabase error:", error);
    throw error;
  }
  return ((data ?? []) as unknown as AnomaliaAtualizacaoRow[]).map(anomaliaAtualizacaoFromRow);
}

// ─────────── Agrupamentos ───────────
export function getChecklistsByFolhaKey(
  lista: Checklist[],
  folhaKey: string,
): Checklist[] {
  return lista.filter((c) => checklistFolhaKey(c) === folhaKey);
}

export function getChecklistsByMomentoNoDia(
  lista: Checklist[],
  contexto: ContextoChecklist,
  momento: MomentoChecklist,
): Checklist[] {
  const key = buildFolhaKey(contexto);
  return lista.filter((c) => checklistFolhaKey(c) === key && c.momento === momento);
}

export function countVerificacoesMomentoNoDia(
  lista: Checklist[],
  contexto: ContextoChecklist,
  momento: MomentoChecklist,
): number {
  return getChecklistsByMomentoNoDia(lista, contexto, momento).length;
}

export function getChecklistConcluidoMesmoMomento(
  lista: Checklist[],
  contexto: ContextoChecklist,
  momento: MomentoChecklist,
): Checklist | null {
  const ms = getChecklistsByMomentoNoDia(lista, contexto, momento);
  return ms.find((c) => c.status === "concluido") ?? null;
}

export function buildFolhasAgrupadas(
  checklists: Checklist[],
  anomalias: Anomalia[],
): FolhaChecklistDia[] {
  const map = new Map<string, FolhaChecklistDia>();

  for (const c of checklists) {
    const key = checklistFolhaKey(c);
    let folha = map.get(key);
    if (!folha) {
      folha = {
        folhaKey: key,
        contexto: c.contexto,
        momentos: MOMENTOS_CHECKLIST.map<MomentoFolha>((m) => ({
          momento: m,
          status: "pendente" as StatusMomentoFolha,
          verificacoes: [],
        })),
        totalConformes: 0,
        totalNaoConformes: 0,
        totalNaoAplicaveis: 0,
        totalAnomalias: 0,
        ultimaAtualizacao: c.criadoEm,
      };
      map.set(key, folha);
    }
    const slot = folha.momentos.find((mm) => mm.momento === c.momento);
    if (slot) {
      slot.verificacoes.push(c);
      if (c.status === "concluido") slot.status = "concluido";
      else if (slot.status !== "concluido") slot.status = "em_andamento";
    }
    for (const r of c.respostas ?? []) {
      if (!r) continue;
      if (r.resposta === "Conforme") folha.totalConformes++;
      else if (r.resposta === "Não conforme") folha.totalNaoConformes++;
      else if (r.resposta === "Não aplicável") folha.totalNaoAplicaveis++;
    }
    const ts = c.concluidoEm ?? c.criadoEm;
    if (ts > folha.ultimaAtualizacao) folha.ultimaAtualizacao = ts;
  }

  // Associação anomalia → folha do dia.
  // Regra: usar folha_key prioritariamente; fallback por contexto operacional completo
  // (data_operacao + turno + equipe + linha + maquina). NUNCA usar criadoEm.
  // Conta por IDs únicos para evitar dupla contagem.
  const folhasIndex = Array.from(map.values());
  const anomaliasContadas = new Map<string, Set<string>>(); // folhaKey -> set de anomaliaIds

  const registrar = (folhaKey: string, anomaliaId: string) => {
    let set = anomaliasContadas.get(folhaKey);
    if (!set) {
      set = new Set();
      anomaliasContadas.set(folhaKey, set);
    }
    set.add(anomaliaId);
  };

  for (const a of anomalias) {
    if (!a?.id) continue;

    if (a.folhaKey) {
      // Match direto por folha_key. Tenta primeiro a chave nova; se a anomalia
      // foi salva com chave antiga (com equipe), normaliza removendo o segmento
      // extra para casar com a folha agrupada (formato novo).
      let folha = map.get(a.folhaKey);
      if (!folha) {
        // formato antigo: data__turno__equipe__linha__maquina (5 segmentos)
        // formato novo:   data__turno__linha__maquina         (4 segmentos)
        const parts = a.folhaKey.split("__");
        if (parts.length === 5) {
          const novaKey = `${parts[0]}__${parts[1]}__${parts[3]}__${parts[4]}`;
          folha = map.get(novaKey);
        }
      }
      if (folha) registrar(folha.folhaKey, a.id);
      continue;
    }

    // Fallback: precisa de contexto operacional completo para associar com segurança.
    // Não exigimos mais equipe igual — 1 folha por turno por dia.
    if (!a.turno || !a.linha || !a.maquina) continue;

    const candidatas = folhasIndex.filter(
      (f) =>
        f.contexto.turno === a.turno &&
        f.contexto.linha === a.linha &&
        f.contexto.maquina === a.maquina,
    );
    // Só associa se houver exatamente uma folha candidata (evita contagem errada
    // quando existem várias folhas em dias diferentes).
    if (candidatas.length === 1) {
      registrar(candidatas[0].folhaKey, a.id);
    }
  }

  for (const folha of folhasIndex) {
    folha.totalAnomalias = anomaliasContadas.get(folha.folhaKey)?.size ?? 0;
  }

  for (const f of map.values()) {
    for (const m of f.momentos) {
      m.verificacoes.sort((a, b) => (a.verificacaoNumero ?? 1) - (b.verificacaoNumero ?? 1));
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    b.ultimaAtualizacao.localeCompare(a.ultimaAtualizacao),
  );
}

export function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
