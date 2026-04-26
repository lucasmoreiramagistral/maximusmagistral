# Resoluções de NC/NR + remover Manutenção do login

## Parte 1 — Marcar NC/NR como resolvida em `/gestao/nao-conformidades`

### Como vai funcionar (fluxo)

1. Operador registra NC no checklist ou NR na limpeza (já existe).
2. A linha aparece em `/gestao/nao-conformidades` com novo status **Pendente**.
3. A gestão resolve na linha física e clica em **"Marcar como resolvida"**.
4. Abre um diálogo pedindo:
   - **O que foi feito** (texto, obrigatório)
   - **Quando foi resolvido** (data/hora, padrão = agora)
5. Ao confirmar, a linha vira badge verde **Resolvida** com autor, data e descrição. Aparece botão **"Reabrir"** em caso de engano.
6. Novo filtro **Status** no topo: Todas / Pendentes / Resolvidas (padrão: Pendentes).
7. Novos KPIs **Pendentes** e **Resolvidas no período** ao lado dos cards já existentes.

### Onde os dados moram

Como NCs e NRs são derivados dos JSONs em `checklists.respostas` e `limpeza_turnos.itens`, criamos uma tabela só para a "resolução", referenciando o registro de origem por chave composta.

Nova tabela `nao_conformidade_resolucoes`:
- `id` uuid pk
- `origem` text (`checklist` | `limpeza`)
- `origem_id` text — id do checklist ou do limpeza_turno
- `item_numero` text
- `data_operacao` date
- `turno` text
- `resolvido_em` timestamptz
- `o_que_foi_feito` text not null
- `resolvido_por_user_id` uuid (auth.users)
- `resolvido_por_login` text
- `resolvido_por_nome` text
- `criado_em` timestamptz default now()
- Unique (`origem`, `origem_id`, `item_numero`)

RLS:
- SELECT: usuário autenticado.
- INSERT/UPDATE/DELETE: apenas perfil `gestao` (mesmo mecanismo que as outras telas de gestão usam — checagem via `profiles.perfil`).

Índices em (`origem`, `origem_id`) e (`data_operacao`).

### Mudanças no front

Arquivos novos:
- `src/lib/nao-conformidades/resolucoes.ts` — `listarResolucoes`, `marcarResolvida`, `reabrir`, tipos e helper `chaveRegistro(r)` = `${origem}::${origemId}::${itemNumero}`.
- `src/hooks/use-nc-resolucoes.ts` — fetch + realtime na tabela.
- `src/components/nc-resolver-dialog.tsx` — diálogo com "o que foi feito" e "quando".

Arquivos editados:
- `src/lib/checklist/nao-conformidades.ts` — `RegistroNcNr` ganha `origemId: string` para fechar a chave composta.
- `src/routes/gestao.nao-conformidades.tsx` — merge das resoluções nos registros, filtro de status, novos KPIs e nova coluna **Status / Ação** com botão Marcar como resolvida / Reabrir.

Sem qualquer integração com a manutenção.

## Parte 2 — Remover "Manutenção" do app

Como vocês já usam o Sigma para manutenção, removemos o perfil do app:

### Tela de login (`src/routes/index.tsx`)
- Remover o `PerfilCard` de **Manutenção**.
- Mudar o grid de perfis de `md:grid-cols-3` para `md:grid-cols-2`.
- Remover o ramo `perfil === "manutencao" ? "/manutencao" : ...` dos dois `navigate({ to: ... })`.
- Remover o ícone `Wrench` se não for mais usado.

### Roteamento e guard
- `src/hooks/use-guard.ts` — remover o desvio para `/manutencao` no fallback de redirecionamento. Se um usuário com perfil `manutencao` ainda existir no banco e logar, fazer logout com mensagem **"Perfil de manutenção foi descontinuado. Use o Sigma."**.

### Rotas a apagar
- `src/routes/manutencao.index.tsx`
- `src/routes/manutencao.anomalias.tsx`
- `src/routes/manutencao.anomalia.nova.tsx`
- `src/routes/manutencao.filtros.tsx`
- `src/routes/manutencao.visualizar.anomalia.$id.tsx`
- `src/components/anomalia-detalhe-manutencao.tsx`

`src/routeTree.gen.ts` é regenerado automaticamente pelo Vite plugin, não precisa editar manualmente.

### Cadastro de usuários (`src/routes/gestao.usuarios.tsx`)
- Remover a opção `<SelectItem value="manutencao">Manutenção</SelectItem>` do select de perfil ao criar/editar usuário.

### O que NÃO vamos mexer
- `Perfil` e `ModuloAcesso` em `src/lib/checklist/types.ts` continuam aceitando `"manutencao"` como valor legado, pra não quebrar dados antigos no banco (anomalias antigas têm `responsavel_manutencao`, etc.). Só não é mais um perfil selecionável/utilizado no app.
- Telas de anomalia da gestão continuam funcionando normalmente — gestão segue tratando anomalias como hoje.

## Critérios de aceite

1. Login mostra só **Operador** e **Gestão Industrial**.
2. Rotas `/manutencao/*` não existem mais e o build passa limpo.
3. Cadastro de usuário não permite mais criar perfil "manutencao".
4. Tabela `nao_conformidade_resolucoes` criada com RLS correta.
5. Cada linha de NC/NR mostra **Pendente** ou **Resolvida**.
6. Botão **Marcar como resolvida** abre diálogo, exige descrição, grava no banco e atualiza a linha sem reload.
7. Botão **Reabrir** apaga a resolução.
8. Filtro **Status** funciona com os filtros já existentes.
9. KPIs **Pendentes** e **Resolvidas** refletem o período/filtros.
10. Realtime: outra pessoa da gestão resolve → tela atualiza sozinha.
