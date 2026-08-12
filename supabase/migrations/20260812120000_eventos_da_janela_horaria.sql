-- =====================================================================
-- v2.0 — Migration 10: o que aconteceu em cada janela do Hora x Hora
--
-- REQUER: migrations 01 a 09 aplicadas.
--
-- POR QUE
--   Hoje a linha horária só sabe dizer "não rodou" e um único
--   `motivo_reinicio`, que existe para zerar o acumulado (troca de sabor,
--   troca de tamanho, CIP). Isso deixa de fora tudo o que de fato consome
--   a hora na Enchedora: setup, PCM, refeição, rendendo a linha.
--
--   Sem esse dado, uma janela com produção baixa é indistinguível de uma
--   janela em que a equipe estava almoçando — e é exatamente essa distinção
--   que separa "rotina não cumprida" de "parada justificada" no farol.
--
-- SETUP NÃO É UM VALOR DA LISTA
--   Na Enchedora, setup É troca de sabor, troca de tamanho ou CIP/assepsia.
--   Guardar "setup" ao lado desses três criaria a pergunta redundante "teve
--   setup? e foi troca de sabor?" para a mesma informação. Houve setup
--   exatamente quando a janela tem um destes três — e é isso que faz o
--   Pós-setup do FM09 deixar de ser "não aplicável".
--
-- MULTIVALORADO DE PROPÓSITO
--   Uma hora comporta mais de um evento: a refeição cai no meio de um CIP, e
--   troca de sabor pode vir junto com troca de tamanho. Guardar um valor só
--   obrigaria o operador a escolher qual verdade contar.
--
-- NÃO SUBSTITUI `motivo_reinicio`
--   Aquele campo continua governando o reinício do acumulado, que é uma
--   regra de cálculo. O app passa a marcar os dois juntos quando o evento
--   for troca de sabor, troca de tamanho ou CIP — o operador toca uma vez.
-- =====================================================================

begin;

alter table public.producao_horaria
  add column if not exists eventos text[] not null default '{}';

comment on column public.producao_horaria.eventos is
  'O que ocupou a janela. Setup = troca_sabor, troca_tamanho ou cip_assepsia. Nao setup = pcm, refeicao, rendendo_linha. Multivalorado.';

-- Vocabulário fechado. Texto livre aqui viraria os 16 "Bruno" de novo.
alter table public.producao_horaria
  drop constraint if exists producao_horaria_eventos_check;
alter table public.producao_horaria
  add constraint producao_horaria_eventos_check check (
    eventos <@ array[
      -- setup:
      'troca_sabor',
      'troca_tamanho',
      'cip_assepsia',
      -- não é setup:
      'pcm',
      'refeicao',
      'rendendo_linha'
    ]::text[]
  );

-- Consulta típica do Sup/Coord: "quantas horas de CIP no mês?".
create index if not exists idx_producao_horaria_eventos
  on public.producao_horaria using gin (eventos);

commit;


-- =====================================================================
-- CONFERÊNCIA
-- =====================================================================
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'producao_horaria'
  and column_name = 'eventos';
-- esperado: eventos | ARRAY | '{}'::text[]

select conname from pg_constraint
where conrelid = 'public.producao_horaria'::regclass
  and conname = 'producao_horaria_eventos_check';
-- esperado: 1 linha


-- =====================================================================
-- DESFAZER
-- =====================================================================
-- begin;
--   drop index if exists public.idx_producao_horaria_eventos;
--   alter table public.producao_horaria
--     drop constraint if exists producao_horaria_eventos_check;
--   alter table public.producao_horaria drop column if exists eventos;
-- commit;


-- =====================================================================
-- O QUE VEM DEPOIS, e ainda não está aqui
-- =====================================================================
-- Estes eventos são a matéria-prima do `ParadaJustificada` que o cálculo de
-- cumprimento já aceita (lib/farol/farol.ts). Hoje aquela lista chega vazia,
-- então todo turno sem registro cai em "sem informação".
--
-- Quando o Hora x Hora estiver em uso, dá para derivar: janela inteira em
-- CIP, PCM ou refeição é parada justificada e sai do denominador. Isso é
-- uma decisão de regra — quantas horas justificam o turno inteiro? — e
-- precisa do gerente, não do código.
--
-- O outro fio solto, mais interessante: hoje o operador "descobre o setup na
-- hora" e o Pós-setup do FM09 fica NA quando não houve. Com estes eventos, o
-- app passa a SABER que houve setup na janela — e pode cobrar o Pós-setup em
-- vez de esperar que alguém lembre. Isso muda o farol, então também é
-- decisão de regra, não de código.
