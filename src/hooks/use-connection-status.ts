import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  upsertChecklist,
  linkAnomaliasToChecklist,
  insertAnomalia,
} from "@/lib/checklist/supabase-storage";
import type { Anomalia, Checklist } from "@/lib/checklist/types";
import {
  ConflitoVersaoError,
  insertLimpezaEdicao,
  insertPtpEdicao,
  upsertLimpezaTurno,
  upsertPtpJanela,
} from "@/lib/verso/supabase-storage";
import {
  labelLimpezaItem,
  labelLimpezaTurno,
  labelPtpJanela,
  origemCodigoLimpezaItem,
  upsertObservacaoVerso,
} from "@/lib/verso/observacoes";
import type {
  LimpezaEdicaoPayload,
  LimpezaTurno,
  PtpEdicaoPayload,
  PtpJanela,
} from "@/lib/verso/types";
import {
  insertItEvento,
  updateItSessaoFechamento,
} from "@/lib/it/supabase-analytics";
import type { EventoIt } from "@/lib/it/telemetria";
import { VERSO_CONTEXTO_FIXO } from "@/lib/verso/constants";
import {
  insertProducaoHoraEdicao,
  upsertProducaoHora,
} from "@/lib/producao/supabase-storage";
import type {
  ProducaoHora,
  ProducaoHoraEdicaoPayload,
} from "@/lib/producao/types";

// ─────────────────────────────────────────────────────────────────────────────
// FONTE ÚNICA DE VERDADE (singleton) para status de conexão + fila offline.
// Todos os componentes consomem deste store via useConnectionStatus()/useOfflineQueue().
// ─────────────────────────────────────────────────────────────────────────────

const FILA_KEY = "fm-checklist:fila-offline";
const AVISO_OFFLINE_KEY = "fm-checklist:aviso-offline-exibido";
const HEALTH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const MAX_TENTATIVAS = 5;

export type FilaItemTipo =
  | "checklist"
  | "anomalia"
  | "ptp_janela"
  | "limpeza_turno"
  | "producao_hora"
  | "it_evento"
  | "it_sessao_close";

export interface FilaItem {
  id: string;
  tipo: FilaItemTipo;
  payload: unknown;
  criadoEm: string;
  tentativas: number;
  /** "conflito" = conflito de versão detectado; NÃO retentar. */
  status: "pendente" | "enviando" | "erro" | "conflito";
  ultimoErro?: string;
}

interface State {
  isOnline: boolean;
  pendingCount: number;
  sincronizando: boolean;
  fila: FilaItem[];
}

type Listener = (s: State) => void;

function isBrowser() {
  return typeof window !== "undefined";
}

function readFila(): FilaItem[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(FILA_KEY);
    return raw ? (JSON.parse(raw) as FilaItem[]) : [];
  } catch {
    return [];
  }
}

function writeFila(fila: FilaItem[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(FILA_KEY, JSON.stringify(fila));
  } catch {
    /* ignore */
  }
}

function genFilaId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function sincronizarObservacaoPtp(janela: PtpJanela, login?: string, nome?: string): Promise<void> {
  const finalizada = ["sem_ocorrencia", "houve_ocorrencia", "nao_rodou"].includes(janela.statusJanela);
  if (!finalizada) return;
  await upsertObservacaoVerso({
    folhaDiaKey: janela.folhaDiaKey,
    dataOperacao: janela.dataOperacao,
    linha: janela.linha || VERSO_CONTEXTO_FIXO.linha,
    maquina: janela.maquina || VERSO_CONTEXTO_FIXO.maquina,
    origemTipo: "ptp",
    origemCodigo: janela.janelaCodigo,
    origemLabel: labelPtpJanela(janela.janelaCodigo),
    texto: janela.observacao ?? "",
    registradoPorLogin: login || janela.operadorLogin || janela.ultimaEdicaoPorLogin || "offline",
    registradoPorNome: nome || janela.operadorNome || janela.ultimaEdicaoPorNome || "Operador",
  });
}

