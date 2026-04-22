// ============================================================
// Hook de telemetria do viewer de IT.
// - Cria UMA sessão por consulta (persistida em sessionStorage)
// - Registra eventos via fila offline (fire-and-forget)
// - Captura page_leave / it_close de forma defensiva:
//     visibilitychange + pagehide + beforeunload + cleanup
//   sendBeacon é apenas reforço; o registro REAL fica garantido
//   na fila offline em localStorage antes do handler retornar.
// ============================================================

import { useCallback, useEffect, useRef } from "react";
import { useUsuario } from "@/hooks/use-storage";
import { useOfflineQueue } from "@/hooks/use-connection-status";
import { calcularDataOperacional } from "@/lib/operacao/data-operacional";
import { supabase } from "@/integrations/supabase/client";
import {
  insertItEvento,
  insertItSessao,
  updateItSessaoFechamento,
} from "@/lib/it/supabase-analytics";
import {
  gerarUuid,
  nowIso,
  slugParaDocumento,
  type ContextoOperadorIt,
  type EventoIt,
  type ModoCacheIt,
  type SessaoIt,
  type TipoEventoIt,
} from "@/lib/it/telemetria";
import type { ItDocSlug } from "@/lib/it/types";

// chave do sessionStorage por slug — preserva a sessão entre remontagens
function chaveSessaoStorage(slug: ItDocSlug): string {
  return `it-telemetria:sessao:${slug}`;
}

interface SessaoPersistida {
  id: string;
  iniciado_em: string;
  documento: "it002" | "it005";
  rota: string;
  contexto: ContextoOperadorIt;
}

function lerSessaoPersistida(slug: ItDocSlug): SessaoPersistida | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(chaveSessaoStorage(slug));
    return raw ? (JSON.parse(raw) as SessaoPersistida) : null;
  } catch {
    return null;
  }
}

function escreverSessaoPersistida(slug: ItDocSlug, s: SessaoPersistida) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(chaveSessaoStorage(slug), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function limparSessaoPersistida(slug: ItDocSlug) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(chaveSessaoStorage(slug));
  } catch {
    /* ignore */
  }
}

export interface ItTelemetriaApi {
  trackEvento: (
    tipo: TipoEventoIt,
    extras?: Partial<
      Pick<
        EventoIt,
        | "pagina"
        | "pagina_destino"
        | "tipo_entrada"
        | "label"
        | "numero"
        | "termo_busca"
        | "quantidade_resultados"
        | "duracao_ms"
        | "modo_cache"
        | "metadata_json"
      >
    >,
  ) => void;
  trackPageView: (pagina: number) => void;
}

