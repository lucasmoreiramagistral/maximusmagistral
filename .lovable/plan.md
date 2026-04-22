

## Análise do prompt do GPT

**Veredito:** O prompt está **muito bom** — escopo limitado, prioridades claras, não pede recriação, respeita o que já funciona. Bati cada ponto contra o código atual e está tudo coerente. Posso executar as 8 melhorias praticamente como descritas.

### Pontos onde o prompt está perfeito
- **Retry local da imagem** (Melhoria 1): a abordagem de resetar `imagemStatus` + `key/version` é exatamente o jeito certo dado o componente atual.
- **Busca no índice** (Melhoria 2): faz sentido, o `Input` do projeto já existe (`src/components/ui/input.tsx`).
- **Limpeza do hook** (Melhoria 4): confirmei que `getEntradaAtual` realmente não é mais usado em lugar nenhum do módulo — pode remover com segurança.
- **Preload anterior** (Melhoria 5), **auto-scroll do índice** (Melhoria 7), **fallback do header** (Melhoria 8): todos válidos e simples.

### Ajustes/melhorias que vou aplicar em cima do prompt

1. **Melhoria 3 (destaque do grupo ativo) — corrigir de verdade:** o prompt sugere trocar `bg-primary/8` por `bg-primary/[0.08]`. Verifiquei que o projeto usa Tailwind v4 — `bg-primary/8` **não é uma escala padrão** e provavelmente não está sendo gerado. Vou usar `bg-primary/10` (escala padrão e confiável) em vez de `bg-primary/[0.08]`, que é mais limpo e também funciona. Mesma lógica para a borda: `border-primary/40` está ok.

2. **Melhoria 6 (indicador de cache/offline) — refinar a regra:** o prompt diz "se hook estiver servindo manifest do cache **e** não houver rede, mostrar 'Consulta em cache'". Vou separar em duas mensagens distintas e mais úteis:
   - `!isOnline` → "Modo offline" (mais crítico, prioridade)
   - `fromCache && isOnline` → "Consulta em cache" (informativo)
   - Posicionado discretamente abaixo da toolbar, só uma linha pequena com ícone.

3. **Melhoria 2 (busca) — detalhe extra:** vou normalizar a busca (lowercase + trim + remover acentos) para "operacao" achar "Operação". Também vou esconder seções vazias quando o filtro estiver ativo (em vez de tentar manter a "seção anterior relevante", que o próprio prompt marcou como opcional e adiciona complexidade sem ganho real).

4. **Melhoria 7 (auto-scroll do índice) — detalhe técnico:** vou usar `scrollIntoView({ block: "center" })` num `useEffect` disparado quando `indiceOpen` vira true, com pequeno timeout para esperar o Sheet abrir. O prompt aceita scroll instantâneo, então uso `behavior: "auto"` para evitar jank.

### O que NÃO vou fazer (e o prompt acertou em não pedir)
- Não mexer em manifest, storage, banco, outras telas.
- Não adicionar "fit to width" nem mexer no zoom existente.
- Não tocar no `operador.it.tsx` (layout/index) — está pronto.

---

## Plano de execução

### Arquivo 1 — `src/hooks/use-it-document.ts`
- Remover `getEntradaAtual` (callback + tipo na interface) — confirmado que não é usado.

### Arquivo 2 — `src/routes/operador.it.$doc.tsx`

**a) Indicador de cache/offline (faixa discreta):**
- Abaixo da toolbar superior, renderizar uma linha fina com ícone `WifiOff` ou `Database`:
  - `!isOnline` → "Modo offline — usando dados em cache"
  - `itDoc.fromCache && isOnline` → "Consulta em cache"
  - online + fresh → nada.

**b) `PaginaImagem` — retry local + key:**
- Adicionar `useState<number>` para `tentativa` (incrementado pelo botão "Tentar novamente").
- Mudar `<img src={url}>` para `<img src={tentativa === 0 ? url : ${url}?r=${tentativa}}>` para forçar re-fetch.
- No clique do botão: `setImagemStatus("loading"); setTentativa(t => t+1)`.
- Adicionar `<Button>Tentar novamente</Button>` no overlay de erro (logo abaixo do subtítulo).

**c) `montarLabelTopo` — fallback robusto:**
- Trocar fallback final `Página ${paginaAtual}` por `Página ${paginaAtual} de ${totalPaginas}`.
- Passar `totalPaginas` como argumento da função.

**d) Preload da página anterior:**
- No mesmo `useEffect` do preload, adicionar lógica para `paginaAtual - 1` quando existir.

**e) `PainelIndice` — busca + auto-scroll + destaque corrigido:**
- Adicionar prop `indiceOpen` ou usar `useEffect` no componente pai que dispara scroll quando abre.
- Adicionar `useState` para `filtro`, com `<Input>` no topo (placeholder pedido pelo prompt).
- Função de normalização (lowercase, sem acento) para comparar `filtro` contra `entry.label` e `entry.numero`.
- Quando filtro ativo: filtrar entradas clicáveis (não-seção); esconder seções; se vazio → "Nenhum item encontrado".
- Trocar `bg-primary/8` por `bg-primary/10` para garantir compilação Tailwind.
- Adicionar `ref` no item ativo (primeira entrada da página atual) e `scrollIntoView({ block: "center", behavior: "auto" })` num `useEffect` quando o Sheet abrir.

### Critérios de aceitação
1. Erro de imagem mostra botão "Tentar novamente" funcional (recarrega só a imagem).
2. Drawer do índice tem campo de busca que filtra por número/label/passo/anexo (insensível a acento).
3. Grupo da página atual no índice fica visivelmente destacado (`bg-primary/10`).
4. `getEntradaAtual` removido do hook.
5. Preload tanto da próxima quanto da anterior.
6. Faixa discreta indica "Modo offline" ou "Consulta em cache" quando aplicável.
7. Drawer do índice abre já rolado até a página atual.
8. Header tem fallback "Página X de Y" se cair em caso estranho.
9. Nada do que já funciona quebra (TTL, prewarm, rodapé, zoom, overlay, etc.).

