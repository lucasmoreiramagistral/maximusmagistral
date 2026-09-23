-- Somente leitura. Rode no SQL Editor antes das migrations de 23/09.
-- Nao retorna nomes de pessoas, senhas, tokens ou registros de producao.
with tabelas(tabela, dono) as (
  values
    ('checklists', 'user_id'),
    ('anomalias', 'user_id'),
    ('ptp_janelas', 'operador_user_id'),
    ('limpeza_turnos', 'operador_user_id'),
    ('producao_horaria', 'operador_user_id'),
    ('producao_apoio', 'operador_user_id'),
    ('producao_tanques', 'operador_user_id'),
    ('producao_passagem_turno', 'operador_user_id')
), inspecao as (
  select
    t.tabela,
    to_regclass(format('public.%I', t.tabela)) is not null as existe,
    exists (
      select 1 from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = t.tabela and c.column_name = 'maquina'
    ) as coluna_maquina,
    exists (
      select 1 from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = t.tabela and c.column_name = t.dono
    ) as coluna_dono
  from tabelas t
)
select jsonb_pretty(jsonb_build_object(
  'tabelas', (
    select jsonb_agg(to_jsonb(i) order by i.tabela) from inspecao i
  ),
  'funcao_touch_updated_at',
    to_regprocedure('public.touch_updated_at()') is not null,
  'maquinas_historicas', (
    select jsonb_agg(jsonb_build_object('maquina', maquina, 'linhas', total)
                     order by maquina)
      from (
        select maquina, count(*) as total
          from public.producao_horaria group by maquina
      ) m
  ),
  'restricoes_maquina', (
    select jsonb_agg(jsonb_build_object(
      'tabela', c.relname, 'nome', k.conname,
      'definicao', pg_get_constraintdef(k.oid)
    ) order by c.relname, k.conname)
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('profiles', 'producao_horaria')
       and pg_get_constraintdef(k.oid) ilike '%maquina%'
  )
)) as verificacao;
