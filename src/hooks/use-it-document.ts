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

type Status = "idle" | "loading" | "ready" | "error";

const BUCKET = "instrucoes-trabalho";

function resolveBaseUrl(): string {
  const explicit = (import.meta.env.VITE_IT_STORAGE_BASE_URL as string | undefined)?.replace(
    /\/+$/,
    "",
  );
  if (explicit) return explicit;
  const supa = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");
  if (supa) return `${supa}/storage/v1/object/public/${BUCKET}`;
  return "";
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
  getEntradaAtual: (doc: ItDocSlug, paginaAtual: number) => IndiceEntry | null;
  recarregar: () => Promise<void>;
}

export function useItDocument(): UseItDocumentResult {
  const [manifest, setManifest] = useState<ManifestRoot | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const mounted = useRef(true);

  const carregar = useCallback(async () => {
    setStatus("loading");
    setError(null);

    if (!baseUrl) {
      setError("VITE_IT_STORAGE_BASE_URL não configurada.");
      setStatus("error");
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

  const getEntradaAtual = useCallback(
    (doc: ItDocSlug, paginaAtual: number): IndiceEntry | null => {
      const indice = getIndice(doc);
      const candidatas = indice.filter(
        (e) => e.tipo !== "secao" && e.pagina <= paginaAtual,
      );
      if (candidatas.length === 0) return null;
      return candidatas.reduce((a, b) => (b.pagina > a.pagina ? b : a));
    },
    [getIndice],
  );

  return {
    status,
    manifest,
    error,
    fromCache,
    getDoc,
    getImageUrl,
    getIndice,
    getEntradaAtual,
    recarregar: carregar,
  };
}
