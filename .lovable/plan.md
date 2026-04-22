

# Plano final — Telemetria de IT + Painel de Gestão

Aprovado. Incorporo a observação sobre `sendBeacon`: tratado como **camada de reforço**, nunca como mecanismo único.

---

## Captura de `page_leave` / `it_close` — defesa em profundidade

Ordem de prioridade (todas ativas, redundantes de propósito):

1. **`visibilitychange` → `hidden`** — primeiro gatilho confiável quando o operador troca de aba/app. Faz `flushPageLeave()` síncrono no `localStorage` (fila offline) e tenta `POST` direto.
2. **`pagehide`** — dispara antes do `unload` em browsers modernos e em WebView Android (Capacitor). Mesma rotina de flush.
3. **`beforeunload`** — fallback pra browsers antigos.
4. **Cleanup do `useEffect`** — captura navegação SPA interna (trocar de IT, voltar pra home do operador). Esse é o caminho **principal** em uso normal.
5. **`navigator.sendBeacon`** — reforço dentro dos handlers acima quando disponível e quando o payload couber. Se falhar ou não existir (WebView antigo), a fila offline já gravou o evento em `localStorage` e o próximo boot drena.

Resultado: mesmo se `sendBeacon` "peidar" no APK, o evento está garantido em `localStorage` antes do handler retornar — `use-connection-status` envia na próxima abertura online.

---

## Fase 1 — Banco

**Migration:** `supabase/migrations/<ts>_it_telemetria.sql`

- `public.it_consulta_sessoes` (id, user_id, operador_nome, perfil, equipe, turno, documento CHECK in('it002','it005'), rota, iniciado_em, encerrado_em, duracao_total_ms, created_at)
- `public.it_consulta_eventos` (+ `metadata_json jsonb`, CHECK em `tipo_evento` com os 14 tipos)
- Índices: documento, user_id, sessao_id, tipo_evento, pagina, created_at
- RLS: INSERT/UPDATE = `auth.uid() = user_id`; SELECT = `is_gestao(auth.uid())`
- View `public.it_dificuldade_paginas`:
  ```text
  score = round(100 * (
    0.30 * tempo_medio_norm
  + 0.25 * zooms_por_view_norm
  + 0.20 * retornos_por_view_norm
  + 0.15 * buscas_que_levaram_aqui_norm
  + 0.10 * retries_por_view_norm))
  ```
  Normalização por `MAX() OVER (PARTITION BY documento)`.

## Fase 2 — Telemetria no operador

**Novos:**
- `src/lib/it/telemetria.ts` — tipos, sanitizador de busca (trim, lowercase, ≥2 chars, max 100), debounce 600 ms, gerador de UUID
- `src/lib/it/supabase-analytics.ts` — `iniciarSessao`, `fecharSessao`, `registrarEvento` (fire-and-forget; em falha → `enfileirar("it_evento", ...)`)
- `src/hooks/use-it-telemetria.ts` — sessão única persistida em `sessionStorage`, page tracking, listeners `visibilitychange`/`pagehide`/`beforeunload` + cleanup, `sendBeacon` só como reforço

**Editado: `src/hooks/use-connection-status.ts`**
- `FilaItemTipo` += `"it_evento" | "it_sessao_close"`
- `processarItem` ganha 2 branches

**Editado: `src/routes/operador.it.$doc.tsx`**
- `useItTelemetria(slug, totalPaginas)` no topo de `Visualizador`
- Eventos: `page_view`, `page_leave`, `index_open`, `index_click`, `index_search` (debounced), `index_search_result_click`, `zoom_in/out/reset`, `image_retry`, `image_error`, `cache_mode` (só em mudança real via `useRef`)
- Tudo em `try/catch` silencioso

## Fase 3 — Painel da gestão

**Nova rota:** `src/routes/gestao.it-analytics.tsx`

```text
┌─ Banner: "Esta análise serve para identificar pontos       ┐
│  que precisam de reforço de treinamento, não para           │
│  avaliar operadores individualmente."                       │
├─ Filtros: período (Hoje/7d/30d/custom), documento,          ┤
│           equipe, turno                                     │
├─ KPIs: sessões · consultas · buscas · zooms · retries       ┤
├─ Ranking: ITs mais consultadas                              ┤
├─ Ranking: páginas mais consultadas (por IT)                 ┤
├─ Ranking: termos mais buscados                              ┤
├─ Score de dificuldade (top 10) — fórmula expandível         ┤
├─ Diagnóstico: tempo médio · zoom · retry por página         ┤
├─ Toggle "Ver por operador" (oculto por default)             ┤
└─ Segmentação: equipe × turno                                ┘
```

**Editado: `src/routes/gestao.index.tsx`**
- 5º `BotaoLink` → `/gestao/it-analytics`, ícone `BookOpen`, descrição "Inteligência de uso das ITs · pontos para reforço de treinamento"

---

## Arquivos tocados

**Novos (5):** migration SQL, `lib/it/telemetria.ts`, `lib/it/supabase-analytics.ts`, `hooks/use-it-telemetria.ts`, `routes/gestao.it-analytics.tsx`

**Editados (3):** `routes/operador.it.$doc.tsx`, `routes/gestao.index.tsx`, `hooks/use-connection-status.ts`

**Não tocados:** checklist, anomalias, PTP, limpeza, relatório, manifest, storage, viewer logic.

---

## Critérios de aceitação

1. Viewer de IT funciona idêntico
2. Sessão única por consulta (sem duplicar em remontagens)
3. Cada navegação/zoom/busca/erro vira evento
4. Telemetria nunca bloqueia UI nem mostra erro
5. Eventos sobem após reconexão (fila offline reusada)
6. `/gestao/it-analytics` mostra KPIs, rankings, score, segmentação
7. Filtros funcionam (período/documento/equipe/turno)
8. Tom não-punitivo explícito; filtro por operador atrás de toggle
9. RLS impede operador de ler analytics; só `is_gestao()` lê
10. Termos de busca sanitizados e debounced
11. `page_leave` registrado mesmo no APK (defesa em profundidade: visibilitychange + pagehide + beforeunload + cleanup; sendBeacon só como reforço)
12. `cache_mode` só em mudança real
13. Score visível com fórmula explicável

