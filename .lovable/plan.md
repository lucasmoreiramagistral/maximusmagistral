

# Plano final (blindado) — Verso na /gestao/checklists

Plano revisado uma última vez. Furos zerados. Inclui SQL de garantia caso o RLS das tabelas de edição não cubra a role `gestao`.

## SQL — antes do código (você cola no SQL Editor)

Não tenho acesso direto ao banco pra confirmar policies. Como o operador hoje só **insere** em `ptp_janelas_edicoes` / `limpeza_turnos_edicoes` (e nunca lê), provavelmente não existe policy de SELECT. A gestão precisa ler. Vou te mandar uma migration enxuta no próximo turno com:

```sql
-- Garante SELECT para qualquer authenticated nas tabelas de auditoria do verso.
-- (a UI já é gateada por useGuard("gestao") no front)
ALTER TABLE public.ptp_janelas_edicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.limpeza_turnos_edicoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ptp_janelas_edicoes_select_authenticated" ON public.ptp_janelas_edicoes;
CREATE POLICY "ptp_janelas_edicoes_select_authenticated"
  ON public.ptp_janelas_edicoes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "limpeza_turnos_edicoes_select_authenticated" ON public.limpeza_turnos_edicoes;
CREATE POLICY "limpeza_turnos_edicoes_select_authenticated"
  ON public.limpeza_turnos_edicoes FOR SELECT TO authenticated USING (true);
```

Se as policies já existirem, o `DROP IF EXISTS` + `CREATE` é idempotente. Você confirma e eu sigo.

## Código (depois do SQL)

### Arquivos novos (6)

- **`src/lib/verso/aplicabilidade.ts`** — `temVerso(folha)` (Linha 3 + Enchedora 3) e `extrairFolhasDiaKeysComVerso(folhas)` com dedup por `Set`.
- **`src/lib/verso/resumo.ts`** — `calcularResumoVerso({ janelas, turnos })` puro, baseado **só em `status`** (nunca presença de assinatura). Saída:
  - `ptp: { registradas, comOcorrencia, semOcorrencia, naoRodou, rascunho }`
  - `limpeza: { dia, noite, temItemNaoRealizado }`
  - `saude: "completo" | "atencao" | "parcial" | "nao_iniciado"`
- **`src/hooks/use-versos-dos-dias.ts`** — `useVersosDosDiasRemote(folhaDiaKeys[])`: 2 queries totais (`.in("folha_dia_key", keys)` em `ptp_janelas` e `limpeza_turnos`), retorna `Map<folhaDiaKey, ResumoVerso>`. Refetch on mount + `visibilitychange` debounced 500ms. Sem realtime.
- **`src/hooks/use-edicoes-verso.ts`** — Lazy: `enabled` flag. Só dispara quando dialog abre.
- **`src/components/verso-dia-resumo-badges.tsx`** — Renderiza só se `temVerso(folha)`. Tooltip explicando ciclo 06h→06h. Cores: verde / âmbar / cinza / vermelho. Quebra em coluna em <768px.
- **`src/components/verso-dia-detalhe.tsx`** — Read-only. **Fetch direto** via `fetchPtpJanelas`/`fetchLimpezaTurnos` (sem merge com defaults). Itera `PTP_JANELAS` e `TURNOS_ATIVOS_LIMPEZA` fazendo lookup; ausente = "Não registrada"/"Sem registro do turno" (cinza). Mostra assinaturas como `<img>` informativo. Botão "Histórico de edições" abre Dialog com `useEdicoesVerso` lazy.

### Arquivos editados (5)

- **`src/lib/checklist/filtros.ts`** — adiciona `estadoVerso?: "com_verso" | "pendente" | "ocorrencias" | "validado"`. `filtrarFolhas` ganha 4º parâmetro `resumosVerso?: Map<string, ResumoVerso>`. Folhas sem verso passam direto, exceto se filtro = `com_verso` (excluídas). Atualiza `filtrosAtivos`.
- **`src/components/checklist-dia-detalhe.tsx`** — `ChecklistDiaResumoCard` ganha prop opcional `versoResumo?: ResumoVerso` e renderiza `<VersoDiaResumoBadges>` abaixo da grade dos 3 momentos.
- **`src/routes/gestao.checklists.tsx`** — deriva `folhaDiaKeys` via `extrairFolhasDiaKeysComVerso`, chama `useVersosDosDiasRemote`, passa `resumos` pro `filtrarFolhas` e injeta `versoResumo` no card.
- **`src/routes/gestao.filtros.tsx`** — UI do select "Estado do verso" (5 opções: Todos · Apenas folhas com verso · Verso pendente · Verso com ocorrências · Verso 100% validado).
- **`src/routes/gestao.visualizar.dia.$folhaKey.tsx`** — após `<ChecklistDiaDetalhe />` e antes de `<ObservacoesVersoConsolidado />`, renderiza `{temVerso(folha) && <VersoDiaDetalhe folhaDiaKey={buildFolhaDiaKey(...)} dataOperacao={folha.contexto.data} />}`. `folhaDiaKey` deriva de `folha.contexto` (compatível com URL legada de 5 partes).

### O que NÃO faço

- ❌ Realtime websocket (refetch on focus resolve).
- ❌ Mexer em `usePtpJanelas`/`useLimpezaTurnos` (corretos pro operador, mesclam defaults).
- ❌ Edição via gestão (read-only é princípio).
- ❌ Tocar no Excel (TODO já documentado).
- ❌ Remover `<ObservacoesVersoConsolidado>` (continua útil como timeline).

## Critérios de aceitação (12)

1. Folha Linha 1 → sem badge, ignora filtro de verso.
2. Linha 3/Enchedora 3 sem registros → cinza "Verso não iniciado" (não "12 pendentes").
3. 12 janelas final + 2 turnos `validado` + 0 itens `nao_realizado` → verde "Verso completo".
4. ≥1 PTP `houve_ocorrencia` ou ≥1 item `nao_realizado` → âmbar "Atenção".
5. Filtro "Apenas folhas com verso" reduz lista a Linha 3/Enchedora 3.
6. Filtro "Verso 100% validado" lista só dias completos.
7. Filtro "Verso com ocorrências" só âmbar.
8. Detalhe mostra grade fixa J01–J12 com lookup; ausente = "Não registrada".
9. Histórico só consulta banco quando dialog abre.
10. Voltar pra `/gestao/checklists` da aba refaz fetch (debounced 500ms).
11. **Performance: 2 queries SQL totais** para a listagem, qualquer N de folhas.
12. URL legada `folhaKey` 5 partes funciona — `folhaDiaKey` deriva de `folha.contexto`.

## Ordem de execução

1. Eu te mando a SQL completa no próximo turno.
2. Você cola no SQL Editor e confirma.
3. Eu implemento os 6 arquivos novos + 5 edições.
4. Você testa: abre `/gestao/checklists` em dia da Linha 3 com PTP/limpeza preenchidos → vê badges → filtra "Verso com ocorrências" → abre detalhe do dia → vê grade J01–J12 + 2 turnos com assinaturas → clica "Histórico" e vê edições.

