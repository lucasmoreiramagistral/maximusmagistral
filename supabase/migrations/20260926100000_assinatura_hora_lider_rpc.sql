-- Instala a RPC de assinatura antes da publicação do frontend novo.
-- Executar depois de 20260922100000_maquinas_hora_x_hora.sql.
-- Não modifica nem preenche assinaturas históricas. O bloqueio do caminho
-- antigo fica na migration seguinte, após publicar o frontend que usa a RPC.
begin;

create or replace function public.rpc_assinar_hora_lider(
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
  v_actor public.profiles%rowtype;
  v_hora public.producao_horaria%rowtype;
  v_agora timestamptz;
begin
  if auth.role() is distinct from 'authenticated' or v_uid is null then
    raise exception 'Sessão autenticada do líder necessária.' using errcode = '42501';
  end if;
  if p_hora_id is null or p_updated_at is null then
    raise exception 'Hora e versão são obrigatórias.' using errcode = '23514';
  end if;
  if length(coalesce(p_assinatura_data_url, '')) not between 100 and 2000000
     or p_assinatura_data_url not like 'data:image/png;base64,%' then
    raise exception 'Assinatura PNG inválida.' using errcode = '23514';
  end if;

  select * into v_actor from public.profiles where id = v_uid;
  if not found or v_actor.active is distinct from true
     or v_actor.perfil not in ('lider', 'supervisor', 'gestao') then
    raise exception 'Perfil ativo de liderança necessário.' using errcode = '42501';
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
  if v_hora.maquina not in
     ('Enchedora 2', 'Enchedora 3', 'Empacotadora 2', 'Empacotadora 3')
     or v_hora.hora_codigo not in ('H06', 'H12', 'H18', 'H24')
     or (v_hora.finalizado_em is null and v_hora.quantidade is null
         and v_hora.nao_rodou is distinct from true) then
    raise exception 'Checagem indisponível para esta hora.' using errcode = '23514';
  end if;
  if v_hora.assinatura_lider is not null
     and v_hora.assinatura_lider <> 'null'::jsonb then
    raise exception 'Checagem do líder já assinada.' using errcode = '42501';
  end if;
  -- Nem a gestão pode validar uma hora que ela própria lançou.
  if v_hora.operador_user_id = v_uid
     or (v_hora.operador_user_id is null
         and lower(btrim(coalesce(v_hora.operador_login, ''))) =
             lower(btrim(coalesce(v_actor.usuario, '')))) then
    raise exception 'Quem lançou a hora não pode assinar a própria checagem.'
      using errcode = '42501';
  end if;
  if v_actor.perfil = 'lider'
     and not public.operador_na_equipe_do_lider(
       v_uid, v_hora.operador_user_id, v_hora.operador_login
     ) then
    raise exception 'Líder de outra equipe não pode assinar esta hora.'
      using errcode = '42501';
  end if;

  -- O marcador é local à transação e inclui a identidade JWT e esta hora.
  -- O trigger rejeita qualquer UPDATE direto via PostgREST sem a RPC.
  perform set_config(
    'app.maximus_hora_lider_rpc', v_uid::text || ':' || p_hora_id::text, true
  );
  v_agora := clock_timestamp();
  update public.producao_horaria
     set lider_nome = v_actor.nome,
         assinatura_lider = jsonb_build_object(
           'dataUrl', p_assinatura_data_url,
           'nome', v_actor.nome,
           'assinadoEm', v_agora,
           'userId', v_uid
         ),
         lider_assinou_em = v_agora
   where id = p_hora_id
   returning * into v_hora;

  return jsonb_build_object(
    'hora', to_jsonb(v_hora),
    'ator', jsonb_build_object(
      'userId', v_uid,
      'login', v_actor.usuario,
      'nome', v_actor.nome,
      'perfil', v_actor.perfil
    )
  );
end;
$$;

revoke all on function public.rpc_assinar_hora_lider(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.rpc_assinar_hora_lider(uuid, timestamptz, text)
  to authenticated;

commit;
