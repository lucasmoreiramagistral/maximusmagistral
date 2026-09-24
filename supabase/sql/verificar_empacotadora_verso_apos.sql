-- Somente leitura. Executar depois de 20260922101000_empacotadora_verso.sql.
select
  to_regclass('public.empacotadora_bobinas') is not null as bobinas_existe,
  to_regclass('public.empacotadora_consolidacoes') is not null as consolidacoes_existe,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename in ('empacotadora_bobinas', 'empacotadora_consolidacoes')
     and policyname in (
       'emp_bobinas_select', 'emp_bobinas_insert', 'emp_bobinas_update',
       'emp_consolidacoes_select', 'emp_consolidacoes_insert',
       'emp_consolidacoes_update'
     )) as policies_verso,
  (select count(*) from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('empacotadora_bobinas', 'empacotadora_consolidacoes')
      and t.tgname in (
        'trg_emp_bobinas_contexto', 'trg_emp_bobinas_updated_at',
        'trg_emp_consolidacoes_contexto', 'trg_emp_consolidacoes_updated_at'
      ) and not t.tgisinternal) as gatilhos_verso,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('empacotadora_bobinas', 'empacotadora_consolidacoes')
      and c.relrowsecurity) as tabelas_com_rls,
  (select count(*) from public.empacotadora_bobinas) as bobinas_existentes,
  (select count(*) from public.empacotadora_consolidacoes) as consolidacoes_existentes;
