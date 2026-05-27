## Resposta direta
**Nenhum SQL.** `ptp_janelas` e `limpeza_turnos` por `folha_dia_key` (dia inteiro, compartilhado entre Dia e Noite) está correto. O bug é só de leitura: a gestão pega o resumo do dia inteiro e mostra igual nos dois cards (Dia/Noite). Correção 100% no frontend.

## Diagnóstico
- `/gestao/checklists` já gera um card por turno (`folhaKey` carrega turno+equipe).
- Mas `useVersosDosDiasRemote(folhaDiaKeys: string[])` retorna `Map<folhaDiaKey, ResumoVerso>` (dia inteiro).
- `filtrarFolhas` (`filtros.ts:141`) busca o resumo por `buildFolhaDiaKey(...)` → mesmo resumo nos dois cards → **filtro lateral quebra** (foi isso que falhou nos testes).
- `verso-dia-resumo-badges`, `verso-resumo-card` e `verso-dia-detalhe` têm `/12` hard-coded.
- `PtpGrid` (`verso-dia-detalhe.tsx:229-287`) usa `derivarEscalaDaJanela(j.janelaCodigo)` pra adivinhar turno — produz duplicado "12X36 DIA + 12X36 NOITE" num mesmo card.

## Mudanças (frontend only)

### A. Renomes "do dia" → "do turno"
- `gestao.checklists.tsx:114` — botão "Checklist completo do dia" → "Checklist completo do turno".
- `gestao.checklists.tsx:92` — `totalLabel` "folha(s) do dia" → "folha(s) do turno".
- `checklist-dia-detalhe.tsx:64` — botão "Ver checklist completo do dia" → "Ver checklist completo do turno".
- `checklist-dia-detalhe.tsx:54` — eyebrow "Folha do dia" → "Folha do turno".
- `checklist-dia-detalhe.tsx:144` — `<h2>` "Checklist Completo do Dia" → "Checklist Completo do Turno".
- `gestao.visualizar.dia.$folhaKey.tsx:31` — `head().meta.title` → "Checklist Completo do Turno — Gestão".
- `gestao.visualizar.dia.$folhaKey.tsx:90-91` — `AppHeader` titulo → "Checklist Completo do Turno"; subtitulo → "Visão consolidada do turno".
- URL `/gestao/visualizar/dia/$folhaKey` permanece (a `folhaKey` já carrega turno+equipe — não quebra links).

### B. Núcleo: filtro por turno

**B1. `src/lib/verso/resumo.ts` — `calcularResumoVerso` ganha param opcional `{ turno, equipe }`**
- Se vier: `codigosDoTurno = janelasPtpDoTurnoEquipe(turno, equipe)` (função real, retorna `string[]`).
- Filtra `janelas` para `codigosDoTurno.includes(j.janelaCodigo)` antes de contar.
- `codigosFaltantes = codigosDoTurno.filter(c => !registrado)`; `naoPreenchidas = codigosFaltantes.length`.
- Novo campo `totalJanelasTurno: number` (= `codigosDoTurno.length` ou 12 quando sem escopo) pra UI mostrar `X/N`.
- Filtra `turnos` (limpeza) para só o slot do turno do card antes de contar `itensNaoRealizados`.
- Cálculo de `completo`: troca `finalizadas === 12` por `finalizadas === totalJanelasTurno` e exige só o turno correspondente em `validado`.

**B2. `src/hooks/use-versos-dos-dias.ts` — nova assinatura**

  useVersosDosDiasRemote(folhas: FolhaChecklistDia[]): Map<folhaKey, ResumoVerso>

- Internamente: extrai `folhaDiaKey` único pra fazer as 2 queries `.in(...)` (igual hoje, performance preservada).
- No loop final, calcula um `ResumoVerso` por `f.folhaKey` passando `{ turno: f.contexto.turno, equipe: f.contexto.equipe }`.
- Estabilização: serializa `folhas.map(f => f.folhaKey).sort().join("|")` no `useMemo`.

**B3. `src/routes/gestao.checklists.tsx` — call-sites**
- Remove `folhaDiaKeys` e `extrairFolhasDiaKeysComVerso` (ou mantém como helper interno do hook).
- `const { resumos } = useVersosDosDiasRemote(todasFolhas);`
- `.map(f => ...)` em ambas visões: `resumosVerso.get(f.folhaKey)` (não `versoKey`).

**B4. `src/lib/checklist/filtros.ts:141-146` — lookup por `folhaKey`**

  const resumo = resumosVerso?.get(folha.folhaKey);

