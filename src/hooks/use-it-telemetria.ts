// ============================================================
// Hook de telemetria do viewer de IT.
//
// Modelo atual (login próprio do operador):
// - Identidade vem 100% do usuário autenticado (Supabase Auth + profile).
//   `usuario.userId` é o `auth.users.id` (ver use-storage.ts: row.id).
//   `usuario.nome` vem de `profiles.nome`.
// - Não há mais modal de identidade, nem nome digitado, nem eventos
//   `identidade_declarada` / `identidade_confirmada` / `identidade_trocada`.
// - `device_id` continua sendo gravado (dado técnico para auditoria
//   offline/queue e rastreio de erro), mas NÃO é identidade primária.
// - Cria UMA sessão por consulta (persistida em sessionStorage).
// - Reusa sessão se: mesmo slug + mesmo user_id + < 4h + último heartbeat < 30min.
// - Heartbeat 60s (visibilidade + interação recente) → corte de 5min no painel.
// - Captura page_leave / it_close de forma defensiva.
// ============================================================

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useUsuario } from "@/hooks/use-storage";
import { useOfflineQueue } from "@/hooks/use-connection-status";
import { calcularDataOperacional } from "@/lib/operacao/data-operacional";
import { useTurnoAtivoDoDia } from "@/lib/operacao/turno-ativo";
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
  type SessaoIt,
  type TipoEventoIt,
} from "@/lib/it/telemetria";
import type { ItDocSlug } from "@/lib/it/types";
import {
  INATIVIDADE_LEVE_MS,
  JANELA_LEVE_MS,
  canonizarNomeOperador,
  obterOuCriarDeviceId,
  registrarUltimoHeartbeat,
} from "@/lib/it/identidade";
import {
  temUserIdValido,
  validarContextoTelemetria,
} from "@/lib/it/telemetria-validacao";

const HEARTBEAT_MS = 60_000; // 60s
const INTERACAO_MAX_AGE_MS = 60_000; // só envia heartbeat se houve interação no último 1min

function chaveSessaoStorage(slug: ItDocSlug): string {
  return `it-telemetria:sessao:${slug}`;
}

