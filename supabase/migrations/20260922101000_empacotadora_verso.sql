-- Verso do Relatorio Operacional das Empacotadoras 2 e 3.
-- Bobinas e fechamento por produto pertencem a uma folha por maquina/dia;
-- cada linha tem id proprio, pois a ordem pode coincidir entre tablets.
-- Aplicar depois de 20260922100000_maquinas_hora_x_hora.sql.
begin;

create table if not exists public.empacotadora_bobinas (
  id text primary key,
  folha_dia_key text not null,
  data_operacao date not null,
  maquina text not null check (maquina in ('Empacotadora 2', 'Empacotadora 3')),
  linha text not null,
  codigo_equipamento text not null,
  turno text not null check (turno in ('12x36 Dia', '12x36 Noite', '3º Turno')),
  ordem integer not null check (ordem > 0),
  produto text,
  especificacao_filme text,
  fabricante text,
  numero_lote text,
  peso_liquido_inicial_kg numeric(12,3) check (peso_liquido_inicial_kg >= 0),
  peso_bruto_final_kg numeric(12,3) check (peso_bruto_final_kg >= 0),
  hora_inicio text check (
    hora_inicio is null or hora_inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  hora_termino text check (
    hora_termino is null or hora_termino ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  operador_user_id uuid not null references auth.users(id) on delete restrict,
  operador_login text,
  operador_nome text,
  ultima_edicao_por_user_id uuid references auth.users(id) on delete set null,
  ultima_edicao_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empacotadora_bobinas_contexto check (
    (maquina = 'Empacotadora 2' and linha = 'Linha 2' and codigo_equipamento = 'LE-02')
    or (maquina = 'Empacotadora 3' and linha = 'Linha 3' and codigo_equipamento = 'LE-03')
  ),
  constraint empacotadora_bobinas_fim_com_inicio check (
    hora_termino is null or hora_inicio is not null
  )
);

create table if not exists public.empacotadora_consolidacoes (
  id text primary key,
  folha_dia_key text not null,
  data_operacao date not null,
  maquina text not null check (maquina in ('Empacotadora 2', 'Empacotadora 3')),
  linha text not null,
  codigo_equipamento text not null,
  turno text not null check (turno in ('12x36 Dia', '12x36 Noite', '3º Turno')),
  ordem integer not null check (ordem > 0),
  sabor text,
  tamanho text,
  hora_inicio text check (
    hora_inicio is null or hora_inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  hora_final text check (
    hora_final is null or hora_final ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  quantidade_paletes integer check (quantidade_paletes >= 0),
  quebra_pacotes integer check (quebra_pacotes >= 0),
  total_pacotes integer check (total_pacotes >= 0),
  pacotes_por_palete integer check (pacotes_por_palete > 0),
  operador_user_id uuid not null references auth.users(id) on delete restrict,
  operador_login text,
  operador_nome text,
  ultima_edicao_por_user_id uuid references auth.users(id) on delete set null,
  ultima_edicao_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empacotadora_consolidacoes_contexto check (
    (maquina = 'Empacotadora 2' and linha = 'Linha 2' and codigo_equipamento = 'LE-02')
    or (maquina = 'Empacotadora 3' and linha = 'Linha 3' and codigo_equipamento = 'LE-03')
  ),
  constraint empacotadora_consolidacoes_fim_com_inicio check (
    hora_final is null or hora_inicio is not null
  ),
  constraint empacotadora_consolidacoes_total check (
    quantidade_paletes is null or quebra_pacotes is null
    or total_pacotes is null or pacotes_por_palete is null
    or total_pacotes::numeric =
      quantidade_paletes::numeric * pacotes_por_palete::numeric + quebra_pacotes::numeric
  )
);

comment on column public.empacotadora_consolidacoes.quebra_pacotes is
  'Pacotes do palete incompleto; pct no formulario significa pacotes, nao porcentagem.';
comment on column public.empacotadora_consolidacoes.pacotes_por_palete is
  'Capacidade historica usada para conferir o total; opcional enquanto a linha esta aberta.';

create index if not exists empacotadora_bobinas_folha_ordem
  on public.empacotadora_bobinas (maquina, data_operacao, ordem);
create index if not exists empacotadora_consolidacoes_folha_ordem
  on public.empacotadora_consolidacoes (maquina, data_operacao, ordem);
create index if not exists empacotadora_bobinas_operador
  on public.empacotadora_bobinas (operador_user_id, folha_dia_key);
create index if not exists empacotadora_consolidacoes_operador
  on public.empacotadora_consolidacoes (operador_user_id, folha_dia_key);

alter table public.empacotadora_bobinas enable row level security;
alter table public.empacotadora_consolidacoes enable row level security;

grant select, insert, update on public.empacotadora_bobinas to authenticated;
grant select, insert, update on public.empacotadora_consolidacoes to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'empacotadora_bobinas' and policyname = 'emp_bobinas_select'
  ) then
    create policy emp_bobinas_select on public.empacotadora_bobinas
      for select to authenticated using (
        public.is_gestao(auth.uid())
        or public.maximus_operador_da_maquina(maquina)
      );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'empacotadora_bobinas' and policyname = 'emp_bobinas_insert'
  ) then
    create policy emp_bobinas_insert on public.empacotadora_bobinas
      for insert to authenticated with check (
        operador_user_id = auth.uid()
        and public.maximus_operador_da_maquina(maquina)
      );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'empacotadora_bobinas' and policyname = 'emp_bobinas_update'
  ) then
    create policy emp_bobinas_update on public.empacotadora_bobinas
      for update to authenticated
      using (public.maximus_operador_da_maquina(maquina))
      with check (public.maximus_operador_da_maquina(maquina));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'empacotadora_consolidacoes' and policyname = 'emp_consolidacoes_select'
  ) then
    create policy emp_consolidacoes_select on public.empacotadora_consolidacoes
      for select to authenticated using (
        public.is_gestao(auth.uid())
        or public.maximus_operador_da_maquina(maquina)
      );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'empacotadora_consolidacoes' and policyname = 'emp_consolidacoes_insert'
  ) then
    create policy emp_consolidacoes_insert on public.empacotadora_consolidacoes
      for insert to authenticated with check (
        operador_user_id = auth.uid()
        and public.maximus_operador_da_maquina(maquina)
      );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'empacotadora_consolidacoes' and policyname = 'emp_consolidacoes_update'
  ) then
    create policy emp_consolidacoes_update on public.empacotadora_consolidacoes
      for update to authenticated
      using (public.maximus_operador_da_maquina(maquina))
      with check (public.maximus_operador_da_maquina(maquina));
  end if;