- Isso destrava os chips "Pendente / Ocorrências / Validado" pra distinguirem Dia de Noite.

### C. UI dinâmica (remover `/12` hard-coded)

**C1. `verso-dia-resumo-badges.tsx`**
- Remove `const TOTAL_JANELAS = PTP_JANELAS.length`.
- Usa `resumo.ptp.totalJanelasTurno` em todos os labels (`PTP X/N`, `X de N não preenchida(s)`).
- Bloco `(["dia","noite"] as const).map(...)`: renderiza só o slot correspondente ao turno do card (recebe `turno` via prop ou já vem filtrado pelo resumo — escolho **vir filtrado pelo resumo**: se `limpeza.dia === null` E `limpeza.noite === null`, nada renderiza; quando filtrado, só um vem populado, então o map atual continua válido sem mudar a prop).

**C2. `verso-resumo-card.tsx`** (visão "Verso")
- Remove `TOTAL_JANELAS = PTP_JANELAS.length`.
- Usa `resumo.ptp.totalJanelasTurno` nos dois `MiniInfo` (Finalizadas, Registradas).
- Os dois `MiniInfo` "12x36 Dia" / "12x36 Noite": renderiza só o do turno da folha (esconde o outro).

**C3. `verso-dia-detalhe.tsx`** — aceita props `turno: Turno` e `equipe: Equipe`
- Novo `codigosDoTurno = useMemo(() => janelasPtpDoTurnoEquipe(turno, equipe), [turno, equipe])`.
- Filtra `janelas` setadas no state para `codigosDoTurno.includes(j.janelaCodigo)`.
- Filtra `turnos` (limpeza) para `t.turno === turno`.
- `calcularResumoVerso({ janelas, turnos, turno, equipe })`.
- `ResumoChips:166` → `${ptp.finalizadas}/${codigosDoTurno.length}`.
- **`PtpGrid` reescrito**: remove a IIFE com `derivarEscalaDaJanela`. Recebe `codigosDoTurno` + `janelasPorCodigo` + `turno`. Renderiza UM bloco só com o título do turno e a tabela iterando `codigosDoTurno`.
- **`LimpezaTurnos`**: recebe `turno` e renderiza UM `LimpezaCard` (não um `Map.entries().map`), garantindo placeholder "Sem registro do turno" quando ausente.

**C4. `gestao.visualizar.dia.$folhaKey.tsx:109-119`**
- `<VersoDiaDetalhe turno={folha.contexto.turno} equipe={folha.contexto.equipe} folhaDiaKey={...} dataOperacao={...} />`.

### D. Decisão explícita: histórico continua do dia inteiro
`HistoricoDialog` em `verso-dia-detalhe.tsx` lê edições por `folhaDiaKey` — **mantém** como auditoria do dia. Adicionar nota no topo do dialog: "Histórico do dia operacional (Dia + Noite)". Justificativa: gestão investigando uma janela precisa ver edições de qualquer turno que mexeu na mesma folha física.

### E. Fora de escopo
- Excel export (`excel-export.ts`) — usuário só reclamou da UI; o export continua "do dia" até pedir.
- `ObservacoesVersoConsolidado` — também é auditoria do dia, mantém.
- Realtime / SQL / schema / RLS.

## Resultado esperado para 27/05
- **12x36 Dia (Madson)**: "PTP 0/6", "PTP não iniciado", só "Limpeza Dia" (ou nada).
- **12x36 Noite**: "PTP 5/6", só "Limpeza Noite".
- Chips "Pendente/Ocorrências/Validado" filtram cada card independentemente.
- Página de detalhe mostra só as janelas e o cartão de limpeza daquele turno.

## Ordem de implementação
1. `resumo.ts` (novo param + `totalJanelasTurno`) — base.
2. `use-versos-dos-dias.ts` (nova assinatura).
3. `filtros.ts` (lookup por `folhaKey`).
4. `gestao.checklists.tsx` (call-site + renomes A).
5. `verso-dia-resumo-badges.tsx` + `verso-resumo-card.tsx` (C1, C2).
6. `verso-dia-detalhe.tsx` (C3) + `gestao.visualizar.dia.$folhaKey.tsx` (C4 + renomes A).
7. `checklist-dia-detalhe.tsx` (renomes A).
8. Smoke test manual: abrir 27/05, ver Dia 0/6 vazio e Noite com o PTP real; testar os 3 chips de filtro.
