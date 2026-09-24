-- Somente leitura. Executar apos 20260923100000_telegram_hora_publicacoes.sql.
-- Nenhum agendamento ou envio e criado por essa migration.
select
  to_regclass('public.telegram_hora_publicacoes') is not null as tabela_existe,
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'telegram_hora_publicacoes'
     and column_name in ('public_token', 'revogado_em', 'data_operacao',
                         'hora_codigo', 'status', 'snapshot')) as colunas_essenciais,
  (select relrowsecurity from pg_class
   where oid = 'public.telegram_hora_publicacoes'::regclass) as rls_ativo,
  has_table_privilege('anon', 'public.telegram_hora_publicacoes', 'SELECT') as anon_pode_ler,
  has_table_privilege('authenticated', 'public.telegram_hora_publicacoes', 'SELECT')
    as autenticado_pode_ler,
  has_table_privilege('service_role', 'public.telegram_hora_publicacoes', 'SELECT')
    as servico_pode_ler,
  (select count(*) from public.telegram_hora_publicacoes) as publicacoes;
