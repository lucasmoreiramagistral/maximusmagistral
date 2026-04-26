## Diagnóstico: o que está vivo, o que é "enchimento de linguiça" e o que precisa ser arrumado

Fiz uma varredura completa. Resumo do que descobri:

---

### Bloco 1 — Código MORTO de "Anomalias" (legado, não faz mais parte do produto)

Você decidiu que o foco passa a ser **NC (Não Conformidades) + NR (Não Realizados)**, e que anomalias de manutenção vão para o app SIGMA externo (já está escrito isso na tela do operador). Mas o esqueleto antigo de Anomalias continua inteiro no projeto, ocupando espaço e confundindo a navegação:

**Rotas que ninguém abre mais (e devem sumir):**
- `/operador/anomalia/nova` — operador agora só vê o aviso "use o SIGMA"
- `/operador/visualizar/anomalia/$id`
- `/gestao/anomalias` (lista) e `/gestao/visualizar/anomalia/$id` — não estão no menu da gestão; só sobra um botão escondido em `/gestao/filtros`
- Componente `AnomaliaDetalhe` em `checklist-detalhe.tsx`
- Componente `anomalia-detalhe-gestao.tsx`
- Hook `use-anomalia-atualizacoes.ts`
- Função `insertAnomalia` em `supabase-storage.ts` e fila offline `anomaliasPendentes` em `use-connection-status.ts`

**O que fica (não mexer):**
- Campo `anomaliaId` nas respostas do checklist e na tabela do banco — isso continua sendo escrito no fluxo NC do checklist e é referenciado por relatórios/contadores. Removo só o que de fato não é mais navegável.
- `useAnomaliasRemote` continua sendo chamado em telas que somam "Anomalias da folha" → vou trocar por contagem de NC/NR ou remover esses números fantasmas.

**Textos com "anomalia" que sobraram em telas de produção e devem virar NC/NR:**
- Tela de login (`index.tsx`): descrições dos perfis dizem "registrar anomalias" / "consultar anomalias"
- `/gestao/filtros`: aba "Status da anomalia", "Categoria da anomalia", botão "Ver anomalias filtradas"
- `/operador/historico`: link para visualizar anomalia
- `gestao.checklists.tsx`: card "Anomalias por folha"

---

### Bloco 2 — Hooks/arquivos sub-utilizados ou redundantes

Mantidos por enquanto, mas vale revisar:
- `use-offline-queue.ts` é só um `re-export` do `use-connection-status.ts` (alias histórico). Limpar para que cada hook tenha um lar.
- Após apagar Anomalias, a fila offline (`anomaliasPendentes`) e suas migrações de localStorage podem ser cortadas — sobra só `checklistsPendentes` e `versoPendente`.

---

### Bloco 3 — Validação Operador → Gestão (o que chega e o que NÃO chega)

Boa notícia: o **fluxo de dados crítico está funcionando** em tempo real (verifiquei nas requisições Supabase do preview):
- Checklist do operador → `checklists` (RT) → Gestão lê em `useChecklistsRemote`
- Limpeza de turno → `limpeza_turnos` (RT) → Gestão lê em `useLimpezaTurnos`
- PTP → `ptp_janelas` (RT) → Gestão lê via verso/relatório
- Resoluções de NC/NR → `nao_conformidade_resolucoes` (RT) → Dashboard, Relatório e Aging
- Edições de checklist/verso → `useEdicoesChecklist`, `useEdicoesPorPeriodo` → Relatório

Pontos de atrito identificados que vou corrigir:

**1. Card "Anomalias" continua aparecendo na lista de checklists da gestão**, mas como ninguém mais abre anomalias por ali, esse contador é puro "enfeite". Trocar por contador de **NC do checklist + NR da limpeza** da folha.

**2. Tela `/gestao/filtros`** ainda oferece filtrar por status/categoria de anomalia e botão "Ver anomalias filtradas" → tirar essa coluna inteira; manter só os filtros de checklist/limpeza que efetivamente alimentam o restante.

