-- Consulta somente de leitura após as migrações 20260928100000 e 20260928110000.
-- Todas as colunas booleanas devem retornar true.
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
  exists (
    select 1 from pg_trigger
     where tgrelid = 'public.producao_horaria'::regclass
       and tgname = 'trg_maximus_exigir_operador_antes_lider'
       and not tgisinternal
  ) as gatilho_ordem_assinaturas,
  coalesce(
    pg_get_functiondef(
      to_regprocedure('public.maximus_exigir_hora_encerrada_manaus(date,text)')
    ) like '%20 minutes%', false
  ) as prazo_vinte_minutos_ativo,
  has_function_privilege(
    'authenticated', 'public.rpc_assinar_hora_operador(uuid,timestamptz,text)', 'EXECUTE'
  ) as rpc_permitida_autenticado,
  not has_function_privilege(
    'anon', 'public.rpc_assinar_hora_operador(uuid,timestamptz,text)', 'EXECUTE'
  ) as rpc_negada_anonimo;
