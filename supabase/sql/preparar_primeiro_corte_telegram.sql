-- Prepara o proximo HH:20 para um envio manual controlado; nao agenda cron.
-- Execute antes do primeiro teste real do bot.
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
