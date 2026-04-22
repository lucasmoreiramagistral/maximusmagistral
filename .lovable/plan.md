

# Plano final v4 — Visão "Verso" + filtro 100% coerente

## Princípio único de coerência

**A visão "Verso" é uma lente sobre Linha 3 / Enchedora 3.** Os chips de estado **só** filtram dentro dessa lente. Tudo que mexe em verso (chips, Select de `/gestao/filtros`, badge "Filtros aplicados", contador, estado vazio) responde à mesma fonte de verdade: `filtros.estadoVerso`.

## Fonte de verdade única

```text
filtros.estadoVerso ∈ { undefined | "com_verso" | "pendente" | "ocorrencias" | "validado" }
                            ↓
        ┌───────────────────┼────────────────────┐
        ↓                   ↓                    ↓
  Chips visão Verso    Select /gestao/filtros   filtrarFolhas()
  (Todos/Pen/Oco/Val)  (5 opções incl. com_verso) (lógica aplicada)
        ↓                   ↓                    ↓
        └───────────→ localStorage ←────────────┘
                  + evento fm-storage-update
                  → todos os listeners re-leem
```

## Contrato de cada visão

| Visão | Lista base | Aplica `temVerso`? | Aplica `estadoVerso`? | Mostra chips? |
|---|---|---|---|---|
| Checklist do dia | `filtrarFolhas(todasFolhas, filtros)` | Não (apenas se `estadoVerso` ativo via `filtrarFolhas`) | Sim (se setado) | Não |
| Por momento | `filtrarChecklists(...)` | N/A (não é folha) | Sim (se setado, via `filtrarChecklists`) | Não |
| **Verso** | `filtrarFolhas(...).filter(temVerso)` | **Sim, sempre** | Sim (se setado) | **Sim** |

**Regra crítica:** na visão Verso, `temVerso` é aplicado **sempre**, mesmo se `estadoVerso === undefined`. Garante que "Todos" significa "todas folhas Linha 3", não "todas as linhas".

## Mudanças técnicas

**1 arquivo editado:** `src/routes/gestao.checklists.tsx`

### 1. Tipo e import

```ts
type Visao = "momento" | "dia" | "verso";
import { temVerso } from "@/lib/verso/aplicabilidade"; // já importado via extrairFolhasDiaKeysComVerso? confirmar e reusar
import { ClipboardCheck, Filter, LayoutGrid, ListIcon, Loader2 } from "lucide-react";
```

### 2. Toggle bar (3 botões)

Adiciona `[Verso]` com ícone `ClipboardCheck` no mesmo padrão visual dos outros 2 toggles. Em viewport 743px, `flex-wrap` existente quebra graciosamente.

### 3. Lista derivada por visão

```ts
const folhasVerso = useMemo(
  () => folhas.filter(temVerso),
  [folhas]
);
```

`folhas` já vem de `filtrarFolhas(todasFolhas, filtros, anomalias, resumosVerso)` — então `estadoVerso` já foi aplicado. `folhasVerso` apenas restringe a Linha 3.

### 4. Chips: condição `visao === "verso"` (não `"dia"`)

Remover chip "Com verso" do array. Restam **4 chips**:

| Chip | `estadoVerso` |
|---|---|
| Todos | `undefined` |
| Pendente | `"pendente"` |
| Ocorrências | `"ocorrencias"` |
| Validado | `"validado"` |

Justificativa: na visão Verso, "Todos" já significa "todas Linha 3" (via `temVerso`), tornando "Com verso" redundante. O valor `"com_verso"` permanece no tipo e no Select para compatibilidade — se o usuário setou via Select, a visão Verso aplica normalmente, mas nenhum chip destaca (esperado).

### 5. Render do conteúdo

```ts
visao === "verso"
  ? folhasVerso.length === 0
    ? <FolhasVazio filtros={filtros} visao="verso" />
    : <Grid>{folhasVerso.map(card)}</Grid>
  : visao === "dia"
    ? folhas.length === 0
      ? <FolhasVazio filtros={filtros} visao="dia" />
      : <Grid>{folhas.map(card)}</Grid>
    : <TabelaMomento lista={lista} />
```

### 6. Contador no header

```ts
const totalLabel =
  visao === "verso"
    ? `${folhasVerso.length} ${folhasVerso.length === 1 ? "folha de Linha 3" : "folhas de Linha 3"}`
    : visao === "dia"
      ? `${folhas.length} ${folhas.length === 1 ? "folha do dia" : "folhas do dia"}`
      : `${lista.length} ${lista.length === 1 ? "registro" : "registros"}`;
```

### 7. Estado vazio com prop `visao`

`FolhasVazio` recebe `visao: "dia" | "verso"`. 4 cenários combinados:

| Visão | `estadoVerso` ativo | Outros filtros ativos | Mensagem | Botões |
|---|---|---|---|---|
| dia | sim | sim | "Nenhuma folha corresponde aos filtros" | Limpar verso / Limpar todos |
| dia | sim | não | "Nenhuma folha corresponde ao filtro de verso" | Limpar filtro de verso |
| dia | não | qualquer | "Nenhum checklist disponível" | — |
| verso | sim | sim | "Nenhuma folha de Linha 3 corresponde aos filtros" | Limpar verso / Limpar todos |
| verso | sim | não | "Nenhuma folha de Linha 3 com este estado" | Limpar filtro de verso |
| verso | não | sim | "Filtros atuais não retornam folhas de Linha 3" | Limpar todos os filtros |
| verso | não | não | "Nenhuma folha de Linha 3 disponível" | — |

### 8. Sincronia bidirecional (já garantida, mas explicitada)

- Chip clicado → `setFiltros({...getFiltros(), estadoVerso: novo})` → grava em `localStorage` → dispara `fm-storage-update` → listener da página re-lê.
- Select em `/gestao/filtros` muda → mesmo fluxo → ao voltar pra `/gestao/checklists`, chip correspondente está ativo (ou nenhum se valor é `"com_verso"`).
- Trocar visão **não** modifica `filtros` (visão é state local volátil; filtro é persistido).
- Badge "Filtros aplicados" usa `filtrosAtivos(filtros)` que já considera `estadoVerso` — funciona em qualquer visão.

## Critérios de aceitação (zero furos — 14)

1. Barra mostra 3 toggles + Filtros, sem overflow horizontal em 743px (quebra de linha aceita via `flex-wrap`).
2. Visão "Verso" lista **só** Linha 3 / Enchedora 3, mesmo com chip "Todos" ativo.
3. Visão "Checklist do dia" mostra todas as linhas e **não** exibe a barra de chips.
4. Visão "Por momento" mostra tabela linear e **não** exibe a barra de chips.
5. Chips de estado aparecem **apenas** quando `visao === "verso"`.
6. Sem `estadoVerso` ativo na visão Verso, "Todos" aparece destacado.
7. Clicar "Pendente" na visão Verso filtra para Linha 3 com PTP/Limpeza pendentes.
8. Trocar de visão **não** modifica `filtros.estadoVerso` (chip ativo persiste ao voltar).
9. Aplicar Select "Verso (Linha 3)" em `/gestao/filtros` com valor `pendente`/`ocorrencias`/`validado` → voltar → chip correspondente está destacado na visão Verso.
10. Aplicar Select com valor `com_verso` → visão Verso filtra normalmente, mas nenhum chip destaca (comportamento documentado, não bug).
11. Contador no header mostra `"X folha(s) de Linha 3"` na visão Verso, `"X folha(s) do dia"` na visão Dia, `"X registro(s)"` na visão Momento.
12. Estado vazio mostra mensagem + botões coerentes com cada um dos 7 cenários da tabela acima.
13. Badge "Filtros aplicados" no botão Filtros reflete `filtrosAtivos()` em qualquer visão (não muda comportamento).
14. Ícone `ClipboardCheck` usado no toggle Verso (já disponível em `lucide-react`, sem dependência nova).

## Pontos blindados (verificações que zeraram furos)

- **`temVerso` aplicado sempre na visão Verso** (não só quando chip ativo) → garante que "Todos" não vaza outras linhas.
- **Chip "Com verso" removido**, mas valor `"com_verso"` mantido no tipo/Select → compatibilidade com `localStorage` antigo e com Select completo.
- **Trocar visão não toca em `filtros`** → estado de UI volátil separado de filtro persistido (sem efeitos colaterais cruzados).
- **Estado vazio cobre 7 cenários combinatórios** (visão × estadoVerso × outros filtros) → nunca cai em mensagem genérica errada.
- **Contador específico por visão** → header sempre coerente com o que está renderizado.
- **Sincronia via `fm-storage-update`** já existe e funciona — só aproveitamos.
- **Hook `useVersosDosDiasRemote(folhaDiaKeys)`** continua recebendo todas as keys de `todasFolhas` (não filtradas) → resumos disponíveis tanto na visão Dia quanto Verso, sem refetch.

## O que NÃO faço

- ❌ Criar componente "card rico" novo com barra de progresso PTP detalhada (reaproveita `ChecklistDiaResumoCard` que já mostra badges via `versoResumo` — card rico fica como TODO).
- ❌ Criar rota `/gestao/verso` (visão é state interno, consistente com toggles existentes).
- ❌ Persistir visão escolhida em localStorage (volátil, igual aos outros toggles do app).
- ❌ Mexer em `lib/checklist/filtros.ts`, `gestao.filtros.tsx`, hooks de verso ou componentes de card.
- ❌ Remover `"com_verso"` do tipo `EstadoVersoFiltro` (compatibilidade).
- ❌ Auto-aplicar `com_verso` ao entrar na visão Verso (visão é lente, não filtro — não polui storage).
- ❌ Refatorar a sincronia `fm-storage-update` (já funciona).