async function sincronizarObservacoesLimpeza(turno: LimpezaTurno, login?: string, nome?: string): Promise<void> {
  const finalizada = turno.status === "aguardando_validacao" || turno.status === "validado";
  if (!finalizada) return;
  const ctx = {
    folhaDiaKey: turno.folhaDiaKey,
    dataOperacao: turno.dataOperacao,
    linha: turno.linha || VERSO_CONTEXTO_FIXO.linha,
    maquina: turno.maquina || VERSO_CONTEXTO_FIXO.maquina,
    registradoPorLogin: login || turno.operadorLogin || turno.ultimaEdicaoPorLogin || "offline",
    registradoPorNome: nome || turno.operadorNome || turno.ultimaEdicaoPorNome || "Operador",
  };
  await upsertObservacaoVerso({
    ...ctx,
    origemTipo: "limpeza",
    origemCodigo: turno.turno,
    origemLabel: labelLimpezaTurno(turno.turno),
    texto: "",
  });
  for (const it of turno.itens) {
    await upsertObservacaoVerso({
      ...ctx,
      origemTipo: "limpeza",
      origemCodigo: origemCodigoLimpezaItem(turno.turno, it.codigo),
      origemLabel: labelLimpezaItem(turno.turno, it.codigo),
      texto: it.status === "nao_realizado" ? it.observacao ?? "" : "",
    });
  }
}

/** Conta apenas itens "ao vivo" — exclui conflito e itens que estouraram tentativas. */
function countAtivos(fila: FilaItem[]): number {
  return fila.filter(
    (f) => f.status !== "conflito" && f.tentativas < MAX_TENTATIVAS,
  ).length;
}

