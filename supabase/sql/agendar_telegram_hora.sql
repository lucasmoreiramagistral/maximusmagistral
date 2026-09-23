-- Executar somente depois de aplicar as migrations, implantar a Edge Function
-- e configurar os segredos MAXIMUS_CRON_SECRET, TELEGRAM_BOT_TOKEN e
-- TELEGRAM_CHAT_ID no projeto. Habilitar pg_cron e pg_net no Supabase.
-- Criar no Vault, sem colar valores neste arquivo:
--   maximus_project_url       = https://<projeto>.supabase.co
--   maximus_publishable_key   = chave publica do projeto
--   maximus_cron_secret       = mesmo segredo aleatorio da Edge Function
-- O minuto 20 vale para todas as horas; a funcao interpreta America/Manaus.

do $agenda$
begin
  if to_regclass('cron.job') is null or to_regnamespace('net') is null then
    raise exception 'Habilite pg_cron e pg_net antes de agendar.';
  end if;
  if (select count(*) from vault.decrypted_secrets
      where name in ('maximus_project_url', 'maximus_publishable_key', 'maximus_cron_secret')) <> 3 then
    raise exception 'Faltam segredos do agendamento no Supabase Vault.';
  end if;
  if not exists (select 1 from cron.job where jobname = 'maximus-telegram-hora') then
    perform cron.schedule(
      'maximus-telegram-hora',
      '20 * * * *',
      $comando$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets
                   where name = 'maximus_project_url') || '/functions/v1/hora-x-hora-telegram',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (select decrypted_secret from vault.decrypted_secrets
                       where name = 'maximus_publishable_key'),
            'X-Maximus-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets
                                     where name = 'maximus_cron_secret')
          ),
          body := '{}'::jsonb
        )
      $comando$
    );
  end if;
end;
$agenda$;
