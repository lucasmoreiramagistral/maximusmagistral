-- O operador desenha uma assinatura uma vez, depois de confirmar H12/H24.
-- A identidade e o horário são carimbados pelo banco. O líder continua
-- assinando de forma independente, também uma vez no fim do turno.
begin;

alter table public.producao_horaria
  add column if not exists assinatura_operador jsonb,
  add column if not exists operador_assinou_em timestamptz;

comment on column public.producao_horaria.assinatura_operador is
  'Desenho do operador autenticado ao fim do turno (H12 ou H24).';
comment on column public.producao_horaria.operador_assinou_em is
  'Instante conferido pelo servidor para a assinatura do operador.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.producao_horaria'::regclass
       and conname = 'producao_horaria_assinatura_operador_par'
  ) then
    alter table public.producao_horaria
      add constraint producao_horaria_assinatura_operador_par check (
        (assinatura_operador is null and operador_assinou_em is null)
        or (assinatura_operador is not null and operador_assinou_em is not null)
      );
  end if;
end;
$$;

-- Esta é a mesma proteção da produção definitiva, com os dois campos da
-- assinatura do operador incluídos nas únicas exceções permitidas.
create or replace function public.maximus_travar_hora_finalizada()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_campos_assinaturas text[] := array[
    'lider_nome', 'assinatura_lider', 'lider_assinou_em',
    'assinatura_operador', 'operador_assinou_em', 'updated_at'
  ];
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
    if (to_jsonb(new) - v_campos_assinaturas) is distinct from
       (to_jsonb(old) - v_campos_assinaturas) then
      raise exception 'Hora salva nao pode ser alterada; somente assinaturas de fim de turno.'
        using errcode = '42501';
    end if;
    if old.assinatura_lider is not null
       and (new.assinatura_lider is distinct from old.assinatura_lider
            or new.lider_nome is distinct from old.lider_nome
            or new.lider_assinou_em is distinct from old.lider_assinou_em) then
      raise exception 'Checagem do lider ja assinada.' using errcode = '42501';
    end if;
    if old.assinatura_operador is not null
       and (new.assinatura_operador is distinct from old.assinatura_operador
            or new.operador_assinou_em is distinct from old.operador_assinou_em) then
      raise exception 'Turno do operador ja assinado.' using errcode = '42501';
    end if;
    return new;
  end if;

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

-- Bloqueia gravação direta da assinatura, inclusive por outro usuário da
-- máquina. A RPC sinaliza somente sua própria transação e a hora escolhida.
create or replace function public.maximus_validar_assinatura_operador_fim_turno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
  v_agora timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.assinatura_operador is not null or new.operador_assinou_em is not null then
      raise exception 'Salve a última hora antes de assinar o turno.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.assinatura_operador is not distinct from old.assinatura_operador
     and new.operador_assinou_em is not distinct from old.operador_assinou_em then
    return new;
  end if;

  if old.assinatura_operador is not null then
    raise exception 'Turno do operador ja assinado.' using errcode = '42501';
  end if;
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
     or old.operador_user_id is distinct from auth.uid()
     or new.operador_user_id is distinct from auth.uid()
     or current_setting('app.maximus_hora_operador_rpc', true)
        is distinct from auth.uid()::text || ':' || old.id::text then
    raise exception 'Somente o operador autenticado pode assinar seu turno pela validação segura.'
      using errcode = '42501';
  end if;
  if old.finalizado_em is null
     or not ((old.hora_codigo = 'H12' and old.turno = '12x36 Dia')
          or (old.hora_codigo = 'H24' and old.turno = '12x36 Noite')) then
    raise exception 'Assinatura disponível apenas após a última hora confirmada do turno.'
      using errcode = '23514';
  end if;
  if jsonb_typeof(new.assinatura_operador) is distinct from 'object'
     or length(coalesce(new.assinatura_operador->>'dataUrl', '')) not between 100 and 2000000
     or new.assinatura_operador->>'dataUrl' not like 'data:image/png;base64,%' then
    raise exception 'Desenho da assinatura do operador inválido.' using errcode = '23514';
  end if;
  select p.nome into v_nome
    from public.profiles p
   where p.id = auth.uid() and p.active = true and p.perfil = 'operador'
     and p.maquina_id = case old.maquina
       when 'Enchedora 2' then 'enchedora-2'
       when 'Enchedora 3' then 'enchedora-3'
       when 'Empacotadora 2' then 'empacotadora-2'
       when 'Empacotadora 3' then 'empacotadora-3'
       else null
     end;
  if not found or btrim(coalesce(v_nome, '')) = '' then
    raise exception 'Perfil ativo da máquina necessário para assinar.' using errcode = '42501';
  end if;
  v_agora := clock_timestamp();
  new.operador_assinou_em := v_agora;
  new.assinatura_operador := jsonb_build_object(
    'dataUrl', new.assinatura_operador->>'dataUrl',
    'nome', v_nome,
    'assinadoEm', v_agora,
    'userId', auth.uid()
  );
  return new;
