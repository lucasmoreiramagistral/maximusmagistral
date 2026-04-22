

## Ajuste de contraste no botão "Novo checklist" da home do operador

O botão "Novo checklist" hoje fica azul sólido o tempo todo (`destaque`), o que esconde o badge "Concluído" verde claro e quebra o padrão visual dos outros cards. Vamos padronizá-lo com os demais botões e usar o azul apenas como feedback de interação (hover/active).

### Mudanças

**`src/routes/operador.index.tsx`**
- Remover a prop `destaque` do `BotaoAcao` "Novo checklist" (passa a usar o estilo padrão branco/card com texto escuro, idêntico aos outros três botões).
- Como `destaque` deixa de ser usado, simplificar o componente `BotaoAcao` removendo a prop `destaque` e toda a sua lógica condicional (variantes de `className`, fundo do ícone e cor da descrição).
- Manter o estilo padrão já existente que inclui:
  - `bg-card` + `text-foreground` + `border-border` (branco com texto preto)
  - `hover:border-primary/50 hover:shadow-md` (borda azul ao passar o dedo)
  - Adicionar `active:bg-primary active:text-primary-foreground` para o feedback azul ao clicar/tocar (mobile e desktop).
  - Ícone continua dentro de `bg-primary-soft text-primary` (quadradinho azul claro), mantendo identidade visual sem dominar o card.

### Resultado visual

- Os 4 botões da grade ficam visualmente iguais: fundo branco, texto preto, ícone em azul claro.
- Badge "Concluído" verde fica perfeitamente legível sobre o fundo branco em qualquer um dos cards.
- Ao passar o dedo: borda azul + sombra (já existente).
- Ao tocar/clicar: o botão fica azul com texto branco momentaneamente, dando o feedback de ação.

Nenhum outro arquivo é alterado.

