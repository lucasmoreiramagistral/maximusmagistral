## Análise profunda — o que mudou depois de ler o código

Li `use-connection-status.ts`, `use-ptp-janelas.ts`, `use-limpeza-turnos.ts`, `app-header.tsx`, `operador.verso.ptp.$janelaCodigo.tsx` e `resumo.ts`. Achei 4 coisas que **mudam o plano**:

### 🚨 BUG CRÍTICO descoberto agora — provável causa do J08 perdido

**`src/components/app-header.tsx` linhas 67–71** — ao fazer logout, o código apaga TODA chave que começa com `fm-checklist:` no localStorage:

```ts
if (k.startsWith("fm-checklist:")) keysRemover.push(k);
```

Isso **inclui** `fm-checklist:fila-offline`. Se o operador sair com itens pendentes na fila (offline, ou erro de rede transitório), **os dados são destruídos silenciosamente sem aviso**. Isso explica perfeitamente o sumiço do J08.

### Outras 3 correções ao plano anterior

1. **A fila JÁ classifica erros corretamente** (`use-connection-status.ts` linhas 352–402): conflito, rede e aplicação são tratados separados, e erros de aplicação são DESCARTADOS (não retidos para sempre). O problema não é a fila — é o `catch` dos hooks (`use-ptp-janelas.ts` 172–181 e `use-limpeza-turnos.ts` 172–182) que enfileira QUALQUER erro indiscriminadamente. O hook resolve a Promise normal → `handleConcluir` mostra toast verde "Janela concluída ✅" → navega → erro nunca chega ao operador.

2. **`handleConcluir` já tem `await + try/catch + navega só depois`** (rota linhas 288–303). NÃO precisa mudar — só precisa que o hook propague erro de aplicação ao invés de engolir.

3. **Defesa contra duplicatas** (Stage 4 antigo): desnecessária. IDs são determinísticos via `genVersoId(...)` e upsert é `onConflict:"id"`. Risco real é baixíssimo. Sai do plano (vira só pequeno ordering).

---

## Plano revisado

### Stage 1 — `catch` honesto nos 2 hooks

**`src/hooks/use-ptp-janelas.ts` (linhas 172–181)** e **`src/hooks/use-limpeza-turnos.ts` (linhas 172–182)**

Substituir `catch (e) { enfileirar(...) }` por classificação igual à da `sincronizar()`:

```text
catch (e) {
  if (e instanceof ConflitoVersaoError) { setConflito(true); throw e }

  const isNetwork = /failed to fetch|networkerror|fetch failed|
                     load failed|timeout|aborted/i.test(msg)
  if (isNetwork) {
    enfileirar("ptp_janela", { janela, expectedUpdatedAt, edicao })
    toast.warning("Sem conexão — salvo na fila offline.")
    return  // resolve normalmente
  }

  // Erro de aplicação (RLS, CHECK do banco, validação): NÃO enfileira, RELANÇA
  console.error("[salvarJanela] erro de aplicação:", e)
  throw e  // handleConcluir já trata e mostra toast vermelho
}
```

Efeito: o CHECK que criamos no banco ("se status = houve_ocorrencia, exige item com quantidade > 0") agora vai aparecer pro operador como toast vermelho em vez de "sumir" silenciosamente.

### Stage 2 — Fila offline visível + **não-destruível**

**2a. 🚨 Corrigir bug do logout (`app-header.tsx` 57–75)** — PRIORIDADE MÁXIMA
- Ler `pendingCount` ANTES de iniciar a limpeza.
- Se > 0: abrir `AlertDialog` com **"Você tem N registros não enviados. Se sair agora, eles serão perdidos. Deseja sair mesmo assim?"** — botões "Cancelar" / "Sair e perder dados".
- No filtro de remoção do localStorage: **nunca apagar `fm-checklist:fila-offline`** (preservar entre logins; só remove se o usuário confirmou perder).

**2b. Badge sempre visível quando há pendentes** (`app-header.tsx` 109–110)
- Hoje: badge "Sem conexão" só aparece offline+pendentes.
- Mudar: pendentes > 0 sempre mostra badge (online: amarelo "N pendentes"; offline: vermelho "Sem conexão · N pend."). Clicável → navega para `/operador/fila-pendente`.

**2c. Nova rota `src/routes/operador.fila-pendente.tsx`**

Lista cada item de `useOfflineQueue().fila`:
- Tipo legível (PTP J08, Limpeza Dia, etc.) via `labelPtpJanela` / `labelLimpezaTurno`
- Data de criação, nº de tentativas, último erro
- Botão "Tentar enviar agora" → `sincronizar()`
- Botão "Descartar" (com confirmação)

### Stage 3 — Leitura honesta (janelas faltantes)

**`src/lib/verso/resumo.ts`** — adicionar em `ResumoVersoPtp`:
- `naoPreenchidas: 12 - registradas` — janelas que nem existem no banco
- `comAssinaturaCorrupta` — finalizadas porém sem `assinaturaOperador` (pega corrupção pré-CHECK)
- `codigosFaltantes: string[]` — quais janelas (J01...J12) não têm registro

**`src/components/verso-dia-resumo-badges.tsx`**
- Quando `naoPreenchidas > 0` E data < hoje: badge vermelho **"3 de 12 janelas não preenchidas"** com tooltip listando `J05, J08, J09`.

**`src/components/verso-dia-detalhe.tsx`** e **`src/routes/gestao.visualizar.dia.$folhaKey.tsx`**
- Bloco vermelho destacando códigos faltantes para gestão revisar.

### Stage 4 — Pequena defesa de leitura

**`src/lib/verso/supabase-storage.ts` `fetchPtpJanelas` + `fetchLimpezaTurnos`**

Acrescentar `.order("updated_at", { ascending: false })`. Garante que, em qualquer cenário improvável de duplicata, a versão mais recente é a primeira lida. Baixo risco, ganho de robustez.

---

## SQL adicional

**Nenhum.** Os 4 CHECK + index do Stage 5 já estão no banco. O Stage 1 acima é o que faz os CHECK serem visíveis ao operador via toast.

---

## Resultado esperado

| Cenário | Antes | Depois |
|---|---|---|
| Conclui janela inválida (sem assinatura, ou houve_ocorrencia sem item) | Some silenciosamente | Toast vermelho com mensagem do CHECK, fica na tela |
| Conclui sem rede | Salva na fila silenciosamente | Toast amarelo + badge no header |
| **Sai com fila pendente** | **🚨 Dados destruídos sem aviso** | **AlertDialog impede; fila preservada** |
| Gestão abre dia incompleto | "PTP 9/12" (parece ok) | "3 janelas não preenchidas: J05, J08, J09" em vermelho |
| Duplicata acidental | Ordem indefinida | Mais recente vence |

---

## Fora de escopo (confirmado)

- Recuperar J08 antigo (dado original não existe — perdido pelo bug do logout).
- Mudar modelo de dados / RLS.
- Histórico de auditoria, exports.

---

## Ordem de implementação sugerida

1. **Stage 2a (bug do logout) PRIMEIRO** — bug ativo destruindo dados. 15 min.
2. Stage 1 (catch honesto) — destrava o CHECK que já está no banco. 20 min.
3. Stage 2b + 2c (badge + página fila) — visibilidade. 40 min.
4. Stage 3 (gestão vê faltantes). 30 min.
5. Stage 4 (order). 5 min.