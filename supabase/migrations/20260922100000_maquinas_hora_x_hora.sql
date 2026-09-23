-- Aplicar depois de 20260922090000_profiles_maquina_operador.sql.
-- Os registros antigos da Enchedora 3 permanecem intactos: finalizado_em NULL.
-- Um registro novo e confirmado ocupa uma unica maquina/data/hora. O aplicativo
-- deve priorizar finalizado_em nao nulo se tambem existir um registro legado.
begin;

alter table public.producao_horaria
  add column if not exists paletes_completos integer,
  add column if not exists quebra_pacotes integer,
  add column if not exists pacotes_por_palete integer,
  add column if not exists motivo_parada_codigo text,
  add column if not exists tempo_parada_metodo text,
  add column if not exists finalizado_em timestamptz;

comment on column public.producao_horaria.paletes_completos is
  'Paletes completos entregues na hora da empacotadora.';
comment on column public.producao_horaria.quebra_pacotes is
  'Pacotes do palete incompleto; quebra e quantidade, nao porcentagem.';
comment on column public.producao_horaria.pacotes_por_palete is
  'Capacidade do produto usada no calculo daquela hora; snapshot para auditoria.';
comment on column public.producao_horaria.finalizado_em is
  'Primeira confirmacao no servidor. NULL indica registro historico anterior a esta migracao.';
comment on column public.producao_horaria.motivo_parada_codigo is
  'Motivo principal padronizado da hora; minutos totais podem incluir mais de uma causa.';
