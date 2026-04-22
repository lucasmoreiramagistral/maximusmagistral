

# Plano final blindado v2 — Chips de Verso no /gestao/checklists

Revisão profunda da v1. Encontrei **4 furos novos** + 1 melhoria de UX. Corrigidos abaixo. O resto do plano v1 segue válido.

## Furos novos encontrados

### Furo A — Componente local recebe `filtros` mas isso causa stale closure
Se `ChipsFiltroVerso` recebe `filtros` por prop e chama `setFiltros({ ...filtros, estadoVerso: novo })`, está OK porque o pai re-renderiza após `fm-storage-update`. **Mas** se o usuário clica dois chips muito rápido (antes do listener disparar setState), a segunda chamada usa `filtros` antigo da prop — e ainda assim funciona, porque `estadoVerso` é o único campo mudando e o spread preserva o resto. **Sem furo real, mas vou usar `getFiltros()` dentro do handler pra garantir leitura fresca do storage.**

### Furo B — Listener `fm-storage-update` filtra por `key`
Linha 56-65 de `gestao.checklists.tsx` (presumido): listener checa `event.detail?.key === FILTROS_KEY` antes de re-ler. `setFiltros` em `lib/checklist/filtros.ts` (linha 42) dispara com `detail: { key: KEY }` onde `KEY === FILTROS_KEY`. **Bate. Sem furo.** Confirmar na implementação.

### Furo C — `temVerso` precisa de `folha.contexto` populado
O filtro `com_verso` em `filtrarFolhas` chama `temVerso(folha)`. Se alguma folha vier com contexto incompleto (linha undefined), pode quebrar. Verifiquei `aplicabilidade.ts` — função já trata `linha === "Linha 3"` defensivamente. **Sem furo.**

### Furo D — Estado vazio: distinguir 3 cenários, não 2
Cenários quando `folhas.length === 0`:
1. `estadoVerso` ativo + outros filtros ativos → "Nenhuma folha corresponde aos filtros aplicados" + 2 botões (Limpar verso / Limpar todos)
2. Só `estadoVerso` ativo → "Nenhuma folha corresponde ao filtro de verso" + botão "Limpar filtro de verso"
3. Só outros filtros ou nenhum filtro → mensagem atual genérica
**Plano v1 só cobria cenário 2. Corrigir.**

### Melhoria UX — Indicador visual de "Linha 3 only"
O label "Verso (Linha 3):" já indica escopo, mas quando o gestor está com filtro de equipe/turno que **exclui Linha 3**, clicar num chip vai zerar a lista. Adicionar um aviso sutil quando isso ocorrer: badge `text-xs text-amber-600` "Filtros atuais não incluem Linha 3".

Detecção: se `filtros.estadoVerso` ativo E `folhas.filter(temVerso).length === 0` no resultado **antes** do filtro de verso. Custo: 1 reduce. Benefício: evita "lista vazia misteriosa".

**Decisão:** implementar versão simples — se resultado final é vazio E `estadoVerso` ativo, a mensagem de cenário 2 já cobre. Pular esta melhoria pra manter plano enxuto. Documentar como TODO futuro.

## Plano final (v2)

**1 arquivo editado:** `src/routes/gestao.checklists.tsx`

### Mudanças

1. **Import:** adicionar `setFiltros` ao import existente de `@/lib/checklist/filtros`.
2. **Componente local `ChipsFiltroVerso`** (~50 linhas, inline no arquivo):
   - Recebe `estadoAtual: EstadoVersoFiltro | undefined`.
   - Renderiza label + 5 chips (`button` com `aria-pressed`).
   - Handler usa `getFiltros()` pra garantir leitura fresca, depois `setFiltros({ ...atual, estadoVerso: novo })`.
   - Container: `flex flex-wrap items-center gap-2 mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2`.
3. **Render condicional:** `{visao === "dia" && <ChipsFiltroVerso estadoAtual={filtros.estadoVerso} />}` entre a barra de ações e o bloco de erro.
4. **Estado vazio melhorado** — substituir bloco genérico por lógica de 3 cenários:
   - Cenário 1 (`estadoVerso` + outros filtros): mensagem + 2 botões inline.
   - Cenário 2 (só `estadoVerso`): mensagem específica + botão "Limpar filtro de verso".
   - Cenário 3 (default): mensagem atual.

### Mapeamento chip → valor (idêntico ao Select de `/gestao/filtros`)

| Chip | filtros.estadoVerso |
|---|---|
| Todos | `undefined` |
| Com verso | `"com_verso"` |
| Pendente | `"pendente"` |
| Ocorrências | `"ocorrencias"` |
| Validado | `"validado"` |

### Estilo

- Chip ativo: `bg-primary text-primary-foreground`
- Chip inativo: `bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40`
- `h-8 px-3 rounded-md text-xs font-semibold`
- `aria-pressed`, `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1`

## Critérios de aceitação (10)

1. Em 743px, chips ficam em 1–2 linhas, sem overflow horizontal.
2. Sem `estadoVerso` ativo, "Todos" aparece destacado (default visível).
3. Clicar "Ocorrências" → lista filtra para Linha 3 com `saude === "atencao"`.
4. Aplicar chip aqui → abrir `/gestao/filtros` → Select reflete o mesmo valor.
5. Aplicar Select em `/gestao/filtros` → voltar → chip correspondente está ativo.
6. Visão "Por momento" oculta a barra de chips.
7. Chips são mutuamente exclusivos (radio behavior). "Todos" é o reset.
8. Lista vazia + só `estadoVerso` ativo → mensagem específica + botão "Limpar filtro de verso".
9. Lista vazia + `estadoVerso` + outros filtros → mensagem + 2 botões (Limpar verso / Limpar todos).
10. Badge "Filtros aplicados" continua refletindo `filtrosAtivos()` (já considera `estadoVerso`).

## O que NÃO faço

- ❌ Mexer em `lib/checklist/filtros.ts`, `gestao.filtros.tsx`, hooks ou componentes de verso.
- ❌ Criar arquivo separado pro componente (~50 linhas, melhor inline no consumidor único).
- ❌ Aviso "Filtros atuais não incluem Linha 3" (cenário 2 já cobre via mensagem).
- ❌ Contadores nos chips (custo de reduces extras, ganho marginal).
- ❌ Persistir preferência separada (`setFiltros` já vai pro storage).

