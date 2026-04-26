## Objetivo

Criar uma tela nova **Dashboard Gestão** (`/gestao/dashboard`), pensada para abrir o turno e bater o olho em **30 segundos** e entender: o que está pegando fogo, onde está pegando fogo, quem está resolvendo e o que está envelhecendo.

Hoje a `/gestao` é só um menu de atalhos, a `/gestao/nao-conformidades` é uma tela operacional com filtros e botão "Resolver", e a `/gestao/relatorio` é um relatório longo para imprimir. Falta a camada do meio: um **dashboard real**, visual, sem filtros pesados, focado em decisão.

## O que entra na tela `/gestao/dashboard`

Layout em grid responsivo, sem necessidade de impressão. Tudo em tempo real (mesmos hooks que as outras telas usam).

### Cabeçalho
- Título: **"Dashboard Gestão — Linha 3"**.
- Toggle de período: **Hoje · 7 dias · 30 dias** (default 7d).
- Indicador "Atualizado em tempo real" + relógio.

### Bloco 1 — Faixa de Status (4 KPIs grandes, com cor semafórica)
- **Pendências abertas** (NC+NR) — vermelho se > 0.
- **SLA estourado (>7d)** — vermelho se > 0, com mini-link "ver lista".
- **Resolvidas em 24h (%)** — verde ≥70%, amarelo 40–70%, vermelho <40%.
- **Tempo médio de resolução** — em dias.

### Bloco 2 — Saúde Operacional (3 cards lado a lado)
- **Completude do checklist hoje** (folhas completas / esperadas) com barra de progresso.
- **Aderência da limpeza hoje** (% itens realizados) com barra.
- **PTPs concluídos hoje** (janelas fechadas / abertas) com barra.

### Bloco 3 — Heatmap "Onde dói mais"
Grade visual **Turno × Origem (NC / NR)** com a contagem de pendências em cada célula, colorida por intensidade. Bate o olho e enxerga "Turno B está acumulando NR".

### Bloco 4 — Top 5 Itens Crônicos
Lista compacta com ranking, badge de origem (NC/NR), nº ocorrências, nº reincidências e barra horizontal proporcional. Fonte: `calcularItensCronicos` (já existe).

### Bloco 5 — Aging das 8 pendências mais antigas
Tabela enxuta: Item · Turno · Aberto há (badge verde/amarelo/vermelho via `tomAging`) · botão "Abrir" que leva para `/gestao/nao-conformidades` já filtrada.

### Bloco 6 — Tendência (últimos 14 dias)
Gráfico de barras simples (CSS, sem nova lib): NC abertas vs Resolvidas por dia. Mostra se a curva está achatando ou subindo.

### Bloco 7 — Performance por Turno e por Equipe
Duas mini-tabelas lado a lado, baseadas em `calcularPerformanceTurno` e `calcularPerformanceEquipe` (já existem). Mostram: Total · % Resolvido · Tempo médio · Acima do SLA.

### Bloco 8 — Alertas inteligentes
Lista de "ações imediatas" geradas dinamicamente:
- "X pendência(s) com SLA estourado — turno Y concentra Z delas."
- "Item #N ('descrição') reincidiu K vezes."
- "Faixa horária HH–HH com pico de NCs hoje."
- "Limpeza do turno Y abaixo de 80% de aderência."
Cada alerta é um card com ícone, severidade e link para a tela específica.

## Diferenciação das telas existentes

| Tela | Função |
|---|---|
| `/gestao` (home) | Atalhos / menu |
| `/gestao/dashboard` (NOVA) | Visão executiva em 30s, leitura rápida |
| `/gestao/nao-conformidades` | Operacional: filtrar, resolver, reabrir |
| `/gestao/relatorio` | Relatório longo, formatado para impressão |

Nenhum bloco é cópia: o dashboard prioriza **densidade visual** (heatmap, barras, semáforos), enquanto o relatório prioriza **texto formal e impressão** e a tela de NC prioriza **ação** (botão Resolver).

## Mudanças técnicas

### Arquivo novo
- `src/routes/gestao.dashboard.tsx` — rota nova, componentes locais para os blocos (todos isolados na própria página, nenhum componente extraído porque é uso único).

### Helpers novos
- `src/lib/nao-conformidades/dashboard.ts`:
  - `calcularHeatmapTurnoOrigem(registros)` → matriz `{ turno, nc, nr, total }[]`.
  - `calcularSerieDiaria(registros, dias)` → `{ data, abertas, resolvidas }[]` para o gráfico de tendência.
  - `gerarAlertas(registros, agora)` → `Alerta[]` com severidade, mensagem e link sugerido.
- Reutiliza tudo que já existe em `src/lib/nao-conformidades/aging.ts` (KPIs tempo, aging, crônicos, performance turno/equipe).

### Hooks usados (todos já existem)
- `useChecklistsRemote` (real-time)
- `useResolucoesNcNr`
- Carregamento direto de `limpeza_turnos` (mesmo padrão da tela de NCs)
- `useGuard("gestao")`
- `useLimpezaTurnos` / `usePtpJanelas` para os cards de saúde operacional do dia.

### Integração com as outras telas
- Adicionar **um card "Dashboard"** no menu `src/routes/gestao.index.tsx` (ícone `LayoutDashboard`), no topo do grid de atalhos, antes de "Checklists".
- **Não mexer** em `/gestao/nao-conformidades` nem em `/gestao/relatorio`.

### Sem mudanças
- Schema do banco: nenhuma.
- RLS: nenhuma.
- Tipos compartilhados: nenhuma alteração quebrando.

## Critérios de aceite
- A página abre em < 1s com cache do React Query.
- Todos os blocos renderizam mesmo com dados vazios (estados "sem dados ainda").
- Responsivo: em mobile vira coluna única, KPIs em grid 2×2.
- Cliques nos KPIs e alertas levam para a tela correspondente já com filtro pré-aplicado quando faz sentido (ex.: SLA estourado → `/gestao/nao-conformidades?aging=sla`).
- Build (`tsc --noEmit` + `bun run build`) e lint sem novos erros.