interface SessaoPersistida {
  id: string;
  iniciado_em: string;
  documento: "it002" | "it005";
  rota: string;
  contexto: ContextoOperadorIt;
  device_id: string;
  user_id: string;
  ultimo_heartbeat: number;
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

export interface UseItTelemetriaParams {
  slug: ItDocSlug;
}

export function useItTelemetria(
  paramsOrSlug: ItDocSlug | UseItTelemetriaParams,
): ItTelemetriaApi {
  const params: UseItTelemetriaParams =
    typeof paramsOrSlug === "string" ? { slug: paramsOrSlug } : paramsOrSlug;
  const { slug } = params;

  const usuario = useUsuario();
  const { enfileirar } = useOfflineQueue();
  // Usa o Turno Ativo do dia (cobre extra/cobertura), não o padrão do cadastro.
  const turnoAtivo = useTurnoAtivoDoDia(usuario);

  const sessaoRef = useRef<SessaoIt | null>(null);
  const paginaAtualRef = useRef<number | null>(null);
  const inicioPaginaRef = useRef<number | null>(null);
  const inicioSessaoRef = useRef<number>(Date.now());
  const ultimaInteracaoRef = useRef<number>(Date.now());
  const deviceIdRef = useRef<string | null>(null);
  const userAgentRef = useRef<string | null>(
    typeof navigator !== "undefined" ? navigator.userAgent : null,
  );

  // Inicializa device_id (dado técnico apenas, não-identidade) na montagem.
  useEffect(() => {
    deviceIdRef.current = obterOuCriarDeviceId();
  }, []);

  const contextoRef = useRef<ContextoOperadorIt>({
    user_id: null,
    operador_nome: null,
    perfil: null,
    equipe: null,
    turno: null,
    data_operacional: null,
  });

  // Contexto = sempre derivado do usuário autenticado.
  // Não há mais nome digitado nem confirmação manual.
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

  const registrarEvento = useCallback(
    (tipo: TipoEventoIt, extras?: Partial<EventoIt>) => {
      try {
        const sessao = sessaoRef.current;
        if (!sessao) return;
        // Guarda de integridade: sem user_id válido, não emite evento.
        // Isso evita linhas órfãs no banco e mantém precisão da Inteligência das ITs.
        if (!temUserIdValido(contextoRef.current)) {
          validarContextoTelemetria(
            contextoRef.current,
            `trackEvento:${tipo}`,
          );
          return;
        }
        const evento: EventoIt = {
          sessao_id: sessao.id,
          documento: sessao.documento,
          tipo_evento: tipo,
          contexto: contextoRef.current,
          created_at: nowIso(),
          ...extras,
        };
        const deviceId = deviceIdRef.current;
        void insertItEvento(evento, { deviceId }).catch(() => {
          try {
            enfileirar("it_evento", { ...evento, device_id: deviceId } as any);
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

  // ── abrir/reusar sessão (uma vez por slug, assim que o usuário estiver carregado) ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!usuario?.userId) return; // espera o login carregar

    let cancelled = false;
    const deviceId = deviceIdRef.current ?? obterOuCriarDeviceId();
    deviceIdRef.current = deviceId;
    const userId = usuario.userId;
    const userAgent = userAgentRef.current;

    (async () => {
      const persistida = lerSessaoPersistida(slug);
      const agora = Date.now();
      const podeReusar =
        persistida != null &&
        persistida.user_id === userId &&
        agora - Date.parse(persistida.iniciado_em) < JANELA_LEVE_MS &&
        agora - persistida.ultimo_heartbeat < INATIVIDADE_LEVE_MS;

      if (podeReusar && persistida) {
        sessaoRef.current = {
          id: persistida.id,
          documento: persistida.documento,
          rota: persistida.rota,
          iniciado_em: persistida.iniciado_em,
          contexto: persistida.contexto,
        };
        inicioSessaoRef.current = Date.parse(persistida.iniciado_em) || Date.now();
        return;
      }

      // Se havia sessão antiga (de outro user, ou expirada), fecha-a antes de criar nova.
      if (persistida) {
        try {
          await updateItSessaoFechamento(
            persistida.id,
            Math.max(
              0,
              persistida.ultimo_heartbeat - Date.parse(persistida.iniciado_em),
            ),
          );
        } catch {
          /* ignore */
        }
        limparSessaoPersistida(slug);
      }

      const documento = slugParaDocumento(slug);
      const sessao: SessaoIt = {
        id: gerarUuid(),
        documento,
        rota: window.location.pathname,
        iniciado_em: nowIso(),
        contexto: contextoRef.current,
      };
      // Validação de integridade — embora o effect só rode com userId presente,
      // logamos qualquer divergência para auditoria (ex.: profile sem nome).
      validarContextoTelemetria(sessao.contexto, "abrir-sessao");
      sessaoRef.current = sessao;
      inicioSessaoRef.current = Date.now();

      escreverSessaoPersistida(slug, {
        id: sessao.id,
        iniciado_em: sessao.iniciado_em,
        documento: sessao.documento,
        rota: sessao.rota,
        contexto: sessao.contexto,
        device_id: deviceId,
        user_id: userId,
        ultimo_heartbeat: Date.now(),
      });

      try {
        await insertItSessao(sessao, { deviceId, userAgent });
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

      registrarEvento("it_open", { metadata_json: { rota: sessao.rota } });
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, usuario?.userId, enfileirar, registrarEvento]);

  // ── page_leave / it_close ──
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

  // ── heartbeat + tracking de interação ──
  useEffect(() => {
    if (typeof window === "undefined") return;

    const marcarInteracao = () => {
      ultimaInteracaoRef.current = Date.now();
    };
    window.addEventListener("touchstart", marcarInteracao, { passive: true });
    window.addEventListener("click", marcarInteracao);
    window.addEventListener("scroll", marcarInteracao, { passive: true });
    window.addEventListener("keydown", marcarInteracao);

    const interval = window.setInterval(() => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimaInteracaoRef.current > INTERACAO_MAX_AGE_MS) return;
      registrarUltimoHeartbeat(Date.now());
      const persistida = lerSessaoPersistida(slug);
      if (persistida) {
        escreverSessaoPersistida(slug, {
          ...persistida,
          ultimo_heartbeat: Date.now(),
        });
      }
      registrarEvento("heartbeat");
    }, HEARTBEAT_MS);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("touchstart", marcarInteracao);
      window.removeEventListener("click", marcarInteracao);
      window.removeEventListener("scroll", marcarInteracao);
      window.removeEventListener("keydown", marcarInteracao);
    };
  }, [slug, registrarEvento]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushPageLeave();
      }
    };
    const onPageHide = () => {
      try {
        const sessao = sessaoRef.current;
        if (
          sessao &&
          typeof navigator !== "undefined" &&
          typeof navigator.sendBeacon === "function" &&
          // Não beacon sem user_id — evita evento órfão.
          temUserIdValido(contextoRef.current)
        ) {
          const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/it_consulta_eventos`;
          const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          if (url && apikey) {
            const evento = {
              sessao_id: sessao.id,
              documento: sessao.documento,
              tipo_evento: "it_close",
              user_id: contextoRef.current.user_id,
              operador_nome: contextoRef.current.operador_nome,
              perfil: contextoRef.current.perfil,
              equipe: contextoRef.current.equipe,
              turno: contextoRef.current.turno,
              data_operacional: contextoRef.current.data_operacional,
              created_at: nowIso(),
              duracao_ms: Date.now() - inicioSessaoRef.current,
              device_id: deviceIdRef.current,
              metadata_json: { __via: "sendBeacon" },
            };
            const blob = new Blob([JSON.stringify(evento)], {
              type: "application/json",
            });
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
      fecharSessao();
    };
  }, [flushPageLeave, fecharSessao]);

  const trackPageView = useCallback(
    (pagina: number) => {
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

  // Hint para canonização — manter import vivo (canonização ainda é usada em
  // outros pontos do app, ex.: cadastro de ata e fallback de agregação).
  void canonizarNomeOperador;

  return useMemo(
    () => ({ trackEvento, trackPageView }),
    [trackEvento, trackPageView],
  );
}
