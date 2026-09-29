-- Somente leitura. Não mostra valores de segredos nem envia mensagens.
select
  (select count(*) from public.telegram_hora_config where id = 1) as configuracoes_ativas,
  (select count(*) from public.telegram_hora_publicacoes) as publicacoes,
  (select count(*) from cron.job where jobname = 'maximus-telegram-hora') as tarefas_cron,
  (select count(*) from vault.decrypted_secrets
    where name in ('maximus_project_url', 'maximus_publishable_key', 'maximus_cron_secret'))
    as segredos_vault_presentes;
