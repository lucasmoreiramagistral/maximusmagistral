-- Executar somente depois de aplicar as migrations, implantar a Edge Function
-- e configurar os Edge Secrets MAXIMUS_CRON_SECRET, TELEGRAM_BOT_TOKEN,
-- TELEGRAM_CHAT_ID e MAXIMUS_APP_URL (URL HTTPS publicada do aplicativo).
-- Revogar antes o token do bot que apareceu na captura; validar a rota publica
-- e a resposta da Edge Function antes de habilitar pg_cron e pg_net.
-- Criar no Vault, sem colar valores neste arquivo:
--   maximus_project_url       = https://<projeto>.supabase.co
--   maximus_publishable_key   = chave publica do projeto
--   maximus_cron_secret       = mesmo segredo aleatorio da Edge Function
-- O cron tenta a cada 5 minutos. O primeiro corte e o proximo HH:20
-- estritamente depois da ativacao (10:19 -> 10:20; 10:30 -> 11:20);
-- a funcao recupera cortes HH:20 perdidos, mantendo o corte original.

do $agenda$
begin
  if to_regclass('cron.job') is null or to_regnamespace('net') is null then
    raise exception 'Habilite pg_cron e pg_net antes de agendar.';
  end if;
  if (select count(*) from vault.decrypted_secrets
      where name in ('maximus_project_url', 'maximus_publishable_key', 'maximus_cron_secret')) <> 3 then
    raise exception 'Faltam segredos do agendamento no Supabase Vault.';
  end if;
  insert into public.telegram_hora_config (id, primeiro_corte_em)
  values (
    1,
    case
      when now() < date_trunc('hour', now()) + interval '20 minutes'
        then date_trunc('hour', now()) + interval '20 minutes'
      else date_trunc('hour', now()) + interval '1 hour 20 minutes'
    end
  )
  on conflict (id) do nothing;

  -- Uma nova execucao deste SQL troca um agendamento antigo de HH:20
  -- sem deslocar o marco inicial nem criar duas tarefas cron.
  if exists (select 1 from cron.job where jobname = 'maximus-telegram-hora') then
    perform cron.unschedule('maximus-telegram-hora');
  end if;
  perform cron.schedule(
    'maximus-telegram-hora',
    '*/5 * * * *',
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
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      )
    $comando$
  );
end;
$agenda$;