export function useItTelemetria(slug: ItDocSlug): ItTelemetriaApi {
  const usuario = useUsuario();
  const { enfileirar } = useOfflineQueue();

  const sessaoRef = useRef<SessaoIt | null>(null);
  const paginaAtualRef = useRef<number | null>(null);
  const inicioPaginaRef = useRef<number | null>(null);
  const inicioSessaoRef = useRef<number>(Date.now());

  // Snapshot estável do contexto (recalculado quando user muda)
  const contextoRef = useRef<ContextoOperadorIt>({
    user_id: null,
    operador_nome: null,
    perfil: null,
    equipe: null,
    turno: null,
    data_operacional: null,
  });

  useEffect(() => {
    contextoRef.current = {
      user_id: usuario?.userId ?? null,
      operador_nome: usuario?.nome ?? null,
      perfil: usuario?.perfil ?? null,
      equipe: usuario?.equipePadrao ?? null,
      turno: usuario?.turnoPadrao ?? null,
      data_operacional:
        usuario?.equipePadrao && usuario?.turnoPadrao
          ? calcularDataOperacional(usuario.equipePadrao, usuario.turnoPadrao)
          : null,
    };
  }, [usuario]);

  // ── helper interno: enfileira evento (fire-and-forget) ──
  const registrarEvento = useCallback(
    (
      tipo: TipoEventoIt,
      extras?: Partial<EventoIt>,
    ) => {
      try {
        const sessao = sessaoRef.current;
        if (!sessao) return;
        const evento: EventoIt = {
          sessao_id: sessao.id,
          documento: sessao.documento,
          tipo_evento: tipo,
          contexto: contextoRef.current,
          created_at: nowIso(),
          ...extras,
        };

        // Tenta direto; em caso de falha, vai pra fila offline.
        void insertItEvento(evento).catch(() => {
          try {
            enfileirar("it_evento", evento);
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* nunca quebra UI */
      }
    },
    [enfileirar],
  );

  // ── abrir sessão (uma vez por slug) ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!usuario) return; // sem user, não abre sessão

    let cancelled = false;

    (async () => {
      const persistida = lerSessaoPersistida(slug);
      if (persistida) {
        sessaoRef.current = {
          id: persistida.id,
          documento: persistida.documento,
          rota: persistida.rota,
          iniciado_em: persistida.iniciado_em,
          contexto: persistida.contexto,
        };
        return;
      }

      const documento = slugParaDocumento(slug);
      const sessao: SessaoIt = {
        id: gerarUuid(),
        documento,
        rota: window.location.pathname,
        iniciado_em: nowIso(),
        contexto: contextoRef.current,
      };
      sessaoRef.current = sessao;
      inicioSessaoRef.current = Date.now();
      escreverSessaoPersistida(slug, {
        id: sessao.id,
        iniciado_em: sessao.iniciado_em,
        documento: sessao.documento,
        rota: sessao.rota,
        contexto: sessao.contexto,
      });

      // INSERT da sessão; se falhar, enfileira sessão crua (será criada no drain)
      try {
        await insertItSessao(sessao);
      } catch {
        try {
          enfileirar("it_evento", {
            sessao_id: sessao.id,
            documento: sessao.documento,
            tipo_evento: "it_open",
            contexto: sessao.contexto,
            created_at: sessao.iniciado_em,
            metadata_json: { __sessao_inicial: true, rota: sessao.rota },
          } satisfies EventoIt);
        } catch {
          /* ignore */
        }
      }

      if (cancelled) return;

      // Evento it_open
      registrarEvento("it_open", {
        metadata_json: { rota: sessao.rota },
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, usuario, enfileirar, registrarEvento]);

  // ── fechar sessão / page_leave ao desmontar ou esconder/sair ──
  const flushPageLeave = useCallback(() => {
    const pag = paginaAtualRef.current;
    const inicio = inicioPaginaRef.current;
    if (pag != null && inicio != null) {
      const duracao_ms = Date.now() - inicio;
      registrarEvento("page_leave", { pagina: pag, duracao_ms });
      paginaAtualRef.current = null;
      inicioPaginaRef.current = null;
    }
  }, [registrarEvento]);

  const fecharSessao = useCallback(() => {
    flushPageLeave();
    const sessao = sessaoRef.current;
    if (!sessao) return;
    const duracao_total_ms = Date.now() - inicioSessaoRef.current;
    registrarEvento("it_close", { duracao_ms: duracao_total_ms });
    // tentar atualizar a sessão (best-effort)
    void updateItSessaoFechamento(sessao.id, duracao_total_ms).catch(() => {
      try {
        enfileirar("it_sessao_close", {
          sessao_id: sessao.id,
          duracao_total_ms,
        });
      } catch {
        /* ignore */
      }
    });
    limparSessaoPersistida(slug);
    sessaoRef.current = null;
  }, [flushPageLeave, registrarEvento, enfileirar, slug]);

  // listeners + cleanup
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushPageLeave();
      }
    };
    const onPageHide = () => {
      // tenta sendBeacon como REFORÇO (não é a única camada — fila já gravou)
      try {
        const sessao = sessaoRef.current;
        if (
          sessao &&
          typeof navigator !== "undefined" &&
          typeof navigator.sendBeacon === "function"
        ) {
          const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/it_consulta_eventos`;
          const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          if (url && apikey) {
            const evento: EventoIt = {
              sessao_id: sessao.id,
              documento: sessao.documento,
              tipo_evento: "it_close",
              contexto: contextoRef.current,
              created_at: nowIso(),
              duracao_ms: Date.now() - inicioSessaoRef.current,
              metadata_json: { __via: "sendBeacon" },
            };
            const blob = new Blob([JSON.stringify(evento)], {
              type: "application/json",
            });
            // sendBeacon não suporta headers; será aceito anonimamente?
            // Mantemos como reforço — sucesso não é garantido em RLS.
            navigator.sendBeacon(`${url}?apikey=${apikey}`, blob);
          }
        }
      } catch {
        /* ignore */
      }
      fecharSessao();
    };
    const onBeforeUnload = () => {
      fecharSessao();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // cleanup do componente — caminho normal SPA
      fecharSessao();
    };
  }, [flushPageLeave, fecharSessao]);

  // ── API pública ──
  const trackPageView = useCallback(
    (pagina: number) => {
      // primeiro fecha a página anterior (se houver)
      if (
        paginaAtualRef.current != null &&
        paginaAtualRef.current !== pagina &&
        inicioPaginaRef.current != null
      ) {
        const duracao_ms = Date.now() - inicioPaginaRef.current;
        registrarEvento("page_leave", {
          pagina: paginaAtualRef.current,
          duracao_ms,
        });
      }
      // abre a nova
      paginaAtualRef.current = pagina;
      inicioPaginaRef.current = Date.now();
      registrarEvento("page_view", { pagina });
    },
    [registrarEvento],
  );

  const trackEvento = useCallback<ItTelemetriaApi["trackEvento"]>(
    (tipo, extras) => registrarEvento(tipo, extras),
    [registrarEvento],
  );

  return { trackEvento, trackPageView };
}
