import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { storage } from "@/lib/checklist/storage";
import { fetchAnomalias, fetchChecklists } from "@/lib/checklist/supabase-storage";
import type {
  Anomalia,
  Checklist,
  Equipe,
  Hierarquia,
  ModuloAcesso,
  Perfil,
  Turno,
  Usuario,
} from "@/lib/checklist/types";

interface ProfileRow {
  id: string;
  nome: string;
  usuario: string;
  email_interno: string;
  perfil: Perfil;
  equipe_padrao: Equipe | null;
  turno_padrao: Turno | null;
  active: boolean;
  // Campos novos da Etapa 1 — types.ts ainda não regenerado, por isso opcionais.
  matricula?: string | null;
  hierarquia?: Hierarquia | null;
  modulos_acesso?: ModuloAcesso[] | null;
  somente_leitura?: boolean | null;
}

// ──────────────────── Auth Store (singleton) ────────────────────
// Mantém um único estado de auth compartilhado entre todos os componentes,
// evitando múltiplas chamadas a getSession() / onAuthStateChange e flicker.

type AuthListener = (state: { usuario: Usuario | null; loading: boolean }) => void;

const authStore = {
  usuario: null as Usuario | null,
  loading: true,
  initialized: false,
  listeners: new Set<AuthListener>(),

  setState(usuario: Usuario | null, loading: boolean) {
    this.usuario = usuario;
    this.loading = loading;
    this.listeners.forEach((l) => l({ usuario, loading }));
  },

  subscribe(listener: AuthListener) {
    this.listeners.add(listener);
    // emitir estado atual imediatamente
    listener({ usuario: this.usuario, loading: this.loading });
    return () => {
      this.listeners.delete(listener);
    };
  },

  async loadProfile(uid: string) {
    try {
      // Se o userId mudou em relação ao último login salvo neste dispositivo,
      // limpa rascunhos/caches locais do operador anterior para evitar que o
      // novo usuário veja "checklist em andamento" que não é dele.
      if (typeof window !== "undefined") {
        const ULTIMO_UID_KEY = "fm-checklist:last-uid";
        const anterior = window.localStorage.getItem(ULTIMO_UID_KEY);
        if (anterior && anterior !== uid) {
          const remover: string[] = [];
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (!k) continue;
            // Limpa só dados operacionais do app; preserva sessão Supabase.
            if (k.startsWith("fm-checklist:") && k !== ULTIMO_UID_KEY) {
              remover.push(k);
            }
          }
          remover.forEach((k) => window.localStorage.removeItem(k));
        }
        window.localStorage.setItem(ULTIMO_UID_KEY, uid);
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .maybeSingle();
      if (error || !data) {
        this.setState(null, false);
        return;
      }
      const row = data as unknown as ProfileRow;
      if (!row.active) {
        await supabase.auth.signOut();
        this.setState(null, false);
        return;
      }
      this.setState(
        {
          perfil: row.perfil,
          nome: row.nome,
          usuario: row.usuario,
          equipePadrao: row.equipe_padrao,
          turnoPadrao: row.turno_padrao,
          userId: row.id,
          matricula: row.matricula ?? null,
          hierarquia: (row.hierarquia ?? "operador") as Hierarquia,
          modulosAcesso: row.modulos_acesso ?? [row.perfil as ModuloAcesso],
          somenteLeitura: row.somente_leitura ?? false,
        },
        false,
      );
    } catch (e) {
      console.error("[auth] erro ao carregar profile", e);
      this.setState(null, false);
    }
  },

  init() {
    if (this.initialized || typeof window === "undefined") return;
    this.initialized = true;

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // marcar loading enquanto recarrega o profile
        this.setState(this.usuario, true);
        void this.loadProfile(session.user.id);
      } else {
        this.setState(null, false);
      }
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        void this.loadProfile(session.user.id);
      } else {
        this.setState(null, false);
      }
    });
  },
};

// ──────────────────── Usuário (auth + profile) ────────────────────
export function useUsuario(): Usuario | null {
  const [usuario, setUsuario] = useState<Usuario | null>(authStore.usuario);

  useEffect(() => {
    authStore.init();
    const unsub = authStore.subscribe(({ usuario }) => setUsuario(usuario));
    return unsub;
  }, []);

  return usuario;
}

/**
 * Estado de carregamento da sessão/profile inicial.
 * Use para evitar redirecionamento prematuro em telas protegidas.
 */
export function useAuthLoading(): boolean {
  const [loading, setLoading] = useState<boolean>(authStore.loading);

  useEffect(() => {
    authStore.init();
    const unsub = authStore.subscribe(({ loading }) => setLoading(loading));
    return unsub;
  }, []);

  return loading;
}

// ──────────────────── Rascunho local ────────────────────
export function useRascunho(): Checklist | null {
  const [value, setValue] = useState<Checklist | null>(() => storage.getRascunho());

  useEffect(() => {
    if (typeof window === "undefined") return;
    setValue(storage.getRascunho());
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      if (!detail || detail.key === storage.KEYS.rascunho) {
        setValue(storage.getRascunho());
      }
    };
    const sh = (e: StorageEvent) => {
      if (e.key === storage.KEYS.rascunho) setValue(storage.getRascunho());
    };
    window.addEventListener("fm-storage-update", handler);
    window.addEventListener("storage", sh);
    return () => {
      window.removeEventListener("fm-storage-update", handler);
      window.removeEventListener("storage", sh);
    };
  }, []);

  return value;
}

// ──────────────────── Checklists do banco ────────────────────
export interface RemoteState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useChecklistsRemote(opts: { realtime?: boolean } = {}): RemoteState<Checklist[]> {
  const [data, setData] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchChecklists();
      setData(list);
    } catch (e) {
      console.error(e);
      setError("Erro ao carregar dados. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refetch();
    if (!opts.realtime) return;
    const ch = supabase
      .channel("checklists-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "checklists" }, () => {
        void refetch();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [opts.realtime]);

  return { data, loading, error, refetch };
}

export function useAnomaliasRemote(opts: { realtime?: boolean } = {}): RemoteState<Anomalia[]> {
  const [data, setData] = useState<Anomalia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchAnomalias();
      setData(list);
    } catch (e) {
      console.error(e);
      setError("Erro ao carregar dados. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refetch();
    if (!opts.realtime) return;
    const ch = supabase
      .channel("anomalias-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "anomalias" }, () => {
        void refetch();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [opts.realtime]);

  return { data, loading, error, refetch };
}

// Compatibilidade: hooks "antigos" agora retornam apenas o array (sem realtime)
export function useChecklists(): Checklist[] {
  return useChecklistsRemote().data;
}

export function useAnomalias(): Anomalia[] {
  return useAnomaliasRemote().data;
}
