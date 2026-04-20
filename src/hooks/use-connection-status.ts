import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  upsertChecklist,
  linkAnomaliasToChecklist,
  insertAnomalia,
} from "@/lib/checklist/supabase-storage";
import type { Anomalia, Checklist } from "@/lib/checklist/types";

// ─────────────────────────────────────────────────────────────────────────────
// FONTE ÚNICA DE VERDADE (singleton) para status de conexão + fila offline.
// Todos os componentes consomem deste store via useConnectionStatus()/useOfflineQueue().
// ─────────────────────────────────────────────────────────────────────────────

const FILA_KEY = "fm-checklist:fila-offline";
const AVISO_OFFLINE_KEY = "fm-checklist:aviso-offline-exibido";
const HEALTH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const MAX_TENTATIVAS = 5;

export type FilaItemTipo = "checklist" | "anomalia";
export interface FilaItem {
  id: string;
  tipo: FilaItemTipo;
  payload: unknown;
  criadoEm: string;
  tentativas: number;
  status: "pendente" | "enviando" | "erro";
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
      if (!url) return navigator.onLine;
      const res = await fetch(`${url}/rest/v1/`, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      // erro de rede (fetch throws) → offline
      // 5xx → servidor indisponível → offline
      // qualquer outra resposta → servidor acessível
      return res.status < 500;
    } catch {
      return false;
    }
  },

  async checkNow(): Promise<boolean> {
    const ok = await this.checkBackend();
    this.setOnline(ok);
    return ok;
  },

  refreshPending() {
    const fila = readFila();
    this.state = { ...this.state, fila, pendingCount: fila.length };
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
        if (item.tentativas >= MAX_TENTATIVAS) continue;

        // marca como enviando
        fila[i] = { ...item, status: "enviando" };
        writeFila(fila);
        this.state = { ...this.state, fila: [...fila], pendingCount: fila.length };
        this.emit();

        try {
          await this.processarItem(fila[i]);
          // sucesso → remove
          fila = fila.filter((x) => x.id !== item.id);
          writeFila(fila);
          sucessos++;
          this.state = { ...this.state, fila: [...fila], pendingCount: fila.length };
          this.emit();
          // ajusta índice porque removemos
          i--;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // detecta se é erro de rede (Failed to fetch, NetworkError, timeout, etc)
          const isNetworkError =
            /failed to fetch|networkerror|fetch failed|load failed|timeout|aborted|err_network|err_internet/i.test(
              msg,
            );
          fila[i] = {
            ...fila[i],
            status: "erro",
            tentativas: fila[i].tentativas + 1,
            ultimoErro: msg,
          };
          writeFila(fila);
          this.state = { ...this.state, fila: [...fila], pendingCount: fila.length };
          this.emit();
          if (isNetworkError) {
            // provavelmente offline novamente — para a sincronização
            // e marca como offline para revalidar conexão
            this.setOnline(false);
            break;
          }
          // erro de aplicação (validação, auth, etc) — segue tentando os próximos
          // para não travar a fila inteira por causa de um item ruim
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