comment on column public.producao_horaria.tempo_parada_metodo is
  'cadencia_equivalente: minutos de producao nao realizada pela cadencia, nao parada fisica medida. NULL nos registros antigos ou sem cadencia.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.producao_horaria'::regclass
      and conname = 'producao_horaria_paletes_nao_negativos'
  ) then
    alter table public.producao_horaria
      add constraint producao_horaria_paletes_nao_negativos check (
        (paletes_completos is null or paletes_completos >= 0)
        and (quebra_pacotes is null or quebra_pacotes >= 0)
        and (pacotes_por_palete is null or pacotes_por_palete > 0)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.producao_horaria'::regclass
      and conname = 'producao_horaria_empacotadora_total'
  ) then
    alter table public.producao_horaria
      add constraint producao_horaria_empacotadora_total check (
        maquina not in ('Empacotadora 2', 'Empacotadora 3')
        or finalizado_em is null
        or (
          nao_rodou is true
          and quantidade = 0
          and coalesce(paletes_completos, 0) = 0
          and coalesce(quebra_pacotes, 0) = 0
        )
        or (
          nao_rodou is false
          and paletes_completos is not null
          and quebra_pacotes is not null
          and pacotes_por_palete is not null
          and produto_tamanho is not null
          and quebra_pacotes < pacotes_por_palete
          and quantidade is not null
          and quantidade::numeric =
            paletes_completos::numeric * pacotes_por_palete::numeric
            + quebra_pacotes::numeric
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.producao_horaria'::regclass
      and conname = 'producao_horaria_empacotadora_capacidade'
  ) then
    alter table public.producao_horaria
      add constraint producao_horaria_empacotadora_capacidade check (
        maquina not in ('Empacotadora 2', 'Empacotadora 3')
        or finalizado_em is null
        or pacotes_por_palete is null
        or (
          produto_tamanho is not null
          and produto_tamanho in ('2L', '1,5L', '1L', '600ml', '350ml', '200ml')
          and pacotes_por_palete = case produto_tamanho
            when '2L' then 48
            when '1,5L' then 48
            when '1L' then 100
            when '600ml' then 120
            when '350ml' then 200
            when '200ml' then 240
            else null
          end
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.producao_horaria'::regclass
      and conname = 'producao_horaria_finalizada_chave'
  ) then
    alter table public.producao_horaria
      add constraint producao_horaria_finalizada_chave check (
        finalizado_em is null or (
          maquina is not null
          and maquina in ('Enchedora 2', 'Enchedora 3', 'Empacotadora 2', 'Empacotadora 3')
          and data_operacao is not null
          and hora_codigo is not null
          and hora_codigo ~ '^H(0[1-9]|1[0-9]|2[0-4])$'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.producao_horaria'::regclass
      and conname = 'producao_horaria_motivo_catalogo'
  ) then
    alter table public.producao_horaria
      add constraint producao_horaria_motivo_catalogo check (
        motivo_parada_codigo is null
        or motivo_parada_codigo in (
          'parada_sopradora', 'sopradora_engate_saida',
          'sopradora_forno_preforma', 'sopradora_eixo_servo',
          'parada_rotuladora', 'rotuladora_marca_corte',
          'falha_codificacao', 'transporte_aereo', 'baixa_pressao_ar',
          'troca_sabor',
          'troca_tamanho', 'limpeza', 'refeicao', 'inventario',
          'troca_turno', 'falta_efetivo', 'falta_energia',
          'aguardando_qualidade', 'sem_programacao',
          'manutencao_planejada', 'nao_identificado', 'outro_nao_listado'
        )
        or (maquina in ('Enchedora 2', 'Enchedora 3')
          and motivo_parada_codigo in (
            'parada_empacotadora', 'ajuste_enchedora', 'falha_enchedora',
            'falha_carbonatacao', 'cip_assepsia', 'falta_garrafas',
            'falta_tampas', 'falta_xarope'
          ))
        or (maquina in ('Empacotadora 2', 'Empacotadora 3')
          and motivo_parada_codigo in (
            'parada_enchedora', 'ajuste_empacotadora', 'falha_empacotadora',
            'troca_bobina_filme', 'filme_selagem', 'esteira_transporte',
            'paletizacao', 'falta_filme'
          ))
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.producao_horaria'::regclass
      and conname = 'producao_horaria_motivo_obrigatorio'
  ) then
    alter table public.producao_horaria
      add constraint producao_horaria_motivo_obrigatorio check (
        finalizado_em is null or (
          quantidade is not null and quantidade >= 0
          and (
            (meta is not null and meta > 0
              and tempo_parada_metodo = 'cadencia_equivalente'
              and tempo_parada_min is not null
              and tempo_parada_min between 0 and 60
              and tempo_parada_min::numeric = greatest(
                0, round((meta::numeric - quantidade::numeric) * 60 / nullif(meta::numeric, 0))
              ))
            or (meta is null and quantidade = 0
              and tempo_parada_min is null and tempo_parada_metodo is null)
          )
          and (
            (quantidade > 0 and tempo_parada_min = 0)
            or motivo_parada_codigo is not null
          )
        )
      );
  end if;
end;
$$;

-- Nao ha horario confiavel da primeira confirmacao das linhas antigas: o
-- updated_at pode ser de uma checagem posterior do lider. Por isso nao existe
-- backfill automatico. O gatilho abaixo ainda impede alterar seus valores.
-- A consulta aponta duplicatas historicas antes de criar a chave parcial.
do $$
declare v_duplicatas bigint;
begin
  select count(*) into v_duplicatas
    from (
      select 1 from public.producao_horaria
       where quantidade is not null or nao_rodou = true
       group by maquina, data_operacao, hora_codigo
      having count(*) > 1
    ) d;
  if v_duplicatas > 0 then
    raise notice '% maquina/data/hora historicas com mais de uma linha preenchida; revisar antes de importar historico para o card.',
      v_duplicatas;
  end if;

  if exists (
    select 1 from public.producao_horaria
     where finalizado_em is not null
     group by maquina, data_operacao, hora_codigo
    having count(*) > 1
  ) then
    raise exception 'Ha horas finalizadas duplicadas; resolva antes de criar a chave unica.';
  end if;
end;
$$;

-- A chave parcial preserva duplicatas historicas, caso existam, mas impede
-- dois lancamentos novos confirmados para a mesma maquina/data/hora.
create unique index if not exists producao_horaria_uma_final_por_maquina_hora
  on public.producao_horaria (maquina, data_operacao, hora_codigo)
  where finalizado_em is not null;

-- A consulta de profiles fica dentro da funcao para evitar recursao de RLS.
create or replace function public.maximus_operador_da_maquina(p_maquina text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.active = true
       and p.perfil = 'operador'
       and p.maquina_id =
         case p_maquina
           when 'Enchedora 2' then 'enchedora-2'
           when 'Enchedora 3' then 'enchedora-3'
           when 'Empacotadora 2' then 'empacotadora-2'
           when 'Empacotadora 3' then 'empacotadora-3'
           else null
         end
  );
$$;

revoke all on function public.maximus_operador_da_maquina(text) from public;
grant execute on function public.maximus_operador_da_maquina(text) to authenticated;

-- Protege todos os formularios que ja possuem maquina e identificador do
-- operador. Nao substitui nem remove as policies RLS existentes.
create or replace function public.maximus_conferir_maquina_do_operador()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_perfil text;
  v_ativo boolean;
  v_dados jsonb;
  v_antigos jsonb;
  v_uid text := auth.uid()::text;
  v_papel text := auth.role();
begin
  if v_papel = 'service_role' or (v_papel is null and session_user = 'postgres') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if v_papel is distinct from 'authenticated' or v_uid is null then
    raise exception 'Sessao autenticada necessaria para gravar formulario.' using errcode = '42501';
  end if;

  select p.perfil, p.active
    into v_perfil, v_ativo
    from public.profiles p where p.id = auth.uid();
  if not found or v_ativo is distinct from true then
    raise exception 'Perfil ativo necessario para gravar formulario.' using errcode = '42501';
  end if;
  if v_perfil = 'gestao' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if v_perfil is distinct from 'operador' then
    raise exception 'Perfil sem permissao para gravar formulario.' using errcode = '42501';
  end if;

  v_dados := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if not public.maximus_operador_da_maquina(v_dados->>'maquina')
     or v_dados->>tg_argv[0] is distinct from v_uid then
    raise exception 'Formulario pertence a outra maquina ou operador.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    v_antigos := to_jsonb(old);
    if not public.maximus_operador_da_maquina(v_antigos->>'maquina')
       or v_antigos->>tg_argv[0] is distinct from v_uid then
      raise exception 'Nao e permitido mover formulario de outra maquina ou operador.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.maximus_conferir_maquina_do_operador() from public;

-- As tabelas do verso foram criadas fora das migrations versionadas. Instala
-- somente onde a tabela e as duas colunas de contexto ja existem.
do $$
declare
  v_tabela text;
  v_owner text;
  v_nome_trigger text;
  v_nome_policy text;
begin
  for v_tabela, v_owner in
    select * from (values
      ('checklists', 'user_id'),
      ('anomalias', 'user_id'),
      ('ptp_janelas', 'operador_user_id'),
      ('limpeza_turnos', 'operador_user_id'),
      ('producao_horaria', 'operador_user_id'),
      ('producao_apoio', 'operador_user_id'),
      ('producao_tanques', 'operador_user_id'),
      ('producao_passagem_turno', 'operador_user_id')
    ) as t(tabela, owner_col)
  loop
    if to_regclass(format('public.%I', v_tabela)) is null then
      raise notice 'Tabela ausente, gatilho de maquina nao instalado: %', v_tabela;
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = v_tabela
         and column_name = 'maquina'
    ) or not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = v_tabela
         and column_name = v_owner
    ) then
      raise exception 'Tabela % sem maquina ou %; revise esquema antes de aplicar.',
        v_tabela, v_owner;
    end if;
    v_nome_trigger := 'trg_maximus_maquina_' || v_tabela;
    if not exists (
      select 1 from pg_trigger
       where tgrelid = to_regclass(format('public.%I', v_tabela))
         and tgname = v_nome_trigger and not tgisinternal
    ) then
      execute format(
        'create trigger %I before insert or update or delete on public.%I for each row execute function public.maximus_conferir_maquina_do_operador(%L)',
        v_nome_trigger, v_tabela, v_owner
      );
    end if;

    -- Policy restritiva soma-se (AND) as policies atuais. Assim SELECT,
    -- INSERT, UPDATE e DELETE nunca escapam da maquina atribuida, mesmo se
    -- alguma policy permissiva antiga abranger mais linhas.
    execute format('alter table public.%I enable row level security', v_tabela);
    v_nome_policy := 'maximus_maquina_escopo_' || v_tabela;
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = v_tabela
         and policyname = v_nome_policy
    ) then
      execute format(
        'create policy %I on public.%I as restrictive for all to authenticated using (public.is_gestao(auth.uid()) or public.maximus_operador_da_maquina(maquina)) with check (public.is_gestao(auth.uid()) or public.maximus_operador_da_maquina(maquina))',
        v_nome_policy, v_tabela
      );
    end if;
  end loop;
