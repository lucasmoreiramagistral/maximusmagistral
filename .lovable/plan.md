

# Ajustes no Verso da Folha — bugs e fluxo do líder

## 1. Bug do "Motivo da edição" piscando no PTP

**Arquivo:** `src/routes/operador.verso.ptp.$janelaCodigo.tsx`

**Causa:** o estado `jaConcluida` é recalculado em todo render a partir de `janelaBase.statusJanela`. Quando você clica em **Concluir janela**, o `salvarJanela` atualiza o estado local da janela para `sem_ocorrencia`/`houve_ocorrencia`/`nao_rodou` antes do `navigate`, fazendo o bloco "Motivo da edição *" aparecer por uma fração de segundo. Em alguns casos (principalmente offline ou quando a navegação demora), isso também faz a próxima validação `if (jaConcluida && !motivoEdicao.trim())` disparar erroneamente.

**Correção:**
- Travar o cálculo de `jaConcluida` em uma `useRef`/`useState` que só é definido **uma vez no mount** da janela (snapshot inicial). Edições subsequentes da mesma sessão continuam usando esse snapshot.
- Após `Concluir janela` com sucesso, navegar **imediatamente** sem disparar re-render do bloco condicional.
- Resultado: motivo só aparece quando o operador abre uma janela que **já estava concluída antes de carregar a tela** — exatamente o que você pediu.

## 2. Mover "Validação do Líder" para `/operador/verso`

**Arquivos afetados:**
- `src/routes/operador.verso.tsx` — adicionar 3ª seção "Validação do Líder" abaixo dos 2 cards
- `src/routes/operador.verso.limpeza.tsx` — **remover** os blocos de validação do líder (botão "Iniciar validação", formulário de nome+assinatura, mensagem "Validado por...")
- `src/lib/verso/types.ts` — (não muda) já tem `liderNome` e `assinaturaLider` por turno

**Comportamento da nova seção na home do verso:**

```text
┌─────────────────────────────────────────────────────┐
│  Validação do Líder                                  │
├─────────────────────────────────────────────────────┤
│  Pré-requisitos:                                     │
│   ✓ 12/12 janelas do PTP registradas                │
│   ✗ Limpeza 12x36 Dia (aguardando conclusão)        │
│   ✓ Limpeza 12x36 Noite concluída                   │
│                                                      │
│  [Bloqueado]  ou  [Validar como líder]              │
└─────────────────────────────────────────────────────┘
```

**Regras de liberação (todas precisam estar verdadeiras):**
- Todas as 12 janelas do PTP com `statusJanela ∈ {sem_ocorrencia, houve_ocorrencia, nao_rodou}` (não `pendente`/`rascunho`)
- Todos os turnos ativos da limpeza (`12x36 Dia` + `12x36 Noite`) com `status = aguardando_validacao` ou `validado`

Enquanto não atender, mostra checklist visual dos pendentes (claro pro operador saber o que falta) e o botão fica `disabled`.

**Quando libera:**
- Botão "Validar como líder" abre um painel com:
  - Resumo: quantas janelas/turnos serão validados
  - Campo "Nome do líder *" pré-preenchido com nome do profile logado, editável
  - `SignaturePad` única
  - Botões "Cancelar" e "Confirmar validação"
- Ao confirmar: aplica `status = validado` + `liderNome` + `assinaturaLider` + `liderAssinouEm` em **todos os turnos da limpeza ativos** (chamadas `salvarTurno` em série, com auditoria via `insertLimpezaEdicao`).
- O PTP **não muda de estrutura** — não há "validação do líder" no PTP no banco; o líder valida o conjunto da folha através da limpeza, que é onde a tabela já tem essas colunas.

**Estado já validado:** se ambos os turnos da limpeza já estão `validado`, mostrar bloco verde "✓ Folha validada por {liderNome} em {data/hora}" no lugar do botão.

## 3. Bloquear acesso cruzado de turnos na limpeza

**Arquivo:** `src/routes/operador.verso.limpeza.tsx`

**Regra:** o operador logado em `12x36 Dia` **não consegue abrir** o card de `12x36 Noite` (e vice-versa). O card aparece visível (para visualização do status) mas com cadeado e não-clicável.

**Implementação:**
- Comparar `tn === turnoLogado` antes de permitir o `setTurnoSelecionado(tn)`.
- Se `tn !== turnoLogado`: card vira `<div>` (sem onClick), opacidade reduzida, ícone de cadeado e texto "Acesso restrito ao operador do turno {tn}".
- Card do próprio turno mantém destaque visual atual ("Seu turno").
- Proteção também no `if (turnoSelecionado)` no início do componente: se de algum jeito for setado um turno diferente do logado, redirecionar de volta.

## 4. Detalhes técnicos

| Item | Onde | O que muda |
|---|---|---|
| Snapshot de `jaConcluida` | `operador.verso.ptp.$janelaCodigo.tsx` | `useState(() => statusInicial !== 'pendente' && !== 'rascunho')` capturado uma vez |
| Remover validação do líder do turno | `operador.verso.limpeza.tsx` | Apagar blocos: "Validação do Líder", "Iniciar validação", formulário do líder, "Validado por..." |
| Bloqueio cruzado de turno | `operador.verso.limpeza.tsx` | Comparação com `turnoLogado` no map dos cards |
| Nova seção "Validação do Líder" | `operador.verso.tsx` | Componente `BlocoValidacaoLider` interno com derivações de `ptp.janelas` e `limpeza.turnos` |
| Reaproveitar `salvarTurno` | `operador.verso.tsx` | Loop em `TURNOS_ATIVOS_LIMPEZA` aplicando `assinaturaLider` em cada um |

Nada de migration neste passo — usa as colunas `lider_nome`/`assinatura_lider`/`lider_assinou_em` que já existem em `limpeza_turnos`.

## 5. Fora de escopo (não vou mexer)

- Banco/migrations
- Checklist FM09 (frente)
- Gestão e relatório
- Hooks `usePtpJanelas` / `useLimpezaTurnos` (a lógica de conflito já está OK desde o último ajuste)