const store = {
  state: {
    isOnline: isBrowser() ? navigator.onLine : true,
    pendingCount: 0,
    sincronizando: false,
    fila: [] as FilaItem[],
  } as State,
  listeners: new Set<Listener>(),
  initialized: false,
  intervalId: null as ReturnType<typeof setInterval> | null,
  visibilityHandler: null as (() => void) | null,
  onlineHandler: null as (() => void) | null,
  offlineHandler: null as (() => void) | null,

  emit() {
    this.listeners.forEach((l) => l(this.state));
  },

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  },

  setOnline(isOnline: boolean) {
    const prev = this.state.isOnline;
    if (prev === isOnline) return;
    this.state = { ...this.state, isOnline };
    this.emit();

    if (prev && !isOnline) {
      // ficou offline → aviso único por sessão
      if (isBrowser()) {
        const jaAvisou = window.sessionStorage.getItem(AVISO_OFFLINE_KEY);
        if (!jaAvisou) {
          toast(
            "A conexão com a internet falhou, mas você pode continuar usando normalmente. Quando a conexão voltar, os dados serão enviados automaticamente.",
            { duration: 8000 },
          );
          window.sessionStorage.setItem(AVISO_OFFLINE_KEY, "1");
        }
      }
    } else if (!prev && isOnline) {
      // voltou online
      if (this.state.pendingCount > 0) {
        toast("Conexão restaurada. Enviando dados...");
        void this.sincronizar();
      }
    }
  },

  async checkBackend(): Promise<boolean> {
    if (!isBrowser()) return true;
    if (!navigator.onLine) return false;
    try {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!url) return navigator.onLine;
      const res = await fetch(`${url}/rest/v1/`, {
        method: "HEAD",
        headers: apikey ? { apikey } : undefined,
        signal: AbortSignal.timeout(5000),
      });
      return res.status < 500;
    } catch {
      return false;
    }
  },

  async checkNow(): Promise<boolean> {
    const ok = await this.checkBackend();
    this.setOnline(ok);
    // se está online e tem pendências, drena a fila imediatamente
    if (ok && this.state.pendingCount > 0 && !this.state.sincronizando) {
      void this.sincronizar();
    }
    return ok;
  },

  refreshPending() {
    const fila = readFila();
    this.state = { ...this.state, fila, pendingCount: countAtivos(fila) };
    this.emit();
  },

  enfileirar(tipo: FilaItemTipo, payload: unknown) {
    const fila = readFila();
    const item: FilaItem = {
      id: genFilaId(),
      tipo,
      payload,
      criadoEm: new Date().toISOString(),
      tentativas: 0,
      status: "pendente",
    };
    fila.push(item);
    writeFila(fila);
    this.refreshPending();
  },

  async processarItem(item: FilaItem): Promise<void> {
    if (item.tipo === "checklist") {
      const checklist = item.payload as Checklist;
      await upsertChecklist(checklist);
      const anomaliaIds = (checklist.respostas ?? [])
        .map((r) => r?.anomaliaId)
        .filter((id): id is string => !!id);
      if (anomaliaIds.length > 0) {
        try {
          await linkAnomaliasToChecklist(anomaliaIds, checklist.id);
        } catch (e) {
          console.error("[fila] linkAnomaliasToChecklist falhou:", e);
          // não relança — checklist já foi gravado com sucesso
        }
      }
    } else if (item.tipo === "anomalia") {
      const { anomalia, dataOperacao } = item.payload as {
        anomalia: Anomalia;
        dataOperacao?: string;
      };
      await insertAnomalia(anomalia, dataOperacao);
    } else if (item.tipo === "ptp_janela") {
      const { janela, expectedUpdatedAt, edicao } = item.payload as {
        janela: PtpJanela;
        expectedUpdatedAt?: string | null;
        edicao?: PtpEdicaoPayload | null;
      };
      await upsertPtpJanela(janela, { expectedUpdatedAt: expectedUpdatedAt ?? undefined });
      await sincronizarObservacaoPtp(janela, edicao?.editadoPorLogin, edicao?.editadoPorNome);
      if (edicao) {
        try {
          await insertPtpEdicao(edicao);
        } catch (e) {
          console.error("[fila] insertPtpEdicao falhou:", e);
        }
      }
    } else if (item.tipo === "limpeza_turno") {
      const { turno, expectedUpdatedAt, edicao } = item.payload as {
        turno: LimpezaTurno;
        expectedUpdatedAt?: string | null;
        edicao?: LimpezaEdicaoPayload | null;
      };
      await upsertLimpezaTurno(turno, { expectedUpdatedAt: expectedUpdatedAt ?? undefined });
      await sincronizarObservacoesLimpeza(turno, edicao?.editadoPorLogin, edicao?.editadoPorNome);
      if (edicao) {
        try {
          await insertLimpezaEdicao(edicao);
        } catch (e) {
          console.error("[fila] insertLimpezaEdicao falhou:", e);
        }
      }
    } else if (item.tipo === "producao_hora") {
      const { hora, expectedUpdatedAt, edicao } = item.payload as {
        hora: ProducaoHora;
        expectedUpdatedAt?: string | null;
        edicao?: ProducaoHoraEdicaoPayload | null;
      };
      await upsertProducaoHora(hora, { expectedUpdatedAt: expectedUpdatedAt ?? undefined });
      if (edicao) {
        try {
          await insertProducaoHoraEdicao(edicao);
        } catch (e) {
          console.error("[fila] insertProducaoHoraEdicao falhou:", e);
        }
      }
    } else if (item.tipo === "it_evento") {
      const evento = item.payload as EventoIt;
      await insertItEvento(evento);
    } else if (item.tipo === "it_sessao_close") {
      const { sessao_id, duracao_total_ms } = item.payload as {
        sessao_id: string;
        duracao_total_ms: number;
      };
      await updateItSessaoFechamento(sessao_id, duracao_total_ms);
    }
  },

  async sincronizar(): Promise<void> {
    if (this.state.sincronizando) return;
    let fila = readFila();
    if (fila.length === 0) return;

    this.state = { ...this.state, sincronizando: true };
    this.emit();

    let sucessos = 0;
    try {
      // série, um por vez
      for (let i = 0; i < fila.length; i++) {
        const item = fila[i];
        if (item.status === "enviando") continue;
        if (item.status === "conflito") continue; // conflito não retenta
        if (item.tentativas >= MAX_TENTATIVAS) continue;

        // marca como enviando
        fila[i] = { ...item, status: "enviando" };
        writeFila(fila);
        this.state = { ...this.state, fila: [...fila], pendingCount: countAtivos(fila) };
        this.emit();

        try {
          await this.processarItem(fila[i]);
          // sucesso → remove
          fila = fila.filter((x) => x.id !== item.id);
          writeFila(fila);
          sucessos++;
          this.state = { ...this.state, fila: [...fila], pendingCount: countAtivos(fila) };
          this.emit();
          // ajusta índice porque removemos
          i--;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const isConflito =
            err instanceof ConflitoVersaoError || /conflito de vers/i.test(msg);
          const isNetworkError =
            /failed to fetch|networkerror|fetch failed|load failed|timeout|aborted|err_network|err_internet/i.test(
              msg,
            );
          if (isConflito) {
            fila[i] = {
              ...fila[i],
              status: "conflito",
              tentativas: fila[i].tentativas + 1,
              ultimoErro: msg,
            };
            writeFila(fila);
            this.state = { ...this.state, fila: [...fila], pendingCount: countAtivos(fila) };
            this.emit();
            toast.error(
              "Conflito de versão: outro operador alterou esse registro. Recarregue a tela antes de salvar.",
              { duration: 10000 },
            );
            continue;
          }
          if (isNetworkError) {
            fila[i] = {
              ...fila[i],
              status: "erro",
              tentativas: fila[i].tentativas + 1,
              ultimoErro: msg,
            };
            writeFila(fila);
            this.state = { ...this.state, fila: [...fila], pendingCount: countAtivos(fila) };
            this.emit();
            this.setOnline(false);
            break;
          }
          // Erro de aplicação (validação, auth, payload inválido, etc).
          // Descartar imediatamente — reter só confundiria o operador com um
          // "X pend." que nunca some. O console preserva o detalhe.
          console.error(
            `[fila] descartando item ${item.tipo} (${item.id}) por erro de aplicação:`,
            msg,
            item.payload,
          );
          fila = fila.filter((x) => x.id !== item.id);
          writeFila(fila);
          this.state = { ...this.state, fila: [...fila], pendingCount: countAtivos(fila) };
          this.emit();
          i--;
          continue;
        }
      }
    } finally {
      this.state = { ...this.state, sincronizando: false };
      this.emit();
      if (sucessos > 0 && this.state.pendingCount === 0) {
        toast.success("Dados enviados com sucesso.");
      } else if (sucessos > 0 && this.state.pendingCount > 0) {
        toast(`${sucessos} item(ns) enviado(s). ${this.state.pendingCount} pendente(s) restante(s).`);
      }
    }
  },

  init() {
    if (this.initialized || !isBrowser()) return;
    this.initialized = true;

    // estado inicial baseado em fila existente
    this.refreshPending();

    // CAMADA A — eventos do navegador
    this.onlineHandler = () => {
      void this.checkNow();
    };
    this.offlineHandler = () => {
      this.setOnline(false);
    };
    window.addEventListener("online", this.onlineHandler);
    window.addEventListener("offline", this.offlineHandler);

    // visibilitychange → checa quando volta ao foco
    this.visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        void this.checkNow();
      }
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);

    // health check periódico (somente quando visível)
    this.intervalId = setInterval(() => {
      if (document.visibilityState === "visible") {
        void this.checkNow();
      }
    }, HEALTH_INTERVAL_MS);

    // checagem inicial real
    void this.checkNow();
  },
};

// ─── Hook público: status + checkNow ───
export function useConnectionStatus() {
  const [state, setState] = useState<State>(store.state);

  useEffect(() => {
    store.init();
    const unsub = store.subscribe(setState);
    return unsub;
  }, []);

  return {
    isOnline: state.isOnline,
    pendingCount: state.pendingCount,
    sincronizando: state.sincronizando,
    checkNow: () => store.checkNow(),
  };
}

// ─── Hook público: fila offline (singleton compartilhado) ───
export function useOfflineQueue() {
  const [state, setState] = useState<State>(store.state);

  useEffect(() => {
    store.init();
    const unsub = store.subscribe(setState);
    return unsub;
  }, []);

  return {
    fila: state.fila,
    sincronizando: state.sincronizando,
    enfileirar: (tipo: FilaItemTipo, payload: unknown) => store.enfileirar(tipo, payload),
    sincronizar: () => store.sincronizar(),
  };
}
