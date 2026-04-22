import { useCallback, useEffect, useRef, useState } from "react";
import {
  IT_DOC_KEY,
  type IndiceEntry,
  type ItDocSlug,
  type ManifestDoc,
  type ManifestRoot,
} from "@/lib/it/types";

const CACHE_KEY = "it-manifest-cache";
const CACHE_TS_KEY = "it-manifest-cache-ts";
const CACHE_TTL_MS = 60 * 60 * 1000;

type Status = "idle" | "loading" | "ready" | "error";

function resolveBaseUrl(): string {
  const explicit = (import.meta.env.VITE_IT_STORAGE_BASE_URL as string | undefined)?.replace(
    /\/+$/,
    "",
  );
  if (explicit) return explicit;
  return "https://jlmzujqkaoauzacouqgj.supabase.co/storage/v1/object/public/instrucoes-trabalho";
}

const baseUrl = resolveBaseUrl();

function readCache(): ManifestRoot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ManifestRoot;
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

function writeCache(manifest: ManifestRoot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(manifest));
    window.localStorage.setItem(CACHE_TS_KEY, new Date().toISOString());
  } catch {
    /* ignore quota */
  }
}

export interface UseItDocumentResult {
  status: Status;
  manifest: ManifestRoot | null;
  error: string | null;
  fromCache: boolean;
  getDoc: (doc: ItDocSlug) => ManifestDoc | null;
  getImageUrl: (filename: string) => string;
  getIndice: (doc: ItDocSlug) => IndiceEntry[];
  recarregar: () => Promise<void>;
}

export function useItDocument(): UseItDocumentResult {
  const [manifest, setManifest] = useState<ManifestRoot | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const mounted = useRef(true);

  const fetchManifest = useCallback(async (silent: boolean) => {
    if (!silent) {
      setStatus("loading");
      setError(null);
    }

    if (!baseUrl) {
      if (!silent) {
        setError("VITE_IT_STORAGE_BASE_URL não configurada.");
        setStatus("error");
      }
      return;
    }

    const cache = readCache();

    try {
      const res = await fetch(`${baseUrl}/manifest.json`, {
        cache: "no-cache",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ManifestRoot;
      if (!mounted.current) return;
      setManifest(data);
      setFromCache(false);
      setStatus("ready");
      writeCache(data);
    } catch (e) {
      if (!mounted.current) return;
      if (silent) {
        // Atualização em background falhou; manter estado atual
        return;
      }
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
      // Servir do cache imediatamente
      setManifest(cache);
      setFromCache(true);
      setStatus("ready");
      // Atualização silenciosa em background
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

  const getDoc = useCallback(
    (doc: ItDocSlug): ManifestDoc | null => {
      if (!manifest) return null;
      return manifest[IT_DOC_KEY[doc]] ?? null;
    },
    [manifest],
  );

  const getImageUrl = useCallback((filename: string): string => {
    return `${baseUrl}/${filename}`;
  }, []);

  const getIndice = useCallback(
    (doc: ItDocSlug): IndiceEntry[] => {
      return getDoc(doc)?.indice ?? [];
    },
    [getDoc],
  );

  return {
    status,
    manifest,
    error,
    fromCache,
    getDoc,
    getImageUrl,
    getIndice,
    recarregar: carregar,
  };
}