end;
$$;

-- Uma bobina pode ser aberta num turno e encerrada pelo operador seguinte.
-- A edicao dos campos fisicos e permitida, mas a identidade da folha e o
-- criador original nao podem ser trocados por UPDATE.
create or replace function public.maximus_preservar_contexto_empacotadora()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.ultima_edicao_por_user_id := null;
    new.ultima_edicao_em := null;
    return new;
  end if;

  if (new.id, new.folha_dia_key, new.data_operacao, new.maquina,
      new.linha, new.codigo_equipamento, new.turno, new.operador_user_id,
      new.created_at)
     is distinct from
     (old.id, old.folha_dia_key, old.data_operacao, old.maquina,
      old.linha, old.codigo_equipamento, old.turno, old.operador_user_id,
      old.created_at) then
    raise exception 'Nao e permitido mudar a folha ou o operador original do verso.'
      using errcode = '42501';
  end if;
  new.ultima_edicao_por_user_id := coalesce(auth.uid(), old.ultima_edicao_por_user_id);
  new.ultima_edicao_em := clock_timestamp();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgrelid = 'public.empacotadora_bobinas'::regclass
      and tgname = 'trg_emp_bobinas_contexto' and not tgisinternal
  ) then
    create trigger trg_emp_bobinas_contexto
      before insert or update on public.empacotadora_bobinas
      for each row execute function public.maximus_preservar_contexto_empacotadora();
  end if;
  if not exists (
    select 1 from pg_trigger where tgrelid = 'public.empacotadora_consolidacoes'::regclass
      and tgname = 'trg_emp_consolidacoes_contexto' and not tgisinternal
  ) then
    create trigger trg_emp_consolidacoes_contexto
      before insert or update on public.empacotadora_consolidacoes
      for each row execute function public.maximus_preservar_contexto_empacotadora();
  end if;
  if not exists (
    select 1 from pg_trigger where tgrelid = 'public.empacotadora_bobinas'::regclass
      and tgname = 'trg_emp_bobinas_updated_at' and not tgisinternal
  ) then
    create trigger trg_emp_bobinas_updated_at
      before update on public.empacotadora_bobinas
      for each row execute function public.touch_updated_at();
  end if;
  if not exists (
    select 1 from pg_trigger where tgrelid = 'public.empacotadora_consolidacoes'::regclass
      and tgname = 'trg_emp_consolidacoes_updated_at' and not tgisinternal
  ) then
    create trigger trg_emp_consolidacoes_updated_at
      before update on public.empacotadora_consolidacoes
      for each row execute function public.touch_updated_at();
  end if;
end;
$$;

commit;