**3. Tela `/gestao/index` (home)** está OK e prioriza o card vermelho de NC/NR — manter.

**4. `/operador/historico`** mostra anomalias salvas no localStorage — depois da remoção, fica só o histórico de checklists, que é o que faz sentido hoje.

**5. Aviso bonito**: a página de login (`index.tsx`) precisa atualizar a copy "registrar anomalias" → "registrar não conformidades" para manter coerência.

---

### Bloco 4 — A gestão é útil de verdade?

Hoje a gestão tem 7 ferramentas, e cada uma tem propósito real:

| Tela | Útil? | Por quê |
|---|---|---|
| Dashboard | Sim | KPIs, aging, heatmap, alertas em tempo real |
| Checklists | Sim | Auditoria do que o operador preencheu, agrupado por folha do dia |
| Não conformidades | Sim | Lista única NC + NR com filtro de SLA, ação "marcar como resolvida" |
| Filtros | Parcial | Funciona para checklist; coluna de anomalias precisa sair |
| Gerar Relatório | Sim | Já refatorado para focar em NC + NR + Verso (PTP/Limpeza) |
| Inteligência das ITs | Sim | Telemetria de uso das instruções de trabalho |
| Cadastrar Usuário | Sim | Admin de hierarquia/módulos |

Não vi tela "fantasma" ainda em uso — o problema é mesmo o **legado Anomalias** que está sobrando na navegação e nos contadores.

---

## Plano de execução (na próxima passagem em modo build)

1. **Excluir as rotas de Anomalias**: `operador.anomalia.nova.tsx`, `operador.visualizar.anomalia.$id.tsx`, `gestao.anomalias.tsx`, `gestao.visualizar.anomalia.$id.tsx` (o `routeTree.gen.ts` se regenera sozinho).
2. **Excluir componentes/hooks órfãos**: `anomalia-detalhe-gestao.tsx`, `use-anomalia-atualizacoes.ts`, função `AnomaliaDetalhe` em `checklist-detalhe.tsx`, `insertAnomalia` em `supabase-storage.ts`, `use-offline-queue.ts` (alias).
3. **Limpar fila offline**: remover bloco `anomaliasPendentes` de `use-connection-status.ts` e a chave correspondente do `storage`.
4. **Atualizar copy do login** (`src/routes/index.tsx`): trocar "registrar/consultar anomalias" por "registrar/consultar não conformidades".
5. **`/operador/index`**: remover o card "Anomalias de manutenção" + dialog do SIGMA (vira ruído visual sem ação real). Se preferir manter o aviso, a gente deixa só como nota no rodapé.
6. **`/operador/historico`**: remover bloco de anomalias; ficar só com checklists locais.
7. **`/gestao/checklists`**: trocar contador "Anomalias por folha" por "NC checklist + NR limpeza" (vindo de `agregarNcNr`).
8. **`/gestao/filtros`**: remover seções "Status da anomalia" e "Categoria da anomalia" e o botão "Ver anomalias filtradas". Limpar `Origem = "anomalias"` do tipo.
9. **Tirar `useAnomaliasRemote`** de `gestao.visualizar.dia.$folhaKey.tsx`, `gestao.visualizar.checklist.$id.tsx` e `gestao.checklists.tsx` (passa array vazio onde alguma função antiga ainda exigir, ou removo o parâmetro).
10. **Validar build**: rodar `tsc --noEmit` e `bun run build`.

Resultado esperado: ~10 arquivos a menos, navegação coerente com o foco de NC/NR, zero textos confusos sobre anomalia, e nenhuma quebra no fluxo de dados Operador → Gestão.

> Importante: **não vou tocar no banco**. As tabelas `anomalias` e `anomalia_atualizacoes` continuam no Supabase (com os dados históricos preservados), só não são mais lidas pela aplicação. Se mais pra frente você quiser arquivar/dropar elas, faço uma migration separada.