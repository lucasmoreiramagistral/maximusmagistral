## Plano final — cadastro de operador × checklists (zero divergência)

### Problemas identificados (5)

| # | Onde | Problema |
|---|---|---|
| 1 | `gestao.usuarios.tsx` (905–923) | `Input` texto livre em Equipe/Turno padrão — gestor digita "Manhã"/"Carol" e salva combo inválido |
| 2 | `usuarios.functions.ts` | Schema `z.string()` aceita qualquer coisa no servidor |
| 3 | `operador.contexto.tsx` (47/50) | Pré-seleciona padrão sem validar combo |
| 4 | `operador.it.ata.tsx` + `use-it-telemetria.ts` | Leem padrão direto, ignoram Turno Ativo (operador em extra abre com turno errado) |
| 5 | `gestao.it-analytics.tsx` (737) | Mostra `equipe_padrao · turno_padrao` cru, mascara cadastros corrompidos |

### Solução

**A. Cadastro com Select estruturado** (`gestao.usuarios.tsx`)
- Trocar 2 `Input` por **um único** `Select` "Escala padrão" usando `ESCALAS_AGRUPADAS` (12x36 / Administrativo / Turno fixo).
- Item: `value=id`, label "Karolainny · 12x36 Dia".
- Primeira opção: **"Sem escala fixa (extra/cobertura)"**.
- Edição com padrão inválido: pré-seleciona "Sem escala fixa" + aviso amarelo "Padrão atual (X·Y) não é uma escala oficial".
- `perfil=operador` + sem escala fixa: aviso "operadores sem escala fixa precisam definir o turno todo dia".
- Submit: deriva `equipePadrao/turnoPadrao` do `id` via `ESCALAS.find(...)`.

**B. Validação no servidor** (`usuarios.functions.ts`)
- `.refine(...)`: ambos nulos OU ambos preenchidos.
- Handler: se preenchidos, `escalaPorTurnoEquipe` com match exato (sem fallback). Senão `{ ok:false, erro:"Combinação inválida" }`.

**C. UX de operador sem turno**
- `operador.verso.limpeza.tsx` e `operador.verso.ptp.tsx`: trocar texto "Defina seu turno..." por card destaque com `<Link to="/operador">` e botão "Definir turno do dia agora".
- `operador.index.tsx`: quando `!ativo.turno && !ativo.temPadrao`, abrir `TurnoAtivoPicker` em modo edição automaticamente.

**D. Pré-seleção defensiva** (`operador.contexto.tsx`)
- Validar `escalaPorTurnoEquipe(turnoPadrao, equipePadrao)` antes do `useState`. Se null, iniciar selects vazios.

**E. Telas que ainda usam padrão direto**
- `operador.it.ata.tsx`: trocar `usuario?.turnoPadrao/equipePadrao` por `useTurnoAtivoDoDia(usuario)`.
- `use-it-telemetria.ts`: idem — telemetria reflete o que executa.
- `gestao.it-analytics.tsx`: usar `escalaPorTurnoEquipe(...)?.label`; senão badge `inválido`.

**F. Auditoria pós-deploy** (sem código)
```sql
SELECT id, nome, perfil, equipe_padrao, turno_padrao FROM profiles
WHERE (equipe_padrao IS NOT NULL OR turno_padrao IS NOT NULL) AND active = true;
```
Comparar com as 8 escalas e corrigir cadastros legados.

### Arquivos afetados (9)
- `src/routes/gestao.usuarios.tsx` (A)
- `src/lib/usuarios/usuarios.functions.ts` (B)
- `src/routes/operador.verso.limpeza.tsx` (C)
- `src/routes/operador.verso.ptp.tsx` (C)
- `src/routes/operador.index.tsx` (C)
- `src/routes/operador.contexto.tsx` (D)
- `src/routes/operador.it.ata.tsx` (E)
- `src/hooks/use-it-telemetria.ts` (E)
- `src/routes/gestao.it-analytics.tsx` (E)

### O que NÃO muda
Schema do banco, `useTurnoAtivoDoDia`, escalas, janelas PTP, ConflitoVersaoError, fila offline, login/useGuard.

### Garantias
1. Banco nunca mais aceita combo inválido (cliente + servidor).
2. Operador fixo: limpeza/PTP funcionam sem clique extra.
3. Operador extra: picker já aberto na home + CTA explícito nas telas internas.
4. ATA e telemetria refletem turno real.
5. Gestor enxerga cadastros corrompidos no analytics.
6. (F) identifica cadastros legados para correção manual.