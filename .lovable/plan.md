

# Diagnóstico

A view **`public.it_dificuldade_paginas`** não foi criada no banco. As tabelas `it_consulta_sessoes` e `it_consulta_eventos` estão lá e populando normalmente (vimos 573+ eventos), mas a terceira query do `Promise.all` no painel da gestão explode com 404 (`PGRST205`), cai no catch genérico e mostra "Não foi possível carregar os dados" + tudo zerado.

Além disso, tem 2 reforços técnicos que o Serjão levantou que vou aplicar junto:

1. **Fechamento idempotente de sessão**: hoje o `closeItSessao` faz UPDATE por `id` puro. Com `visibilitychange` + `pagehide` + cleanup + sendBeacon, dá pra disparar 3-4 vezes. Filtrar por `encerrado_em IS NULL` resolve.
2. **`user_id` sempre presente**: como o `useUsuario()` pode retornar `null` em casos raros, garantir fallback para `auth.uid()` no client antes de inserir.

---

# Plano

## 1. Migration nova — criar a view faltante

`supabase/migrations/<ts>_it_dificuldade_paginas_view.sql`

```sql
CREATE OR REPLACE VIEW public.it_dificuldade_paginas
WITH (security_invoker = on) AS
WITH metricas_pagina AS (
  SELECT
    documento,
    pagina,
    -- Tempo médio na página (page_leave traz duracao_ms)
    AVG(CASE WHEN tipo_evento = 'page_leave' THEN duracao_ms END) AS tempo_medio_ms,
    -- Contagem de visualizações (denominador dos por_view)
    COUNT(*) FILTER (WHERE tipo_evento = 'page_view') AS views,
    -- Zooms na página
    COUNT(*) FILTER (WHERE tipo_evento IN ('zoom_in','zoom_out','zoom_reset')) AS zooms,
    -- Retornos: views além da primeira por sessão
    GREATEST(
      COUNT(*) FILTER (WHERE tipo_evento = 'page_view')
      - COUNT(DISTINCT sessao_id) FILTER (WHERE tipo_evento = 'page_view'),
      0
    ) AS retornos,
    -- Buscas que levaram aqui (clique em resultado de busca com pagina_destino = pagina)
    0::bigint AS buscas_que_levaram_aqui_placeholder,
    -- Retries de imagem
    COUNT(*) FILTER (WHERE tipo_evento = 'image_retry') AS retries
  FROM public.it_consulta_eventos
  WHERE pagina IS NOT NULL
  GROUP BY documento, pagina
),
buscas_destino AS (
  SELECT documento, pagina_destino AS pagina, COUNT(*) AS buscas
  FROM public.it_consulta_eventos
  WHERE tipo_evento = 'index_search_result_click'
    AND pagina_destino IS NOT NULL
  GROUP BY documento, pagina_destino
),
combinado AS (
  SELECT
    m.documento,
    m.pagina,
    COALESCE(m.tempo_medio_ms, 0) AS tempo_medio_ms,
    m.views,
    m.zooms,
    m.retornos,
    COALESCE(b.buscas, 0) AS buscas_que_levaram_aqui,
    m.retries,
    -- Por view (guarda contra divisão por zero)
    CASE WHEN m.views > 0 THEN m.zooms::float / m.views ELSE 0 END AS zoom_por_view,
    CASE WHEN m.views > 0 THEN m.retornos::float / m.views ELSE 0 END AS retorno_por_view,
    CASE WHEN m.views > 0 THEN m.retries::float / m.views ELSE 0 END AS retry_por_view
  FROM metricas_pagina m
  LEFT JOIN buscas_destino b
    ON b.documento = m.documento AND b.pagina = m.pagina
)
SELECT
  documento,
  pagina,
  ROUND(tempo_medio_ms)::bigint AS tempo_medio_ms,
  views,
  zooms,
  retornos,
  buscas_que_levaram_aqui,
  retries,
  ROUND(100 * (
      0.30 * COALESCE(tempo_medio_ms / NULLIF(MAX(tempo_medio_ms) OVER (PARTITION BY documento), 0), 0)
    + 0.25 * COALESCE(zoom_por_view / NULLIF(MAX(zoom_por_view) OVER (PARTITION BY documento), 0), 0)
    + 0.20 * COALESCE(retorno_por_view / NULLIF(MAX(retorno_por_view) OVER (PARTITION BY documento), 0), 0)
    + 0.15 * COALESCE(buscas_que_levaram_aqui::float / NULLIF(MAX(buscas_que_levaram_aqui) OVER (PARTITION BY documento), 0), 0)
    + 0.10 * COALESCE(retry_por_view / NULLIF(MAX(retry_por_view) OVER (PARTITION BY documento), 0), 0)
  ))::int AS score
FROM combinado;

-- Permissão de leitura: só gestão
REVOKE ALL ON public.it_dificuldade_paginas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.it_dificuldade_paginas TO authenticated;
```

> O `security_invoker=on` faz a view rodar com a permissão do chamador, então a RLS de `it_consulta_eventos` (SELECT só pra `is_gestao`) já protege o conteúdo. Operador autenticado consegue chamar a view, mas não retorna nada porque não passa na RLS da tabela base.

## 2. Robustez do fechamento de sessão

**Editado: `src/lib/it/supabase-analytics.ts`**
- Em `updateItSessaoFechamento`, adicionar `.is("encerrado_em", null)` no `.eq("id", sessaoId)`. Se já fechou, vira no-op silencioso, sem race condition.

## 3. Fallback de user_id no client

**Editado: `src/hooks/use-it-telemetria.ts`**
- Antes de montar o payload da sessão/evento, se `usuario.id` vier `null`, buscar `(await supabase.auth.getUser()).data.user?.id` como fallback.
- Se ainda assim vier `null` (sem auth), aborta o registro silenciosamente — não tenta gravar evento órfão que vai bater na RLS.

## 4. Tratamento de erro mais explícito no painel

**Editado: `src/routes/gestao.it-analytics.tsx`**
- Trocar o `Promise.all` por `Promise.allSettled` para que a falha de uma query (ex: view ainda não criada num ambiente em transição) não derrube o painel inteiro. KPIs e rankings continuam aparecendo; só o card de "Score de dificuldade" mostra um aviso curto se a view falhar.

---

# Arquivos tocados

**Novo (1):** `supabase/migrations/<ts>_it_dificuldade_paginas_view.sql`

**Editados (3):**
- `src/lib/it/supabase-analytics.ts` (filtro `encerrado_em IS NULL`)
- `src/hooks/use-it-telemetria.ts` (fallback `auth.getUser()` para `user_id`)
- `src/routes/gestao.it-analytics.tsx` (`Promise.allSettled` + degradação por bloco)

**Não tocados:** tabelas existentes, RLS já aplicada, viewer do operador, fila offline, demais módulos.

---

# Critérios de aceitação

1. `/gestao/it-analytics` para de mostrar "Não foi possível carregar os dados"
2. KPIs (sessões, eventos, buscas, zooms, retries) aparecem com valores reais
3. Ranking de páginas/ITs mais consultadas aparece
4. Card "Score de dificuldade" mostra top 10 páginas com score 0–100
5. Se a view falhar isoladamente, o resto do painel continua renderizando
6. Fechamento de sessão é idempotente (sem race condition entre handlers)
7. Eventos sem `user_id` válido não são enviados (não geram lixo nem erro de RLS)
8. Operador continua sem conseguir ler analytics (RLS preservada)

