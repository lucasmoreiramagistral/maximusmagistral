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

-- Ativado pelo SQL de agendamento, depois da implantacao da Edge Function.
-- Evita publicar automaticamente horas anteriores a entrada do bot em operacao.
create table if not exists public.telegram_hora_config (
  id smallint primary key check (id = 1),
  primeiro_corte_em timestamptz not null
);

comment on table public.telegram_hora_config is
  'Marco inicial do agendamento; os cortes de HH:20 seguintes sao recuperados pelo cron.';

create index if not exists telegram_hora_publicacoes_status
  on public.telegram_hora_publicacoes (status, criado_em desc);
create index if not exists telegram_hora_publicacoes_corte
  on public.telegram_hora_publicacoes (corte_em desc);
create index if not exists telegram_hora_publicacoes_falhas
  on public.telegram_hora_publicacoes (corte_em)
  where status = 'falhou' and revogado_em is null;

alter table public.telegram_hora_publicacoes enable row level security;
revoke all on public.telegram_hora_publicacoes from anon, authenticated;
grant select, insert, update on public.telegram_hora_publicacoes to service_role;

alter table public.telegram_hora_config enable row level security;
revoke all on public.telegram_hora_config from anon, authenticated;
grant select on public.telegram_hora_config to service_role;

commit;
