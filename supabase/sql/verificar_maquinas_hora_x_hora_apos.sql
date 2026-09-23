-- Somente leitura. Executar apos 20260922100000_maquinas_hora_x_hora.sql.
-- Esperado antes de novos lancamentos: 8 policies, 8 gatilhos de maquina,
-- 1 gatilho de hora, 10 horas historicas e nenhum operador sem maquina.
select
  (select count(*) from public.profiles
    where perfil = 'operador' and active = true and maquina_id is null
  ) as operadores_ativos_sem_maquina,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and policyname like 'maximus_maquina_escopo_%'
  ) as policies_maquina,
  (select count(*) from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and t.tgname like 'trg_maximus_maquina_%'
      and not t.tgisinternal
  ) as gatilhos_maquina,
  (select count(*) from pg_trigger
    where tgrelid = 'public.producao_horaria'::regclass
      and tgname = 'trg_maximus_travar_hora_finalizada'
      and not tgisinternal
  ) as gatilhos_hora,
  (select count(*) from public.producao_horaria
    where finalizado_em is null
  ) as horas_historicas_intactas,
  to_regprocedure('public.maximus_perfil_no_escopo_maquina(text)') is not null
    as funcao_escopo_maquina;
