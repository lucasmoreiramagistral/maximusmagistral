-- Aplicar somente depois de validar os formularios e a migration Hora x Hora.
-- Uma reserva por periodo impede duas mensagens mesmo se o agendador repetir.
begin;

create table if not exists public.telegram_hora_publicacoes (
  id uuid primary key default gen_random_uuid(),
  data_operacao date not null,
  hora_codigo text not null check (hora_codigo ~ '^H(0[1-9]|1[0-9]|2[0-4])$'),
  public_token uuid not null unique default gen_random_uuid(),
  revogado_em timestamptz,
  corte_em timestamptz not null,
  status text not null check (status in ('reservado', 'enviado', 'falhou', 'incerto')),
  snapshot jsonb not null,
  message_id bigint,
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  constraint telegram_hora_publicacoes_periodo unique (data_operacao, hora_codigo),
  constraint telegram_hora_publicacoes_envio check (
    status <> 'enviado' or (message_id is not null and enviado_em is not null)
  )
);

comment on table public.telegram_hora_publicacoes is
  'Historico de publicacao horaria. Incerto nao e reenviado automaticamente para evitar duplicatas.';
comment on column public.telegram_hora_publicacoes.public_token is
  'Chave aleatoria do painel publico para um dia operacional; revogavel sem prazo automatico.';

create index if not exists telegram_hora_publicacoes_status
  on public.telegram_hora_publicacoes (status, criado_em desc);

alter table public.telegram_hora_publicacoes enable row level security;
revoke all on public.telegram_hora_publicacoes from anon, authenticated;
grant select, insert, update on public.telegram_hora_publicacoes to service_role;

commit;
