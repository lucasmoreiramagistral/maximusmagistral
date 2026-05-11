# Folha por operador (Limpeza, PTP e Checklist da frente)

## Problema

Hoje a chave da folha do verso é `Data + Linha + Máquina` e a do checklist da frente é `Data + Turno + Linha + Máquina`. Como Vitor e Valderlan são da mesma equipe **12x36 Noite**, **mas se alternam** (1 operador fixo por noite), o Valderlan abre a tela e vê o que o Vitor preencheu na noite anterior como se fosse pendência/conclusão dele.

Regra correta combinada com você:
- **1 operador por turno** (alternância 12x36 entre 4 equipes).
- Folha = `Data + Máquina + Operador`.
- Tela do operador mostra **a folha mais recente do próprio operador** naquele turno — nunca a do colega.

## Mudanças

### 1. Chave da folha (fonte única)

`src/lib/operacao/data-operacional.ts`
- `buildFolhaDiaKey(data, linha, maquina, operadorId)` passa a incluir `operadorId` no formato
  `YYYY-MM-DD__Linha 3__Enchedora 3__op:<userId>`.
- Adicionar `parseFolhaDiaKey(key)` para extrair os 4 campos (gestão precisa).
- Adicionar `buildFolhaDiaKeyLegado(data, linha, maquina)` para **leitura** de registros antigos sem operador (compatibilidade).

`src/lib/checklist/supabase-storage.ts`
- `buildFolhaKey(ctx)` passa a incluir `ctx.operadorId` no final → `data__turno__linha__maquina__op:<id>`.
- Manter `buildFolhaKeyLegado` já existente; adicionar 2ª variante sem operador para casamento de registros antigos.

### 2. Propagar operadorId em todos os call sites

Telas do operador (já têm `usuario.userId`):
- `operador.verso.limpeza.tsx`, `operador.verso.ptp.tsx`, `operador.verso.ptp.$janelaCodigo.tsx`
- `operador.validacao-lider.tsx`, `operador.resumo.tsx`, `operador.index.tsx`

Hooks:
- `use-limpeza-turnos.ts`, `use-ptp-janelas.ts`, `use-versos-dos-dias.ts`, `use-edicoes-verso.ts`, `use-connection-status.ts` — recebem `folhaDiaKey` pronta, sem mudança de assinatura, mas o caller passa a chave nova.

Telas de gestão (precisam do `operadorId` da folha-alvo, que já vem de `folha.contexto` ou de `c.identidade.operadorId`):
- `gestao.checklists.tsx`, `gestao.visualizar.dia.$folhaKey.tsx`, `verso/aplicabilidade.ts`, `checklist/filtros.ts`, `checklist/excel-export.ts`.

### 3. Tela do operador: "minha folha mais recente"

Na entrada de `/operador/verso/limpeza` e `/operador/verso/ptp`:
- Calcula `folhaDiaKey` SEMPRE com `usuario.userId` + `dataOperacional` do turno ativo.
- Se não existem registros para essa chave **mas existem registros do MESMO operador em data anterior**, exibir banner "Última folha sua: 10/05" + botão "Abrir histórico" → leva a `/operador/historico` filtrado por ele.
- Folhas de outros operadores **nunca** aparecem nessas telas.

### 4. Compatibilidade com dados antigos

`fetchPtpJanelas` e `fetchLimpezaTurnos` em `verso/supabase-storage.ts`:
- Buscar com a chave nova; se vier vazio, fazer 2ª busca com `buildFolhaDiaKeyLegado` e, se achar, **migrar lazy**: re-salvar com a chave nova marcando `operador_id = <userId>` (assumindo que o dono seja quem preencheu — usar coluna `criado_por` se existir; caso contrário, deixar como histórico read-only sem migrar).
- Decisão segura: **não migrar automaticamente**. Apenas listar registros legados na tela de gestão sob "Sem operador identificado" para a chefia decidir.

### 5. Gestão / visualização

`gestao.visualizar.dia.$folhaKey.tsx`:
- A rota recebe a `folhaKey` (com operador) → carrega só essa folha. Sem mudança de UX.
- `gestao.checklists.tsx`: a listagem por dia agora pode mostrar **N folhas** por máquina/dia (uma por operador). Adicionar coluna "Operador" e agrupar visualmente por máquina → operador.

### 6. Validação do líder

`operador.validacao-lider.tsx`:
- Usa a `folhaDiaKey` do operador validado (vem do contexto da folha sendo validada). Sem mudança de fluxo, só garantir que a chave passada inclui o `operadorId` correto (não o `userId` do líder).

## Detalhes técnicos

- **DB**: nenhuma alteração de schema. `folha_dia_key` e `folha_key` continuam sendo `text`. Só muda o formato da string.
- **`ContextoChecklist`**: já tem `operadorId` em `identidade`? Se não, adicionar campo `operadorId: string` e preencher no momento da criação do rascunho.
- **Hash de dados antigos**: registros gravados sem `op:` continuam buscáveis via `buildFolhaDiaKeyLegado` em telas de gestão (read-only).
- **`useTurnoAtivoDoDia`**: já usado nas telas; nada muda.
- **Cache `WeakMap` em turno-ativo.ts**: não afetado.

## Arquivos editados

```
src/lib/operacao/data-operacional.ts
src/lib/checklist/supabase-storage.ts
src/lib/checklist/types.ts                      (campo operadorId em ContextoChecklist se faltar)
src/lib/verso/aplicabilidade.ts
src/lib/verso/supabase-storage.ts               (fallback legado)
src/lib/checklist/filtros.ts
src/lib/checklist/excel-export.ts
src/routes/operador.verso.limpeza.tsx
src/routes/operador.verso.ptp.tsx
src/routes/operador.verso.ptp.$janelaCodigo.tsx
src/routes/operador.validacao-lider.tsx
src/routes/operador.resumo.tsx
src/routes/operador.index.tsx
src/routes/gestao.visualizar.dia.$folhaKey.tsx
src/routes/gestao.checklists.tsx
```

## Fora de escopo

- Migração massiva de registros antigos (decidir com você depois).
- Mudança no fluxo de "extra/cobertura": continua funcionando porque a chave usa o `userId` real, não o turno padrão.
- Política de RLS (já isola por usuário; não muda).
