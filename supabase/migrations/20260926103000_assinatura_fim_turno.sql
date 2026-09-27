-- A checagem do líder ocorre uma vez por turno: H12 (17–18h) ou H24 (05–06h).
-- O desenho pode ser colhido na sessão do operador, sem trocar login; nesse
-- caso o banco registra a sessão que fez o lançamento, sem afirmar que ela
-- autentica a identidade do líder. A RPC continua disponível ao líder no Farol.
begin;

create or replace function public.maximus_validar_assinatura_fim_turno()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_agora timestamptz;
  v_rpc_lider boolean;
begin
  if tg_op = 'INSERT' then
    if new.lider_nome is not null or new.assinatura_lider is not null
       or new.lider_assinou_em is not null then
      raise exception 'Salve a hora antes da checagem do líder.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.lider_nome is not distinct from old.lider_nome
     and new.assinatura_lider is not distinct from old.assinatura_lider
     and new.lider_assinou_em is not distinct from old.lider_assinou_em then
    return new;
  end if;

  if new.hora_codigo not in ('H12', 'H24')
     or old.hora_codigo not in ('H12', 'H24') then
    raise exception 'O líder valida apenas a última hora do turno.'
      using errcode = '23514';
  end if;
  if old.finalizado_em is null and old.quantidade is null
     and old.nao_rodou is distinct from true then
    raise exception 'Salve a hora antes da checagem do líder.'
      using errcode = '23514';
  end if;
  if new.lider_nome is null or btrim(new.lider_nome) = ''
     or new.lider_assinou_em is null
     or jsonb_typeof(new.assinatura_lider) is distinct from 'object'
     or btrim(coalesce(new.assinatura_lider->>'nome', '')) <> btrim(new.lider_nome)
     or length(coalesce(new.assinatura_lider->>'dataUrl', '')) not between 100 and 2000000
     or new.assinatura_lider->>'dataUrl' not like 'data:image/png;base64,%' then
    raise exception 'Nome e desenho da assinatura do líder são obrigatórios.'
      using errcode = '23514';
  end if;

  v_rpc_lider := coalesce(
    auth.uid() is not null
    and current_setting('app.maximus_hora_lider_rpc', true) =
        auth.uid()::text || ':' || new.id::text,
    false
  );
  v_agora := clock_timestamp();
  new.lider_assinou_em := v_agora;
  if not v_rpc_lider then
    -- O cliente não pode fingir que o desenho foi autenticado pela RPC.
    new.assinatura_lider := new.assinatura_lider - 'userId';
  end if;
  new.assinatura_lider := new.assinatura_lider || jsonb_build_object(
    'assinadoEm', v_agora,
    'registradoPorUserId', auth.uid(),
    'origem', case when v_rpc_lider then 'lider_autenticado'
                   else 'sessao_operador' end
  );
  return new;
end;
$$;

revoke all on function public.maximus_validar_assinatura_fim_turno()
  from public;

drop trigger if exists trg_maximus_assinatura_fim_turno
  on public.producao_horaria;
create trigger trg_maximus_assinatura_fim_turno
  before insert or update on public.producao_horaria
  for each row execute function public.maximus_validar_assinatura_fim_turno();

commit;
