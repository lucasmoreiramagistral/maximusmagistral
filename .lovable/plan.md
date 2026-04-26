## Objetivo

Reformar a página **Gerar Relatório** (`/gestao/relatorio`) para remover tudo que é específico de **Anomalias** e dar foco total nas **Não Conformidades (NC do checklist)** e **Não Realizadas (NR da limpeza)**, com aging, SLA, reincidência e tratativa por turno/equipe — alinhado ao que já existe na tela `/gestao/nao-conformidades`.

## O que sai

Remover do `gestao.relatorio.tsx`:

- **Bloco 3 — "Anomalias e Tratativa"** (KPIs por status, gráficos por categoria/equipamento, "abertas há +24h", top itens geradores).
- **Bloco 5 — "Causas, Equipamentos e Recorrência"** (é totalmente baseado em anomalias).
- KPIs de anomalias dentro do **Bloco 1 — Resumo Executivo** (Anomalias, Abertas, Em andamento, Resolvidas, Tempo médio até iniciar, Tempo médio de resolução).
- Filtros que só fazem sentido para anomalias: **Status da anomalia, Criticidade, Categoria, Equipamento afetado**.
- Hook `useAnomaliasRemote` e funções `filtrarAnomalias`, `calcularAnomaliasTratativa`, `calcularRecorrencia`, `calcularComparativos` (passam a receber arrays vazios ou a versão é refeita sem anomalias).
- Texto/subtítulo "anomalias e tratativa" do `AppHeader`.
- O Bloco 4 ("Faixas Horárias Críticas") perde a barra de anomalias — fica só NC + Observações.
- O Bloco 6 ("Comparativo por Equipe e Turno") perde colunas de anomalia (Anom./folha, T. médio resol., % mesmo dia ficam baseadas em **resolução de NC/NR**).
- O Bloco 7 ("Ação imediata") tem suas regras refeitas para olhar **NC/NR pendentes** em vez de anomalias críticas.

## O que entra (foco em NC/NR)

Renomeio o relatório para **"Relatório de Não Conformidades e Não Realizadas — Linha 3"** e reorganizo em blocos novos, reutilizando o que já existe em `src/lib/nao-conformidades/aging.ts` e `src/lib/checklist/nao-conformidades.ts`.

### Novo Bloco 1 — Resumo Executivo (NC/NR)
KPIs:
- Folhas registradas, Folhas completas, % completude, Itens avaliados, % Conformes.
- **Total NC** (checklist) + **Total NR** (limpeza).
- **Pendentes** (sem resolução), **Resolvidas**.
- **Tempo médio de resolução** (dias) — `calcularKpisTempo`.
- **% resolvidas em até 24h**.
- **Pendência mais antiga** (dias + descrição curta).
- **SLA estourado** (>7d).

### Novo Bloco 2 — Disciplina do Checklist FM09 (mantido)
Sem mudança, já é independente de anomalias (`calcularDisciplinaFM09` recebe `[]` no lugar de anomalias).

### Novo Bloco 3 — Aging das Pendências (NC/NR)
- Toggle **Todas / Só SLA estourado** (>7d), igual ao da tela `/gestao/nao-conformidades`.
- Tabela das 20 pendências mais antigas: Origem (NC/NR), Data, Turno, Item, Descrição, Observação curta, Dias em aberto (badge verde/amarelo/vermelho via `tomAging`).
- Sem botão "Resolver" aqui (relatório é leitura).

### Novo Bloco 4 — Faixas Horárias Críticas
Mantém o gráfico, mas só com **NC** e **Observações** (sem barra de anomalias). Adapto `calcularFaixasHorarias` chamando com `anomalias = []`.

### Novo Bloco 5 — Itens Crônicos (reincidência)
Reaproveita `calcularItensCronicos`. Tabela: Origem, Item, Descrição, Ocorrências, Pendentes, Reincidências, Tempo médio resolução. Top 15.

### Novo Bloco 6 — Performance por Turno (resolução de NC/NR)
Reaproveita `calcularPerformanceTurno`. Tabela: Turno, Total, Resolvidas, Pendentes, % Resolvido, Tempo médio resolução, Pendentes acima do SLA. Adicionalmente uma versão por **Equipe** (nova função `calcularPerformancePorEquipe` em `aging.ts` — mesma lógica agrupando por `registro.equipe`).

### Novo Bloco 7 — Ação Imediata
Regras novas (substituem `calcularAcoesImediatas` por uma local):
- "X pendência(s) com SLA estourado (>7d)".
- "Y item(ns) crônico(s) com reincidência ≥ 2".
- "Turno Z concentra a maior carga pendente".
- "Faixa horária HH–HH concentra a maior incidência de NC".
- "% de pendentes acima de N% — risco de acúmulo".

### Blocos 8–12 do Verso (PTP/Limpeza)
Permanecem como estão. Já são independentes de anomalia.

## Filtros

Após remoção, ficam apenas: **Data inicial, Data final, Turno, Equipe, Momento do checklist**. Atalhos (Hoje/Ontem/7d/30d/Mês) permanecem.

## Mudanças técnicas

### Arquivos editados
- `src/routes/gestao.relatorio.tsx`
  - Remover imports/uso de `useAnomaliasRemote`, `calcularAnomaliasTratativa`, `calcularRecorrencia`, `calcularAcoesImediatas`, `filtrarAnomalias`, e os tipos `StatusAnomalia/CriticidadeAnomalia/CategoriaAnomalia` que vierem por tabela.
  - Adicionar imports de `useChecklistsRemote` (já tem), `useLimpezaTurnos` (ou hook equivalente já em uso na tela `/gestao/nao-conformidades`), `useNcResolucoes`, `agregarNcNr`, `chaveRegistro`, `calcularAgingPendentes`, `calcularKpisTempo`, `calcularItensCronicos`, `calcularPerformanceTurno`, `formatarDias`, `tomAging`, `SLA_DIAS`.
  - Construir o array `RegistroComStatus[]` (mesma lógica usada em `gestao.nao-conformidades.tsx` linhas 118–135) e aplicar filtros de turno/equipe/momento sobre ele.
  - Refatorar Blocos 1, 4, 6 e 7; remover Blocos 3 e 5; adicionar Blocos novos (Aging, Crônicos, Performance turno).
  - Atualizar `head().title`, `meta description`, `AppHeader.subtitulo`.
  - Atualizar `FILTROS_PADRAO` removendo campos de anomalia.

### Novo helper
- `src/lib/nao-conformidades/aging.ts`: adicionar `calcularPerformanceEquipe(registros, agora)` (gêmea de `calcularPerformanceTurno`, mas agrupando por `registro.equipe`).

### Compatibilidade
- `FiltrosRelatorio` em `src/lib/checklist/reporting.ts` continua tendo os campos antigos para não quebrar outras chamadas, mas a UI deixa de usá-los. (Sem mudança no arquivo.)
- `calcularDisciplinaFM09`, `calcularFaixasHorarias`, `calcularResumoExecutivo`, `calcularComparativos` continuam sendo chamadas, porém com `anomalias = []`. Os campos relativos a anomalia no resultado simplesmente serão ignorados na UI.

## Garantias
- Build TS e lint devem continuar passando — nenhum novo `any`, sem alterações de schema/banco.
- Verso (Blocos 8–12) intacto.
- Comportamento de impressão (`print:`) mantido nos blocos restantes.