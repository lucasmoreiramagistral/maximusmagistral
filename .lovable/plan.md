# Hora x Hora — Relatório Operacional Horário da Enchedora (L3)

Nova funcionalidade no `/operador`: registro da produção hora a hora da Enchedora da Linha 3, seguindo o formulário oficial FM08 PSGQ07 (rev. 04) — frente.

## Escopo desta etapa

Somente a **tabela horária** da frente (colunas HORA, META, QUANTIDADE HORÁRIA, QUANTIDADE ACUMULADA, TEMPO DE PARADA e ASSINATURA DO LÍDER).

Ficam mapeados para etapas seguintes, já conferidos no modelo Excel:
- Frente: Checklist de Apoio (8 atividades × marcação 1ºT/2ºT/3ºT), Controle de Assepsia (5 trocas de sabor com início/fim), Controle de CIP (7 etapas, com assinatura do operador executante e liberação do CQ com horário).
- Verso: Registro dos tanques de xarope (18 linhas: sabor, tamanho, nº tanque, lote, qtd inicial/final em L, hora início/término) e Passagem de Turno (3 blocos de ocorrências — 1ºT/12x36 Dia, 2ºT/12x36 Noite, 3ºT).


## Como vai funcionar

Cada dia operacional tem 24 linhas horárias, de 06:00 às 06:00 do dia seguinte — exatamente como no papel. O operador só enxerga e edita as horas do **seu turno** (Dia 06:00–18:00, Noite 18:00–06:00), podendo preencher e corrigir qualquer hora do próprio turno a qualquer momento.

Por linha o operador informa:
- **Meta** — digitada por ele (varia por produto/tamanho); ao digitar uma meta, ela é replicada para as horas seguintes vazias do turno, e ele pode sobrescrever quando o produto muda.
- **Quantidade horária** — número produzido, ou marcar "não rodou" (equivale ao traço "—" do papel).
- **Tempo de parada (min)**.
- **Quantidade acumulada** — calculada automaticamente pelo app, nunca digitada.

### Regra do acumulado

O acumulado soma as quantidades horárias e **zera** em dois casos:
1. Na virada de turno (06:00 e 18:00).
2. Na **troca de produto** — seja troca de sabor (ex.: Tauá → M. Gold) ou troca de tamanho do mesmo sabor (ex.: Regente 1L → Regente 2L), e também em CIP. É isso que explica o 07/07 reiniciando em 1.477 às 10:00.

Na prática, cada bloco de acumulado é um "produto rodando". Ao marcar a troca na linha da hora, o operador informa o sabor e o tamanho do novo produto; o app zera o acumulado a partir dali, recalcula as horas seguintes e passa a exibir qual produto está sendo contado em cada bloco. Como cada produto/tamanho tem sua própria meta, a meta digitada também vale a partir daquele bloco.


### Assinatura do líder

Cada linha tem espaço para assinatura do líder "a cada checagem", igual ao papel — reaproveita o mesmo componente de assinatura digital já usado no checklist e na limpeza, registrando nome e horário.

## Telas

- **Card novo no `/operador`**: "Hora x Hora — Enchedora L3", com badge de progresso (ex.: 8/12 horas do turno lançadas).
- **`/operador/hora-x-hora`**: lista das 12 horas do turno ativo, cada uma como um cartão grande e tocável (padrão dos cards atuais), mostrando hora, meta, quantidade, acumulado e parada. Horas futuras aparecem bloqueadas até chegar o horário.
- **Gestão**: a folha do dia passa a exibir um bloco "Hora x Hora" por turno, com total produzido, atingimento da meta, total de minutos parados e as horas não preenchidas em destaque — mesma lógica de "janelas faltantes" já usada no PTP.

## Detalhes técnicos

- Nova tabela `producao_horaria` no Supabase, uma linha por hora: `folha_dia_key`, `data_operacao`, `linha`, `maquina`, `hora_codigo` (H01..H24), `hora_inicio`, `hora_fim`, `turno`, `meta`, `quantidade`, `nao_rodou`, `tempo_parada_min`, `reinicia_acumulado`, `produto_sabor`, `produto_tamanho`, `motivo_reinicio` (troca de sabor / troca de tamanho / CIP), dados do operador, assinatura do líder, `updated_at`. Com GRANTs para `authenticated`/`service_role`, RLS habilitada e índice em `(data_operacao, linha, maquina)`.
- Tabela de auditoria `producao_horaria_edicoes`, espelhando `ptp_janelas_edicoes`.
- `src/lib/producao/constants.ts` com as 24 faixas horárias e o mapeamento hora → turno (reaproveitando `escalas.ts`).
- `src/lib/producao/acumulado.ts` — função pura que recebe as horas do dia e devolve o acumulado de cada uma e o produto vigente, aplicando as regras de reset (virada de turno + troca de produto/tamanho/CIP). Coberta por testes unitários com os números reais dos PDFs de 07 a 10/07.

