-- Prepara o agendador e a chamada HTTP do Telegram, sem criar cron ou enviar.
-- O job só será criado depois dos segredos Edge e Vault estarem configurados.
begin;

create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

commit;
