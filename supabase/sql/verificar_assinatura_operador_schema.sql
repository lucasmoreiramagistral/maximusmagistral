-- Consulta somente de leitura após a migration 20260928100000.
-- As cinco colunas devem retornar true antes de publicar o novo app.
select
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'producao_horaria'
       and column_name = 'assinatura_operador' and data_type = 'jsonb'
  ) as coluna_assinatura_operador,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'producao_horaria'
       and column_name = 'operador_assinou_em'
       and data_type = 'timestamp with time zone'
  ) as coluna_operador_assinou_em,
  to_regprocedure('public.rpc_assinar_hora_operador(uuid,timestamptz,text)')
    is not null as rpc_operador_instalada,
  exists (
    select 1 from pg_trigger
     where tgrelid = 'public.producao_horaria'::regclass
       and tgname = 'trg_maximus_assinatura_operador_fim_turno'
       and not tgisinternal
  ) as gatilho_assinatura_operador,
  has_function_privilege(
    'authenticated', 'public.rpc_assinar_hora_operador(uuid,timestamptz,text)', 'EXECUTE'
  ) as rpc_permitida_autenticado;