- `src/lib/producao/supabase-storage.ts` e `src/hooks/use-producao-horaria.ts` seguindo exatamente o padrão de `use-ptp-janelas` (fila offline, `ConflitoVersaoError`, erros de aplicação propagados para o toast).
- Rota `src/routes/operador.hora-x-hora.tsx` + card em `operador.index.tsx`; resumo na gestão via `resumo.ts` e badges do dia.

## Ordem de execução

O SQL vem primeiro: você cola no SQL Editor do seu Supabase e, com as tabelas já existindo, eu construo o código todo e você já testa funcionando de imediato (sem tela quebrada esperando o banco).

1. Você roda o SQL abaixo no Supabase.
2. Constantes, cálculo do acumulado e testes.
3. Storage + hook com fila offline.
4. Tela do operador e card na home.
5. Bloco na gestão (folha do dia + relatório).

## SQL para colar no SQL Editor

```sql
-- ─── Tabela principal: uma linha por hora ────────────────────────────
create table if not exists public.producao_horaria (
  id uuid primary key default gen_random_uuid(),
  folha_dia_key text not null,
  data_operacao date not null,
  linha text not null,
  area text not null default 'Envase',
  maquina text not null,
  equipamento text,
  turno text not null,
  hora_codigo text not null,          -- H01..H24
  hora_inicio text not null,          -- '06:00'
  hora_fim text not null,             -- '07:00'
  meta integer,
  quantidade integer,
  nao_rodou boolean not null default false,
  tempo_parada_min integer,
  reinicia_acumulado boolean not null default false,
  motivo_reinicio text,               -- 'troca_sabor' | 'troca_tamanho' | 'cip'
  produto_sabor text,
  produto_tamanho text,
  observacao text,
  operador_login text,
  operador_nome text,
  operador_user_id uuid,
  lider_nome text,
  assinatura_lider jsonb,
  lider_assinou_em timestamptz,
  ultima_edicao_por_login text,
  ultima_edicao_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint producao_horaria_unica unique (folha_dia_key, hora_codigo, operador_user_id),
  constraint producao_horaria_qtd_valida
    check (quantidade is null or quantidade >= 0),
  constraint producao_horaria_parada_valida
    check (tempo_parada_min is null or (tempo_parada_min >= 0 and tempo_parada_min <= 60)),
  constraint producao_horaria_meta_valida
    check (meta is null or meta >= 0),
  constraint producao_horaria_nao_rodou_sem_qtd
    check (not nao_rodou or coalesce(quantidade, 0) = 0),
  constraint producao_horaria_reinicio_com_motivo
    check (not reinicia_acumulado or motivo_reinicio is not null)
);

grant select, insert, update, delete on public.producao_horaria to authenticated;
grant all on public.producao_horaria to service_role;

alter table public.producao_horaria enable row level security;

create policy "producao_horaria_select_autenticado"
  on public.producao_horaria for select to authenticated using (true);
create policy "producao_horaria_insert_autenticado"
  on public.producao_horaria for insert to authenticated with check (true);
create policy "producao_horaria_update_autenticado"
  on public.producao_horaria for update to authenticated using (true) with check (true);
create policy "producao_horaria_delete_autenticado"
  on public.producao_horaria for delete to authenticated using (true);

create index if not exists producao_horaria_folha_idx
  on public.producao_horaria (folha_dia_key);
create index if not exists producao_horaria_dia_idx
  on public.producao_horaria (data_operacao, linha, maquina);
create index if not exists producao_horaria_operador_idx
  on public.producao_horaria (operador_user_id);

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists producao_horaria_set_updated_at on public.producao_horaria;
create trigger producao_horaria_set_updated_at
  before update on public.producao_horaria
  for each row execute function public.set_updated_at();

-- ─── Auditoria de edições ────────────────────────────────────────────
create table if not exists public.producao_horaria_edicoes (
  id uuid primary key default gen_random_uuid(),
  producao_horaria_id uuid not null,
  folha_dia_key text not null,
  hora_codigo text not null,
  editado_por_login text not null,
  editado_por_nome text not null,
  motivo_edicao text,
  antes_json jsonb,
  depois_json jsonb,
  created_at timestamptz not null default now()
);

grant select, insert on public.producao_horaria_edicoes to authenticated;
grant all on public.producao_horaria_edicoes to service_role;

alter table public.producao_horaria_edicoes enable row level security;

create policy "producao_horaria_edicoes_select_autenticado"
  on public.producao_horaria_edicoes for select to authenticated using (true);
create policy "producao_horaria_edicoes_insert_autenticado"
  on public.producao_horaria_edicoes for insert to authenticated with check (true);

create index if not exists producao_horaria_edicoes_folha_idx
  on public.producao_horaria_edicoes (folha_dia_key, hora_codigo);
```

Depois dessa base pronta, sigo com as demais seções da frente (checklist de apoio, assepsia, CIP) e o verso (tanques e passagem de turno), reaproveitando a mesma folha do dia.

