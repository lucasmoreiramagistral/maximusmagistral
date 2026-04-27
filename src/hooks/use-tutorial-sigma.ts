import { useCallback, useEffect, useRef, useState } from "react";
import type { TutorialManifest } from "@/lib/tutoriais/sigma-types";

const CACHE_KEY = "tutorial-sigma-manifest";
const CACHE_TS_KEY = "tutorial-sigma-manifest-ts";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

type Status = "idle" | "loading" | "ready" | "error";

function resolveBaseUrl(): string {
  const explicit = (
    import.meta.env.VITE_TUTORIAIS_STORAGE_BASE_URL as string | undefined
  )?.replace(/\/+$/, "");
  if (explicit) return explicit;

  // Fallback: deriva do mesmo projeto Supabase usado pelas ITs.
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
    ?.replace(/\/+$/, "");
  if (supabaseUrl) {
    return `${supabaseUrl}/storage/v1/object/public/tutoriais-app`;
  }

  // Último fallback: mesma URL hardcoded das ITs (mesmo projeto).
  return "https://jlmzujqkaoauzacouqgj.supabase.co/storage/v1/object/public/tutoriais-app";
}

const baseUrl = resolveBaseUrl();

function readCache(): TutorialManifest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TutorialManifest;
  } catch {
    return null;
  }
}

function isCacheFresh(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ts = window.localStorage.getItem(CACHE_TS_KEY);
    if (!ts) return false;
    const saved = new Date(ts).getTime();
    if (Number.isNaN(saved)) return false;
    return Date.now() - saved < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

function writeCache(manifest: TutorialManifest) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(manifest));
    window.localStorage.setItem(CACHE_TS_KEY, new Date().toISOString());
  } catch {
    /* ignore quota */
  }
}

export interface UseTutorialSigmaResult {
  status: Status;
  manifest: TutorialManifest | null;
  error: string | null;
  fromCache: boolean;
  getImageUrl: (filename: string) => string;
  recarregar: () => Promise<void>;
}

/**
 * Carrega o tutorial SIGMA Manutenção do Supabase Storage.
 * Usa cache em localStorage (TTL 1h) com revalidação silenciosa.
 * Funciona offline desde que tenha sido aberto ao menos uma vez online.
 */
export function useTutorialSigma(): UseTutorialSigmaResult {
  const [manifest, setManifest] = useState<TutorialManifest | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const mounted = useRef(true);

  const fetchManifest = useCallback(async (silent: boolean) => {
    if (!silent) {
      setStatus("loading");
      setError(null);
    }

    const cache = readCache();

    try {
      const res = await fetch(`${baseUrl}/sigma/manifest.json`, {
        cache: "no-cache",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as TutorialManifest;
      if (!mounted.current) return;
      setManifest(data);
      setFromCache(false);
      setStatus("ready");
      writeCache(data);
    } catch (e) {
      if (!mounted.current) return;
      if (silent) return;
      if (cache) {
        setManifest(cache);
        setFromCache(true);
        setStatus("ready");
      } else {
        setError(e instanceof Error ? e.message : "Erro desconhecido");
        setStatus("error");
      }
    }
  }, []);

  const carregar = useCallback(async () => {
    const cache = readCache();
    if (cache && isCacheFresh()) {
      setManifest(cache);
      setFromCache(true);
      setStatus("ready");
      void fetchManifest(true);
      return;
    }
    await fetchManifest(false);
  }, [fetchManifest]);

  useEffect(() => {
    mounted.current = true;
    void carregar();
    return () => {
      mounted.current = false;
    };
  }, [carregar]);

  const getImageUrl = useCallback((filename: string): string => {
    return `${baseUrl}/sigma/${filename}`;
  }, []);

  return {
    status,
    manifest,
    error,
    fromCache,
    getImageUrl,
    recarregar: carregar,
  };
}
