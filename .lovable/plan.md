

# Plano aprovado — execução

Vou executar o plano blindado em 3 fases. A SQL eu te mando aqui no chat pra você colar no SQL Editor do Supabase, e o código eu implemento direto nos arquivos.

## Fase 1 — SQL pra você colar (eu mando no chat)

Migration única: `<ts>_it_blindagem_rastreabilidade.sql`

Inclui:
- Função `canonizar_nome_operador(text)` immutable
- Colunas em `it_consulta_sessoes`: `ultimo_evento_em`, `device_id`, `operador_nome_canonico` (GENERATED), `ip_address`, `user_agent`
- Colunas em `it_consulta_eventos`: `device_id`, `operador_nome_canonico` (GENERATED)
- Trigger `tg_it_evento_atualiza_sessao` — atualiza `ultimo_evento_em` e fecha sessão em `it_close`
- Trigger `tg_it_sessao_detecta_troca` — detecta troca de operador no mesmo device e grava `identidade_trocada_servidor`
- View `it_consulta_sessoes_efetivas` com `duracao_efetiva_ms` e `ativa_agora`
- View `it_alertas_identidade` (multi-device + trocas rápidas)
- Índices em `(operador_nome_canonico, iniciado_em)` e `(device_id, iniciado_em)`
- `GRANT SELECT` das views pra `authenticated` (RLS herdada via security_invoker)

## Fase 2 — Código (eu implemento)

**Novos:**
- `src/lib/it/identidade.ts` — `obterOuCriarDeviceId`, `canonizarNomeOperador`, `lerIdentidadeDevice`, `salvarIdentidadeDevice`, `decidirModoIdentidade`, `registrarUltimoHeartbeat`, `lerUltimoHeartbeat`
- `src/hooks/use-exigir-identidade-it.ts` — gate reutilizável retornando `{ identidade, modal, pronto }`
- `src/components/it-identificacao-dialog.tsx` — modos completo + leve com guardas anti-tap (800ms / 1.5s)

**Editados:**
- `src/lib/it/telemetria.ts` — adiciona ao union `TipoEventoIt`: `identidade_declarada`, `identidade_confirmada`, `identidade_trocada`, `identidade_trocada_servidor`, `identidade_expirada`, `heartbeat`
- `src/hooks/use-it-telemetria.ts` — recebe `{ nomeCompleto, nomeCanonico, deviceId }`, grava `device_id` em sessão e eventos, heartbeat 60s com flag de interação, reuso de sessão por slug+canonico+device com guarda de 4h + 30min inatividade, captura `user_agent` no insert da sessão
- `src/routes/operador.it.$doc.tsx` — usa `useExigirIdentidadeIt(slug)` antes do `<Visualizador />`, passa identidade confirmada
- `src/routes/gestao.it-analytics.tsx` — lê `it_consulta_sessoes_efetivas`, KPI "Em consulta agora", card vermelho "⚠ Alertas de identidade" no topo (consome `it_alertas_identidade`), agrupa "Por operador" pelo `operador_nome_canonico` com sub-linha de variantes e badge multi-device, novo card "Trocas de operador (24h)"

## Fase 3 — Verificação (você roda 24h depois)

3 queries de validação:
1. `pct_sem_fechamento` — esperado < 5%
2. Eventos `identidade_trocada%` — trilha de auditoria
3. `SELECT * FROM it_alertas_identidade` — alertas ativos

## Detalhes técnicos importantes

- **Canonização espelhada**: a função SQL e o helper TS usam exatamente o mesmo algoritmo (trim → colapsa espaços → remove acentos → uppercase). A coluna no banco é `GENERATED ALWAYS AS STORED` — impossível burlar via DevTools.
- **Auditoria redundante**: troca de operador gera dois registros — `identidade_trocada` (client, otimista) + `identidade_trocada_servidor` (trigger, garantido). Mesmo offline a auditoria fica.
- **Realtime já cobre**: `useItAnalyticsRealtime` existente (já lê `it_consulta_eventos` e `it_consulta_sessoes`) propaga alertas e trocas pro painel automaticamente.
- **Gate centralizado**: hook `useExigirIdentidadeIt` evita esquecer o modal em rotas IT futuras.

## Ordem de execução

1. Eu te mando a SQL completa no próximo turno
2. Você cola no SQL Editor e confirma
3. Eu implemento todos os arquivos de código no turno seguinte
4. Você testa: abre IT no operador → modal aparece → digita "Lucas Moreira" → confirma → vai pro painel e vê o nome real

## Critérios de aceitação

1. `pct_sem_fechamento` < 5% em 24h
2. Toda sessão tem `device_id`, `operador_nome_canonico` (do banco), `user_agent`
3. Modal completo: "Continuar" só ativa após 800ms de input válido
4. Modal leve: "Sim, sou eu" só ativa após 1.5s
5. Troca de operador gera 2 registros (client + servidor)
6. `Lucas`, `LUCAS`, `lucas ` agrupam sob `LUCAS`
7. Operador da equipe Karolainny aparece com nome real
8. Heartbeat 60s + corte 5min reflete atividade real
9. Card "⚠ Alertas de identidade" aparece quando há multi-device ou ≥3 trocas/h
10. Card "Trocas de operador (24h)" mostra trilha auditável
11. RLS preservada — operador não lê analytics

