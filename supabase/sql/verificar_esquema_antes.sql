-- Somente leitura. Execute primeiro no SQL Editor e envie o resultado ao Codex
-- antes das migrations que alteram o banco de producao.
select jsonb_pretty(jsonb_build_object(
  'colunas_profiles', (
    select jsonb_agg(column_name order by ordinal_position)
      from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
  ),
  'colunas_producao_horaria', (
    select jsonb_agg(column_name order by ordinal_position)
      from information_schema.columns
     where table_schema = 'public' and table_name = 'producao_horaria'
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object(
      'tabela', c.relname, 'nome', t.tgname, 'funcao', p.proname
    ) order by c.relname, t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid
     where n.nspname = 'public' and c.relname in ('profiles', 'producao_horaria')
       and not t.tgisinternal
  ),
  'policies', (
    select jsonb_agg(jsonb_build_object(
      'tabela', tablename, 'nome', policyname, 'comando', cmd,
      'permissiva', permissive
    ) order by tablename, policyname)
      from pg_policies
     where schemaname = 'public' and tablename in ('profiles', 'producao_horaria')
  ),
  'duplicatas_preenchidas_maquina_data_hora', (
    select count(*) from (
      select 1 from public.producao_horaria
       where quantidade is not null or nao_rodou is true
       group by maquina, data_operacao, hora_codigo
      having count(*) > 1
    ) duplicadas
  ),
  'funcoes_necessarias', jsonb_build_object(
    'is_gestao', to_regprocedure('public.is_gestao(uuid)') is not null,
    'maximus_operador_da_maquina', to_regprocedure('public.maximus_operador_da_maquina(text)') is not null
  )
)) as verificacao;
