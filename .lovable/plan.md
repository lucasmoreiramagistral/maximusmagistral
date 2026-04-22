

## Banner "Turno Concluído com Sucesso" na home do operador

Quando o operador finalizar **as 3 tarefas obrigatórias do turno** — Checklist operacional (com assinaturas), PTP Garrafas (6/6 janelas) e Limpeza Sala de Envase (21/21 itens + validação do líder) — a home `/operador` exibirá um banner de destaque celebrando a conclusão.

### Critérios de "tudo concluído" (do turno do operador logado)

1. **Checklist operacional**: existir, na folha do dia (data + turno + equipe + linha + máquina), pelo menos um checklist `concluido` em cada um dos 3 momentos (`Início / retomada de processo`, `Setup / longas paradas / PCM`, `Pós-setup`) **com `assinaturaOperador` e `assinaturaLider` preenchidas no Pós-setup**.
2. **PTP Garrafas**: 6/6 janelas do turno do operador com `statusJanela` diferente de `pendente`/`rascunho`.
3. **Limpeza Sala de Envase**: turno do operador com `status === "validado"` (que já implica 21/21 itens respondidos + assinatura do líder).

### Visual do banner

Aparece **acima** da grade de botões (substituindo visualmente o card de "checklist em andamento" quando tudo estiver pronto), com estilo de sucesso:

- Fundo verde suave (`bg-success/10`, borda `border-success/40`).
- Ícone grande `CheckCircle2` à esquerda.
- Texto principal: **"Turno concluído com sucesso!"**
- Subtítulo: *"Você concluiu o checklist operacional, o PTP Garrafas e a limpeza da sala de envase deste turno. Bom descanso!"*
- Lista compacta de confirmações (3 linhas com check verde):
  - ✓ Checklist operacional assinado (operador + líder)
  - ✓ PTP Garrafas — 6/6 janelas registradas
  - ✓ Limpeza Sala de Envase — turno validado pelo líder
- Pequena tag com data/turno: *"Turno 12x36 Dia · 22/04/2026"*.

Quando o banner aparece, o card amarelo de "checklist em andamento" fica oculto (não faz sentido com tudo concluído).

### Arquivos a alterar

**`src/routes/operador.index.tsx`** (única alteração)
- Importar `usePtpJanelas`, `useLimpezaTurnos`, `calcularDataOperacional`, `buildFolhaDiaKey`, `buildFolhaKey`, `VERSO_CONTEXTO_FIXO`, `PTP_JANELAS_POR_TURNO`, `MOMENTOS_CHECKLIST`, `CheckCircle2`.
- Carregar dados:
  - `data = calcularDataOperacional(equipe, turno)` e `folhaDiaKey = buildFolhaDiaKey(...)` (mesmo padrão de `operador.verso.tsx`).
  - `ptp = usePtpJanelas(folhaDiaKey, data)` e `limpeza = useLimpezaTurnos(folhaDiaKey, data)`.
  - `checklists = storage.getChecklists()` filtrados por `folhaKey` correspondente ao contexto do dia.
- Calcular flags:
  - `ptpOk` = `6/6` para o `turnoLogado`.
  - `limpezaOk` = `limpezaTurnoOperador?.status === "validado"`.
  - `checklistOk` = existir um checklist concluído para cada um dos 3 momentos no `folhaKey` do dia, **e** o checklist do momento `Pós-setup` ter `assinaturaOperador` e `assinaturaLider` preenchidas.
  - `tudoConcluido = ptpOk && limpezaOk && checklistOk`.
- Renderizar o banner verde quando `tudoConcluido === true` e ocultar o card amarelo de rascunho nesse caso.

### Notas técnicas

- Reusa hooks já existentes — nenhum schema novo, nenhuma migration.
- A leitura de checklists usa `storage.getChecklists()` (cache local já populado pelo fluxo de conclusão) filtrando por `folhaKey === buildFolhaKey(contextoDoDia)`. Não depende de chamada de rede adicional.
- O contador de pendências do header (3 → 0) **não é alterado aqui** — mantém o comportamento atual de fila offline. O banner é o indicador "humano" de turno concluído.
- Se o turno do operador for `3º Turno` (sem janelas PTP/limpeza por turno mapeadas), o banner não é exibido (fallback seguro: `turnoLogado` precisa ser `12x36 Dia` ou `12x36 Noite`).