end;
$$;

-- A folha horaria pertence a maquina/dia, nao ao login. O operador do turno
-- seguinte precisa ler as horas ja confirmadas pelo anterior. Esta policy
-- permissiva acrescenta a leitura; a policy restritiva por maquina acima
-- continua sendo aplicada em conjunto.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'producao_horaria'
       and policyname = 'producao_horaria_select_maquina_v3'
  ) then
    create policy producao_horaria_select_maquina_v3
      on public.producao_horaria as permissive
      for select to authenticated
      using (
        public.is_gestao(auth.uid())
        or public.maximus_operador_da_maquina(maquina)
      );
  end if;
end;
$$;

-- H01 termina as 07:00 da data_operacao; H24 termina as 06:00 do dia
-- seguinte. O relogio usado para permitir o save e sempre o do banco.
create or replace function public.maximus_exigir_hora_encerrada_manaus(
  p_data_operacao date,
  p_hora_codigo text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_indice integer;
  v_fim timestamptz;
begin
  if p_data_operacao is null or p_hora_codigo is null
     or p_hora_codigo !~ '^H(0[1-9]|1[0-9]|2[0-4])$' then
    raise exception 'Data operacional ou codigo da hora invalido.'
      using errcode = '23514';
  end if;

  v_indice := substring(p_hora_codigo from 2)::integer;
  v_fim := (
    p_data_operacao::timestamp + (6 + v_indice) * interval '1 hour'
  ) at time zone 'America/Manaus';
  if clock_timestamp() < v_fim then
    raise exception 'A hora ainda nao terminou no horario de Manaus.'
      using errcode = '23514';
  end if;
end;
$$;

-- O servidor decide o instante; o cliente nao pode antecipar um lancamento.
-- Depois de confirmado, somente os campos de checagem do lider podem mudar.
create or replace function public.maximus_travar_hora_finalizada()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_campos_lider text[] := array['lider_nome', 'assinatura_lider', 'lider_assinou_em', 'updated_at'];
begin
  if tg_op = 'INSERT' then
    if new.nao_rodou = true then
      new.quantidade := 0;
    end if;
    if new.quantidade is not null or new.nao_rodou = true then
      perform public.maximus_exigir_hora_encerrada_manaus(
        new.data_operacao::date, new.hora_codigo
      );
      if new.meta is null then
        if new.quantidade > 0 then
          raise exception 'Cadencia obrigatoria para hora com producao.' using errcode = '23514';
        end if;
        new.tempo_parada_min := null;
        new.tempo_parada_metodo := null;
      elsif new.meta <= 0 then
        raise exception 'Cadencia deve ser positiva.' using errcode = '23514';
      else
        new.tempo_parada_min := greatest(
          0, round((new.meta::numeric - new.quantidade::numeric) * 60 / new.meta::numeric)
        );
        new.tempo_parada_metodo := 'cadencia_equivalente';
      end if;
    end if;
    new.finalizado_em := case
      when new.quantidade is not null or new.nao_rodou = true
      then clock_timestamp()
      else null
    end;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.quantidade is not null or old.nao_rodou = true
       or old.finalizado_em is not null then
      raise exception 'Hora salva nao pode ser excluida.' using errcode = '42501';
    end if;
    return old;
  end if;

  if old.quantidade is not null or old.nao_rodou = true
     or old.finalizado_em is not null then
    if (to_jsonb(new) - v_campos_lider) is distinct from
       (to_jsonb(old) - v_campos_lider) then
      raise exception 'Hora salva nao pode ser alterada; somente a checagem do lider.'
        using errcode = '42501';
    end if;
    if old.assinatura_lider is not null
       and (new.assinatura_lider is distinct from old.assinatura_lider
            or new.lider_nome is distinct from old.lider_nome
            or new.lider_assinou_em is distinct from old.lider_assinou_em) then
      raise exception 'Checagem do lider ja assinada.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Uma linha historica em branco so entra no novo regime na primeira
  -- confirmacao; linhas antigas preenchidas continuam com finalizado_em NULL.
  -- Mesmo um UPDATE que mantem a linha em branco e bloqueado antes do fim.
  perform public.maximus_exigir_hora_encerrada_manaus(
    new.data_operacao::date, new.hora_codigo
  );
  if new.nao_rodou = true then
    new.quantidade := 0;
  end if;
  if new.quantidade is not null or new.nao_rodou = true then
    if new.meta is null then
      if new.quantidade > 0 then
        raise exception 'Cadencia obrigatoria para hora com producao.' using errcode = '23514';
      end if;
      new.tempo_parada_min := null;
      new.tempo_parada_metodo := null;
    elsif new.meta <= 0 then
      raise exception 'Cadencia deve ser positiva.' using errcode = '23514';
    else
      new.tempo_parada_min := greatest(
        0, round((new.meta::numeric - new.quantidade::numeric) * 60 / new.meta::numeric)
      );
      new.tempo_parada_metodo := 'cadencia_equivalente';
    end if;
    new.finalizado_em := clock_timestamp();
  else
    new.finalizado_em := null;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.producao_horaria'::regclass
       and tgname = 'trg_maximus_travar_hora_finalizada' and not tgisinternal
  ) then
    create trigger trg_maximus_travar_hora_finalizada
      before insert or update or delete on public.producao_horaria
      for each row execute function public.maximus_travar_hora_finalizada();
  end if;
end;
$$;

commit;