end;
$$;

revoke all on function public.maximus_validar_assinatura_operador_fim_turno()
  from public;

drop trigger if exists trg_maximus_assinatura_operador_fim_turno
  on public.producao_horaria;
create trigger trg_maximus_assinatura_operador_fim_turno
  before insert or update on public.producao_horaria
  for each row execute function public.maximus_validar_assinatura_operador_fim_turno();

-- Em horas novas, a validação do líder vem depois da assinatura do operador.
-- Testa OLD para impedir que ambos sejam gravados no mesmo UPDATE. Horas
-- históricas já preenchidas sem finalizado_em mantêm o fluxo anterior.
create or replace function public.maximus_exigir_operador_antes_lider()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.lider_nome is not distinct from old.lider_nome
     and new.assinatura_lider is not distinct from old.assinatura_lider
     and new.lider_assinou_em is not distinct from old.lider_assinou_em then
    return new;
  end if;
  if old.finalizado_em is not null and old.assinatura_operador is null then
    raise exception 'O operador deve assinar o turno antes da validação do líder.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.maximus_exigir_operador_antes_lider()
  from public;

drop trigger if exists trg_maximus_exigir_operador_antes_lider
  on public.producao_horaria;
create trigger trg_maximus_exigir_operador_antes_lider
  before update on public.producao_horaria
  for each row execute function public.maximus_exigir_operador_antes_lider();

create or replace function public.rpc_assinar_hora_operador(
  p_hora_id uuid,
  p_updated_at timestamptz,
  p_assinatura_data_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hora public.producao_horaria%rowtype;
begin
  if auth.role() is distinct from 'authenticated' or v_uid is null then
    raise exception 'Sessão autenticada do operador necessária.' using errcode = '42501';
  end if;
  if p_hora_id is null or p_updated_at is null then
    raise exception 'Hora e versão são obrigatórias.' using errcode = '23514';
  end if;
  if length(coalesce(p_assinatura_data_url, '')) not between 100 and 2000000
     or p_assinatura_data_url not like 'data:image/png;base64,%' then
    raise exception 'Assinatura PNG inválida.' using errcode = '23514';
  end if;

  select * into v_hora
    from public.producao_horaria
   where id = p_hora_id
   for update;
  if not found then
    raise exception 'Hora não encontrada.' using errcode = 'P0002';
  end if;
  if v_hora.updated_at is distinct from p_updated_at then
    raise exception 'A hora mudou. Recarregue antes de assinar.' using errcode = '40001';
  end if;
  if v_hora.operador_user_id is distinct from v_uid
     or not public.maximus_operador_da_maquina(v_hora.maquina) then
    raise exception 'Somente o operador que lançou esta máquina pode assinar o turno.'
      using errcode = '42501';
  end if;
  if v_hora.finalizado_em is null
     or not ((v_hora.hora_codigo = 'H12' and v_hora.turno = '12x36 Dia')
          or (v_hora.hora_codigo = 'H24' and v_hora.turno = '12x36 Noite')) then
    raise exception 'Confirme a última hora do turno antes de assinar.'
      using errcode = '23514';
  end if;
  if v_hora.assinatura_operador is not null then
    raise exception 'O operador já assinou este turno.' using errcode = '42501';
  end if;

  perform set_config(
    'app.maximus_hora_operador_rpc', v_uid::text || ':' || p_hora_id::text, true
  );
  update public.producao_horaria
     set assinatura_operador = jsonb_build_object('dataUrl', p_assinatura_data_url),
         operador_assinou_em = clock_timestamp()
   where id = p_hora_id
   returning * into v_hora;

  return jsonb_build_object('hora', to_jsonb(v_hora));
end;
$$;

revoke all on function public.rpc_assinar_hora_operador(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.rpc_assinar_hora_operador(uuid, timestamptz, text)
  to authenticated;

commit;
