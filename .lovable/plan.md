## Análise de aging (envelhecimento) de NCs/NRs

Adicionar uma seção de **gestão industrial** na tela `/gestao/nao-conformidades` mostrando o que está há mais tempo sem ser resolvido — tipo o que se vê em sistema de TPM / 5S / qualidade de chão de fábrica.

### O que vai aparecer na tela

**1. KPIs de tempo de resposta** (linha nova de cards, acima dos atuais)
- **Tempo médio de resolução** (das que já foram resolvidas no período) — ex.: "2,4 dias"
- **Tempo médio em aberto** (das pendentes, contando até hoje) — ex.: "5,1 dias"
- **Mais antiga em aberto** — ex.: "12 dias" + qual item
- **% resolvidas em até 24h** — indicador de agilidade da gestão
- **SLA estourado** (pendentes > 7 dias) — contador destacado em vermelho

**2. Tabela "Aging — pendentes mais antigas"** (nova seção, logo abaixo dos KPIs)
Lista as **NCs/NRs ainda em aberto**, ordenadas da mais antiga pra mais nova, com:
- Data de abertura
- Dias em aberto (com badge colorido: verde ≤2d, amarelo 3-7d, vermelho >7d)
- Turno · Origem (NC/NR)
- Item + observação resumida
- Operador que registrou
- Botão "Resolver" (igual ao da lista detalhada)

Mostra as **15 mais antigas** com botão "ver todas" que filtra a lista detalhada de baixo.

**3. Tabela "Itens crônicos"** (substitui ou complementa a "Itens mais recorrentes" atual)
Pra cada item recorrente, mostra:
- Descrição do item
- Quantas vezes apareceu no período
- **Quantas ainda estão pendentes**
- **Tempo médio de resolução** desse item específico
- **Reincidência**: quantas vezes voltou após ter sido resolvido (mesmo item, mesmo turno, em datas diferentes)

**4. Tabela "Performance por turno"** (enriquece a "Por turno" atual)
Adiciona colunas:
- % resolvido
- Tempo médio de resolução do turno
- Pendentes > 7d

### Como o tempo é calculado

- **Abertura** = `dataHora` do registro (já existe em `RegistroNcNr`)
- **Fechamento** = `resolvidoEm` da resolução correspondente (já existe em `ResolucaoNcNr`)
- **Tempo de resolução** = fechamento − abertura
- **Tempo em aberto** = agora − abertura (pra pendentes)
- **Reincidência** = mesmo `item_numero` + `origem`, mesmo turno, em registros com `data` diferentes, sendo que houve uma resolução no meio

Tudo calculado em memória no front, **sem mudar schema e sem SQL novo**. Os dados já estão disponíveis nos hooks atuais (`ag.registros` + `resolucoes`).

### Arquivos

- **Novo** `src/lib/nao-conformidades/aging.ts` — funções puras de cálculo (média, aging, reincidência, percentis). Testáveis isoladamente.
- **Editado** `src/routes/gestao.nao-conformidades.tsx` — adiciona as 4 novas seções usando o agregador acima, antes da lista detalhada existente. Mantém todos os filtros (período, turno, origem) afetando os cálculos.
- **Reaproveitado** componente `KpiCard` e `BadgeOrigem` que já existem no arquivo.

### Resumo visual da página depois da mudança

```text
[ Filtros: Período | Origem | Turno | Status ]

[ KPIs originais: NC | NR | Pendentes | Resolvidas | Total ]
[ KPIs novos:    Tempo médio resolução | Tempo médio aberto | Mais antiga | % em 24h | SLA estourado ]

[ Aging — pendentes mais antigas (15) ]   ← nova
[ Itens crônicos / reincidência ]         ← nova (substitui "mais recorrentes")
[ Performance por turno ]                 ← turbinada
[ Registros (lista detalhada existente) ]
```

Sem mudanças no banco, sem SQL pra rodar.