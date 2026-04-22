

# Plano — Verso (PTP + Limpeza) no Relatório da Gestão (revisado)

GPT validou a direção geral e adicionou 5 correções críticas que mudam a arquitetura do plano anterior. Incorporo todas.

## Diferenças vs. plano anterior

| Tema | Plano antigo | Plano novo (correto) |
|---|---|---|
| Denominador de aderência | "dias com qualquer registro" | **Turnos da frente deduplicados** (data_operacao + turno) |
| Chave de join frente×verso | `folhaDiaKey` | **`data_operacao + turno`** (folhaDiaKey não tem turno) |
| Filtro PTP por turno | `.eq("turno", ...)` na SQL | Buscar por período, **derivar turno em memória** via `PTP_JANELAS_POR_TURNO` (J01–J06=Dia, J07–J12=Noite) |
| Semântica PTP | `quantidade` = ocorrência | **`quantidade` = marcações; ocorrências = quantidade × 2** (mostrar ambos) |
| Hook reutilizado | `useVersosDosDiasRemote` (1 dia) | **Novo `use-verso-relatorio.ts`** (intervalo) — `fetchPtpJanelas`/`fetchLimpezaTurnos` atuais são por `folha_dia_key` único |

## Arquitetura

```text
src/hooks/use-verso-relatorio.ts        ← NOVO  (queries por período)
src/lib/verso/reporting.ts              ← NOVO  (agregações puras)
src/routes/gestao.relatorio.tsx         ← EDIT  (5 blocos novos no fim)
```

### 1. `src/hooks/use-verso-relatorio.ts`

```text
useVersoRelatorioRemote(dataInicio, dataFim) → {
  ptp: PtpJanela[],        // todas do período, sem filtro de turno
  limpeza: LimpezaTurno[], // todas do período
  loading, error, refetch
}
```

- 2 queries paralelas em `ptp_janelas` e `limpeza_turnos` com `.from(... as never)`, `.gte/.lte("data_operacao", ...)`, `.order("data_operacao")`.
- Mappers: `ptpJanelaFromRow` / `limpezaTurnoFromRow` (já existem).
- Sem realtime. Refetch on `visibilitychange` (debounced), igual hooks remotos atuais.
- Erro isolado no `error` — não quebra render do relatório.

### 2. `src/lib/verso/reporting.ts` (puro, sem React)

Funções principais:

```text
construirReferenciaFrente(checklistsFiltrados)
  → Set<{ dataOperacao, turno, equipe?, linha?, maquina? }>
  // dedup por data_operacao + turno

derivarTurnoDaJanela(janelaCodigo): Turno
  // usa PTP_JANELAS_POR_TURNO de constants.ts

cruzarFrenteVerso(referenciaFrente, ptp, limpeza)
  → LinhaAderencia[]
  // por turno: { data, turno, equipe, frenteOk, ptpEsperadas[], 
  //              ptpRealizadas[], limpezaStatus, situacao }
  // situacao: 'completo' | 'ptp_pendente' | 'limpeza_pendente' 
  //         | 'verso_incompleto' | 'frente_sem_verso'

calcularResumoVerso(ref, ptp, limpeza) → ResumoVerso
  // 12 KPIs do Bloco 1

calcularDiagnosticoPtp(ptp, ref) → DiagnosticoPtp
  // distribuição status; top itens com marcações + ocorrências(×2);
  // distribuição J01..J12; janelas com observação

calcularDiagnosticoLimpeza(limpeza, ref) → DiagnosticoLimpeza
  // distribuição status turnos; top itens nao_realizado;
  // taxa validação líder; série diária de não realizados

calcularAlertasVerso(...) → AlertaOperacional[]

registrosVersoForaDoRecorte(ref, ptp, limpeza) → { ptp[], limpeza[] }
  // diagnóstico separado, NÃO entra no denominador
```

Regras travadas no código:
- PTP: status concluída ≠ `pendente` e ≠ `rascunho`.
- Limpeza: completa só se `status === "validado"`.
- Top item PTP exibe `"X marcações (2X ocorrências)"`.
- Apenas estado atual; **nunca** ler `ptp_janelas_edicoes` / `limpeza_turnos_edicoes`.

### 3. `src/routes/gestao.relatorio.tsx` — 5 blocos novos

Inseridos após o Bloco 7 atual, dentro de um `<ErrorBoundary>` próprio do verso (falha do verso não derruba relatório):

```text
Bloco 8  · Verso da folha — Resumo                    (12 KPIs)
Bloco 9  · Aderência documental Frente × Verso        (tabela por turno)
Bloco 10 · Diagnóstico PTP                            (status, top itens, J01..J12, observações)
Bloco 11 · Diagnóstico Limpeza                        (status, top não-realizados, validação líder, série)
Bloco 12 · Alertas operacionais do verso              (lista curta, linguagem operacional)
```

Visibilidade: blocos só renderizam se `referenciaFrente.size > 0`. Se zero → estado vazio único: "Sem turnos da frente no recorte para avaliar verso."

Aviso discreto quando filtros incompatíveis (`statusAnomalia`, `criticidade`, `categoria`, `momento`, `equipamentoAfetado`) estiverem ativos: *"Indicadores do verso seguem data/turno/equipe da frente e não variam por filtros específicos de anomalias."*

Quando `error` do hook do verso → renderizar apenas: *"Não foi possível carregar os dados do verso."* nos blocos 8–12, mantendo blocos 1–7 intactos.

## Lógica de cruzamento (passo a passo)

```text
1. checklistsFiltrados (já existe no relatório)
2. referenciaFrente = dedup por (data_operacao, turno)
3. para cada turno de referência:
     janelasEsperadas = PTP_JANELAS_POR_TURNO[turno]   // 6 janelas
     ptpDoTurno = ptp.filter(j => 
        j.dataOperacao === ref.data && 
        derivarTurnoDaJanela(j.janelaCodigo) === ref.turno)
     limpezaDoTurno = limpeza.find(l =>
        l.dataOperacao === ref.data && l.turno === ref.turno)
     situacao = avaliar(janelasEsperadas, ptpDoTurno, limpezaDoTurno)
4. registros de PTP/limpeza cuja chave (data, turno) ∉ referenciaFrente
   → vão para "fora do recorte documental" (diagnóstico, não KPI)
```

## SQL necessária

**Nenhuma.** Tabelas e RLS atuais já cobrem. Mappers e constantes (`PTP_JANELAS_POR_TURNO`) já existem.

## Critérios de aceitação (do prompt do GPT)

1. ✅ Relatório atual continua funcionando (blocos 1–7 intocados).
2. ✅ Verso entra como blocos adicionais isolados em error boundary.
3. ✅ Denominador = turnos da frente deduplicados.
4. ✅ PTP exibe marcações + ocorrências (×2).
5. ✅ Aderência calculada por turno da frente.
6. ✅ Gestão vê: completo/incompleto, PTP por status, limpeza por status, top itens.
7. ✅ Filtros incompatíveis não distorcem (aviso discreto).
8. ✅ Falha do verso não derruba relatório (error boundary local).
9. ✅ Sem mudanças em operador / auditoria / Excel / visualizar dia.

