-- =====================================================================
-- v2.0 — Migration 09: fechamento e PDCA transacionais
--
-- REQUER: migrations externas 01 a 08 já aplicadas.
--
-- OBJETIVOS
--   1. Uma autenticação sem confirmação final não deixa registro algum.
--   2. Checklist + limpeza fecham juntos ou nenhum deles fecha.
--   3. Um fechamento em contingência conta como UM turno, mesmo com 2 alvos.
--   4. Líder lê e age somente na própria equipe; Sup/Coord e GI veem a fábrica.
--   5. Plano, checagem, decisão A, evento e autoria ficam na mesma transação.
--   6. PTP passa a ser origem válida de plano de ação.
--
-- COMPATIBILIDADE
--   A v1 continua escrevendo checklists e limpeza como hoje. Esta migration
--   não instala ainda o trigger de corte que bloqueará assinatura antiga.
--   Esse corte deve ser uma migration futura, após todos os tablets estarem
--   no v2. Dados antigos não são promovidos artificialmente a auditados.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Escopo por equipe
-- ---------------------------------------------------------------------

create or replace function public.pode_acessar_equipe(_uid uuid, _equipe text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = _uid
      and p.active = true
      and (
        p.perfil in ('supervisor', 'gestao')
        or (
          p.perfil = 'lider'
          and nullif(btrim(_equipe), '') is not null
          and p.equipe_padrao = _equipe
        )
      )
  );
$$;

create or replace function public.operador_na_equipe_do_lider(
  _lider_uid uuid,
  _operador_uid uuid,
  _operador_login text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles lider
    join public.profiles operador
      on (
        operador.id = _operador_uid
        or (
          _operador_uid is null
          and operador.usuario = _operador_login
        )
      )
    where lider.id = _lider_uid
      and lider.active = true
      and lider.perfil = 'lider'
      and nullif(btrim(lider.equipe_padrao), '') is not null
      and operador.active = true
      and operador.equipe_padrao = lider.equipe_padrao
  );
$$;

revoke all on function public.pode_acessar_equipe(uuid, text) from public;
revoke all on function public.operador_na_equipe_do_lider(uuid, uuid, text) from public;
grant execute on function public.pode_acessar_equipe(uuid, text) to authenticated;
grant execute on function public.operador_na_equipe_do_lider(uuid, uuid, text) to authenticated;

-- As migrations 02/05 liberavam toda a fábrica para qualquer liderança.
-- Substituímos somente SELECT; escrita operacional legada continua intacta.
do $$
declare r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and cmd = 'SELECT'
      and tablename in ('checklists', 'profiles', 'limpeza_turnos', 'ptp_janelas')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy checklists_select_escopo_v2
  on public.checklists for select to authenticated
  using (
    public.is_active_user(auth.uid())
    and (
      user_id = auth.uid()
      or public.is_supervisao(auth.uid())
      or public.pode_acessar_equipe(auth.uid(), equipe)
    )
  );

create policy profiles_select_escopo_v2
  on public.profiles for select to authenticated
  using (
    public.is_active_user(auth.uid())
    and (
      id = auth.uid()
      or public.is_supervisao(auth.uid())
      or public.pode_acessar_equipe(auth.uid(), equipe_padrao)
    )
  );

create policy limpeza_select_escopo_v2
  on public.limpeza_turnos for select to authenticated
  using (
    public.is_active_user(auth.uid())
    and (
      operador_user_id = auth.uid()
      or (
        operador_user_id is null
        and operador_login = (
          select p.usuario from public.profiles p where p.id = auth.uid()
        )
      )
      or public.is_supervisao(auth.uid())
      or public.operador_na_equipe_do_lider(
        auth.uid(), operador_user_id, operador_login
      )
    )
  );

create policy ptp_select_escopo_v2
  on public.ptp_janelas for select to authenticated
  using (
    public.is_active_user(auth.uid())
    and (
      operador_user_id = auth.uid()
      or (
        operador_user_id is null
        and operador_login = (
          select p.usuario from public.profiles p where p.id = auth.uid()
        )
      )
      or public.is_supervisao(auth.uid())
      or public.operador_na_equipe_do_lider(
        auth.uid(), operador_user_id, operador_login
      )
    )
  );

-- ---------------------------------------------------------------------
-- 2) Cabeçalho do fechamento — um turno, vários alvos
-- ---------------------------------------------------------------------

create table if not exists public.fechamentos_validacao (
  id uuid primary key,
  data_operacao date not null,
  turno text not null,
  equipe text not null,
  linha text not null,
  maquina text not null,

  contingencia boolean not null default false,
  contingencia_motivo text,
  contingencia_autorizou text,

  registrado_por uuid not null references auth.users(id) on delete restrict,
  registrado_por_login text not null,
  registrado_por_nome text not null,
  registrado_por_perfil text not null,
  registrado_em timestamptz not null default now(),
  observacao text,

  constraint fechamento_contexto_preenchido check (
    nullif(btrim(turno), '') is not null
    and nullif(btrim(equipe), '') is not null
    and nullif(btrim(linha), '') is not null
    and nullif(btrim(maquina), '') is not null
  ),
  constraint fechamento_contingencia_coerente check (
    (
      contingencia = false
      and contingencia_motivo is null
      and contingencia_autorizou is null
      and registrado_por_perfil in ('lider', 'supervisor', 'gestao')
    )
    or (
      contingencia = true
      and registrado_por_perfil = 'operador'
      and contingencia_motivo in (
        'Líder não está na planta',
        'Líder não lembra a senha',
        'Líder ainda não tem login'
      )
      and nullif(btrim(contingencia_autorizou), '') is not null
    )
  )
);

create index if not exists idx_fechamentos_periodo
  on public.fechamentos_validacao(data_operacao desc, equipe, turno);
create index if not exists idx_fechamentos_contingencia
  on public.fechamentos_validacao(data_operacao desc)
  where contingencia;

alter table public.fechamentos_validacao enable row level security;

drop policy if exists fechamentos_select_escopo_v2 on public.fechamentos_validacao;
create policy fechamentos_select_escopo_v2
  on public.fechamentos_validacao for select to authenticated
  using (
    public.is_active_user(auth.uid())
    and (
      registrado_por = auth.uid()
      or public.pode_acessar_equipe(auth.uid(), equipe)
    )
  );

grant select on public.fechamentos_validacao to authenticated;
revoke insert, update, delete on public.fechamentos_validacao from authenticated;

alter table public.validacoes_lider
  add column if not exists fechamento_id uuid
    references public.fechamentos_validacao(id) on delete restrict,
  add column if not exists equipe text;

create unique index if not exists uq_validacao_alvo_v2
  on public.validacoes_lider(alvo_tipo, alvo_id)
  where fechamento_id is not null;
create index if not exists idx_validacoes_fechamento
  on public.validacoes_lider(fechamento_id);

drop policy if exists validacoes_insert on public.validacoes_lider;
drop policy if exists validacoes_select on public.validacoes_lider;
revoke insert, update, delete on public.validacoes_lider from authenticated;

create policy validacoes_select_escopo_v2
  on public.validacoes_lider for select to authenticated
  using (
    public.is_active_user(auth.uid())
    and (
      validado_por = auth.uid()
      or public.is_supervisao(auth.uid())
      or exists (
        select 1
        from public.fechamentos_validacao f
        where f.id = validacoes_lider.fechamento_id
          and public.pode_acessar_equipe(auth.uid(), f.equipe)
      )
    )
  );

-- O trigger antigo aceitava linha direta do navegador. Agora toda linha nova
-- precisa pertencer ao cabeçalho que a RPC criou na mesma transação.
create or replace function public.carimbar_validacao_lider()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
  f public.fechamentos_validacao%rowtype;
begin
  select * into p
  from public.profiles
  where id = auth.uid() and active = true;

  if not found then
    raise exception 'Usuario sem perfil ativo nao pode validar';
  end if;

  if new.fechamento_id is null then
    raise exception 'Validacao v2 exige fechamento transacional';
  end if;

  select * into f
  from public.fechamentos_validacao
  where id = new.fechamento_id;

  if not found or f.registrado_por <> auth.uid() then
    raise exception 'Cabecalho de fechamento invalido para a sessao';
  end if;

  if f.contingencia then
    if p.perfil <> 'operador' then
      raise exception 'Contingencia deve ser registrada pelo operador';
    end if;
  elsif p.perfil not in ('lider', 'supervisor', 'gestao') then
    raise exception 'Perfil % nao pode validar execucao', p.perfil;
  end if;

  new.equipe := f.equipe;
  new.validado_por := auth.uid();
  new.validado_por_login := p.usuario;
  new.validado_por_nome := p.nome;
  new.validado_por_perfil := p.perfil;
  new.validado_em := f.registrado_em;
  new.contingencia := f.contingencia;
  new.contingencia_motivo := f.contingencia_motivo;
  new.contingencia_autorizou := f.contingencia_autorizou;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Fechamento transacional privado e duas RPCs públicas
-- ---------------------------------------------------------------------

create or replace function public._finalizar_validacao_v2(
  p_contingencia boolean,
  p_fechamento_id uuid,
  p_checklist_id text,
  p_assinatura_checklist text,
  p_limpeza_id text,
  p_assinatura_limpeza text,
  p_contingencia_autorizou text,
  p_contingencia_motivo text,
  p_observacao text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_agora timestamptz := now();
  v_actor public.profiles%rowtype;
  v_c public.checklists%rowtype;
  v_l public.limpeza_turnos%rowtype;
  v_f public.fechamentos_validacao%rowtype;
  v_existente uuid;
  v_tem_c boolean := false;
  v_tem_l boolean := false;
  v_data date;
  v_turno text;
  v_equipe text;
  v_equipe_limpeza text;
  v_linha text;
  v_maquina text;
  v_nome_assinatura text;
  v_sig_c jsonb;
  v_sig_l jsonb;
begin
  if v_uid is null then
    raise exception 'Sessao autenticada obrigatoria';
  end if;

  select * into v_actor
  from public.profiles
  where id = v_uid and active = true;

  if not found then
    raise exception 'Usuario sem perfil ativo';
  end if;
  if v_actor.somente_leitura is true then
    raise exception 'Usuario configurado como somente leitura';
  end if;
  if p_checklist_id is null and p_limpeza_id is null then
    raise exception 'Informe ao menos um alvo para o fechamento';
  end if;
  if p_fechamento_id is null then
    raise exception 'Identificador do fechamento obrigatorio';
  end if;
  if length(coalesce(p_observacao, '')) > 2000 then
    raise exception 'Observacao excede 2000 caracteres';
  end if;

  if p_checklist_id is not null then
    if length(coalesce(p_assinatura_checklist, '')) not between 100 and 2000000
       or p_assinatura_checklist not like 'data:image/%' then
      raise exception 'Assinatura do checklist invalida';
    end if;
    perform pg_advisory_xact_lock(
      hashtextextended('validacao:checklist:' || p_checklist_id, 0)
    );
  end if;

  if p_limpeza_id is not null then
    if length(coalesce(p_assinatura_limpeza, '')) not between 100 and 2000000
       or p_assinatura_limpeza not like 'data:image/%' then
      raise exception 'Assinatura da limpeza invalida';
    end if;
    perform pg_advisory_xact_lock(
      hashtextextended('validacao:limpeza:' || p_limpeza_id, 0)
    );
  end if;

  -- Retentativa idempotente: se o servidor confirmou e a resposta de rede se
  -- perdeu, o mesmo fechamento retorna o fato já gravado em vez de duplicar.
  select vl.fechamento_id into v_existente
  from public.validacoes_lider vl
  where vl.fechamento_id is not null
    and (
      (p_checklist_id is not null and vl.alvo_tipo = 'checklist' and vl.alvo_id = p_checklist_id)
      or (p_limpeza_id is not null and vl.alvo_tipo = 'limpeza' and vl.alvo_id = p_limpeza_id)
    )
  limit 1;

  if found then
    if v_existente <> p_fechamento_id then
      raise exception 'Alvo ja pertence a outro fechamento';
    end if;
    if p_checklist_id is not null and not exists (
      select 1 from public.validacoes_lider
      where fechamento_id = v_existente and alvo_tipo = 'checklist' and alvo_id = p_checklist_id
    ) then
      raise exception 'Fechamento existente nao contem o checklist solicitado';
    end if;
    if p_limpeza_id is not null and not exists (
      select 1 from public.validacoes_lider
      where fechamento_id = v_existente and alvo_tipo = 'limpeza' and alvo_id = p_limpeza_id
    ) then
      raise exception 'Fechamento existente nao contem a limpeza solicitada';
    end if;

    select * into v_f from public.fechamentos_validacao where id = v_existente;
    return jsonb_build_object(
      'fechamentoId', v_f.id,
      'validadoEm', v_f.registrado_em,
      'contingencia', v_f.contingencia,
      'nomeAssinatura', case when v_f.contingencia
        then v_f.contingencia_autorizou || ' (contingência)'
        else v_f.registrado_por_nome end,
      'ator', jsonb_build_object(
        'userId', v_f.registrado_por,
        'login', v_f.registrado_por_login,
        'nome', v_f.registrado_por_nome,
        'perfil', v_f.registrado_por_perfil
      )
    );
  end if;

  if exists (select 1 from public.fechamentos_validacao where id = p_fechamento_id) then
    raise exception 'Identificador de fechamento ja utilizado';
  end if;

  if p_checklist_id is not null then
    select * into v_c from public.checklists
    where id = p_checklist_id for update;
    if not found then raise exception 'Checklist nao encontrado'; end if;
    v_tem_c := true;
    if v_c.status <> 'concluido' or v_c.momento <> 'Pós-setup' then
      raise exception 'Checklist nao e um fechamento Pos-setup concluido';
    end if;
    if coalesce(v_c.contexto #> '{__assinaturas,operador}', 'null'::jsonb) = 'null'::jsonb then
      raise exception 'Checklist sem assinatura do operador';
    end if;
    if coalesce(v_c.contexto #> '{__assinaturas,lider}', 'null'::jsonb) <> 'null'::jsonb then
      raise exception 'Checklist ja possui assinatura da lideranca';
    end if;
  end if;

  if p_limpeza_id is not null then
    select * into v_l from public.limpeza_turnos
    where id = p_limpeza_id for update;
    if not found then raise exception 'Limpeza nao encontrada'; end if;
    v_tem_l := true;
    if v_l.status <> 'aguardando_validacao' then
      raise exception 'Limpeza nao esta aguardando validacao';
    end if;
    if v_l.assinatura_operador is null or v_l.assinatura_operador = 'null'::jsonb then
      raise exception 'Limpeza sem assinatura do operador';
    end if;
    if v_l.assinatura_lider is not null and v_l.assinatura_lider <> 'null'::jsonb then
      raise exception 'Limpeza ja possui assinatura da lideranca';
    end if;

    select p.equipe_padrao into v_equipe_limpeza
    from public.profiles p
    where p.id = v_l.operador_user_id
       or (v_l.operador_user_id is null and p.usuario = v_l.operador_login)
    order by (p.id = v_l.operador_user_id) desc
    limit 1;
  end if;

  if v_tem_c then
    v_data := v_c.data_operacao;
    v_turno := v_c.turno;
    v_equipe := v_c.equipe;
    v_linha := v_c.linha;
    v_maquina := v_c.maquina;
  else
    v_data := v_l.data_operacao;
    v_turno := v_l.turno;
    v_equipe := v_equipe_limpeza;
    v_linha := v_l.linha;
    v_maquina := v_l.maquina;
  end if;

  if v_tem_c and v_tem_l then
    if v_c.data_operacao <> v_l.data_operacao
       or v_c.turno <> v_l.turno
       or v_c.linha <> v_l.linha
       or v_c.maquina <> v_l.maquina then
      raise exception 'Checklist e limpeza pertencem a contextos diferentes';
    end if;
    if v_equipe_limpeza is not null and v_c.equipe <> v_equipe_limpeza then
      raise exception 'Checklist e limpeza pertencem a equipes diferentes';
    end if;
  end if;

  if nullif(btrim(coalesce(v_equipe, '')), '') is null then
    raise exception 'Nao foi possivel determinar a equipe do fechamento';
  end if;

  if p_contingencia then
    if v_actor.perfil <> 'operador' then
      raise exception 'Contingencia deve ser registrada pela sessao do operador';
    end if;
    if p_contingencia_motivo not in (
      'Líder não está na planta',
      'Líder não lembra a senha',
      'Líder ainda não tem login'
    ) then
      raise exception 'Motivo de contingencia invalido';
    end if;
    if nullif(btrim(coalesce(p_contingencia_autorizou, '')), '') is null
       or length(p_contingencia_autorizou) > 120 then
      raise exception 'Informe corretamente quem autorizou a contingencia';
    end if;
    if v_tem_c and v_c.user_id <> v_uid then
      raise exception 'Operador nao pode fechar checklist de outro usuario';
    end if;
    if v_tem_l and not (
      v_l.operador_user_id = v_uid
      or (v_l.operador_user_id is null and v_l.operador_login = v_actor.usuario)
    ) then
      raise exception 'Operador nao pode fechar limpeza de outro usuario';
    end if;
    v_nome_assinatura := btrim(p_contingencia_autorizou) || ' (contingência)';
  else
    if v_actor.perfil not in ('lider', 'supervisor', 'gestao') then
      raise exception 'Perfil % nao pode validar', v_actor.perfil;
    end if;
    if v_actor.perfil = 'lider' and not public.pode_acessar_equipe(v_uid, v_equipe) then
      raise exception 'Lider nao pode validar equipe diferente da sua';
    end if;
    p_contingencia_autorizou := null;
    p_contingencia_motivo := null;
    v_nome_assinatura := v_actor.nome;
  end if;

  insert into public.fechamentos_validacao (
    id, data_operacao, turno, equipe, linha, maquina,
    contingencia, contingencia_motivo, contingencia_autorizou,
    registrado_por, registrado_por_login, registrado_por_nome,
    registrado_por_perfil, registrado_em, observacao
  ) values (
    p_fechamento_id, v_data, v_turno, v_equipe, v_linha, v_maquina,
    p_contingencia, p_contingencia_motivo, p_contingencia_autorizou,
    v_uid, v_actor.usuario, v_actor.nome, v_actor.perfil, v_agora,
    nullif(btrim(coalesce(p_observacao, '')), '')
  );

  if v_tem_c then
    v_sig_c := jsonb_build_object(
      'dataUrl', p_assinatura_checklist,
      'nome', v_nome_assinatura,
      'assinadoEm', v_agora
    );
    update public.checklists
    set contexto = jsonb_set(contexto, '{__assinaturas,lider}', v_sig_c, true),
        updated_at = v_agora
    where id = v_c.id;

    insert into public.validacoes_lider (
      fechamento_id, alvo_tipo, alvo_id, data_operacao, turno, equipe,
      linha, maquina, assinatura, observacao, contingencia,
      contingencia_motivo, contingencia_autorizou
    ) values (
      p_fechamento_id, 'checklist', v_c.id, v_data, v_turno, v_equipe,
      v_linha, v_maquina, v_sig_c, nullif(btrim(coalesce(p_observacao, '')), ''),
      p_contingencia, p_contingencia_motivo, p_contingencia_autorizou
    );
  end if;

  if v_tem_l then
    v_sig_l := jsonb_build_object(
      'dataUrl', p_assinatura_limpeza,
      'nome', v_nome_assinatura,
      'assinadoEm', v_agora
    );
    update public.limpeza_turnos
    set status = 'validado',
        lider_nome = v_nome_assinatura,
        assinatura_lider = v_sig_l,
        lider_assinou_em = v_agora,
        ultima_edicao_por_login = v_actor.usuario,
        ultima_edicao_por_nome = v_actor.nome,
        updated_at = v_agora
    where id = v_l.id;

    insert into public.limpeza_turnos_edicoes (
      limpeza_turno_id, folha_dia_key, turno, editado_em,
      editado_por_login, editado_por_nome, motivo_edicao,
      antes_json, depois_json
    ) values (
      v_l.id, v_l.folha_dia_key, v_l.turno, v_agora,
      v_actor.usuario, v_actor.nome,
      case when p_contingencia
        then 'Fechamento v2 em contingência'
        else 'Validação autenticada v2' end,
      to_jsonb(v_l),
      jsonb_build_object(
        'status', 'validado',
        'lider_nome', v_nome_assinatura,
        'assinatura_lider', v_sig_l,
        'lider_assinou_em', v_agora,
        'fechamento_id', p_fechamento_id
      )
    );

    insert into public.validacoes_lider (
      fechamento_id, alvo_tipo, alvo_id, data_operacao, turno, equipe,
      linha, maquina, assinatura, observacao, contingencia,
      contingencia_motivo, contingencia_autorizou
    ) values (
      p_fechamento_id, 'limpeza', v_l.id, v_data, v_turno, v_equipe,
      v_linha, v_maquina, v_sig_l, nullif(btrim(coalesce(p_observacao, '')), ''),
      p_contingencia, p_contingencia_motivo, p_contingencia_autorizou
    );
  end if;

  return jsonb_build_object(
    'fechamentoId', p_fechamento_id,
    'validadoEm', v_agora,
    'contingencia', p_contingencia,
    'nomeAssinatura', v_nome_assinatura,
    'ator', jsonb_build_object(
      'userId', v_uid,
      'login', v_actor.usuario,
      'nome', v_actor.nome,
      'perfil', v_actor.perfil
    )
  );
end;
$$;

revoke all on function public._finalizar_validacao_v2(
  boolean, uuid, text, text, text, text, text, text, text
) from public, authenticated;

create or replace function public.rpc_finalizar_validacao_lider(
  p_fechamento_id uuid,
  p_checklist_id text default null,
  p_assinatura_checklist text default null,
  p_limpeza_id text default null,
  p_assinatura_limpeza text default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._finalizar_validacao_v2(
    false, p_fechamento_id,
    p_checklist_id, p_assinatura_checklist,
    p_limpeza_id, p_assinatura_limpeza,
    null, null, p_observacao
  );
end;
$$;

create or replace function public.rpc_finalizar_validacao_contingencia(
  p_fechamento_id uuid,
  p_checklist_id text default null,
  p_assinatura_checklist text default null,
  p_limpeza_id text default null,
  p_assinatura_limpeza text default null,
  p_autorizou text default null,
  p_motivo text default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._finalizar_validacao_v2(
    true, p_fechamento_id,
    p_checklist_id, p_assinatura_checklist,
    p_limpeza_id, p_assinatura_limpeza,
    p_autorizou, p_motivo, p_observacao
  );
end;
$$;

revoke all on function public.rpc_finalizar_validacao_lider(
  uuid, text, text, text, text, text
) from public;
revoke all on function public.rpc_finalizar_validacao_contingencia(
  uuid, text, text, text, text, text, text, text
) from public;
grant execute on function public.rpc_finalizar_validacao_lider(
  uuid, text, text, text, text, text
) to authenticated;
grant execute on function public.rpc_finalizar_validacao_contingencia(
  uuid, text, text, text, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Plano de ação: PTP, autoria forte e uma escrita por RPC
-- ---------------------------------------------------------------------

alter table public.planos_acao
  drop constraint if exists planos_acao_origem_tipo_check;
alter table public.planos_acao
  add constraint planos_acao_origem_tipo_check
  check (origem_tipo in ('checklist', 'limpeza', 'ptp'));

alter table public.planos_acao
  add column if not exists checado_por_user_id uuid,
  add column if not exists checado_por_perfil text,
  add column if not exists padronizado_por_user_id uuid,
  add column if not exists padronizado_por_login text,
  add column if not exists padronizado_por_perfil text,
  add column if not exists recurso_liberado_por_user_id uuid,
  add column if not exists recurso_liberado_por_login text;

alter table public.planos_acao_eventos
  drop constraint if exists planos_acao_eventos_acao_check;
alter table public.planos_acao_eventos
  add constraint planos_acao_eventos_acao_check check (acao in (
    'criou', 'editou', 'checou', 'reprovou', 'replanejou',
    'padronizou', 'monitorou', 'girou_ciclo',
    'solicitou_recurso', 'liberou_recurso', 'cancelou'
  ));

-- Os planos criados antes desta migration podiam nascer sem equipe. Se a
-- policy nova fosse instalada assim, o Lider deixaria de ver o plano antigo
-- da propria equipe e a tela o contaria como "sem plano". Derivamos apenas
-- da origem persistida; se algum caso nao puder ser provado, abortamos.
alter table public.planos_acao disable trigger trg_carimbar_plano;
alter table public.planos_acao disable trigger trg_planos_acao_updated_at;

update public.planos_acao pa
set equipe = case pa.origem_tipo
  when 'checklist' then (
    select c.equipe
    from public.checklists c
    where c.id = pa.origem_id
  )
  when 'limpeza' then (
    select p.equipe_padrao
    from public.limpeza_turnos l
    join public.profiles p
      on p.id = l.operador_user_id
      or (l.operador_user_id is null and p.usuario = l.operador_login)
    where l.id = pa.origem_id
    order by (p.id = l.operador_user_id) desc
    limit 1
  )
  when 'ptp' then (
    select p.equipe_padrao
    from public.ptp_janelas j
    join public.profiles p
      on p.id = j.operador_user_id
      or (j.operador_user_id is null and p.usuario = j.operador_login)
    where j.id = pa.origem_id
    order by (p.id = j.operador_user_id) desc
    limit 1
  )
  else null
end
where nullif(btrim(pa.equipe), '') is null;

alter table public.planos_acao enable trigger trg_carimbar_plano;
alter table public.planos_acao enable trigger trg_planos_acao_updated_at;

do $$
declare v_total integer;
begin
  select count(*) into v_total
  from public.planos_acao
  where nullif(btrim(equipe), '') is null;
  if v_total > 0 then
    raise exception '% plano(s) sem equipe comprovavel; corrija as origens antes da migration 09',
      v_total;
  end if;
end $$;

alter table public.planos_acao alter column equipe set not null;

do $$
begin
  if exists (
    select 1 from public.planos_acao
    where status = 'aberto'
    group by origem_tipo, linha, maquina, coalesce(item_numero, -1)
    having count(*) > 1
  ) then
    raise exception 'Existem planos abertos duplicados; trate-os antes da migration 09';
  end if;
end $$;

create unique index if not exists uq_plano_problema_aberto
  on public.planos_acao(origem_tipo, linha, maquina, coalesce(item_numero, -1))
  where status = 'aberto';

create or replace function public.carimbar_plano_acao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare p public.profiles%rowtype;
begin
  select * into p from public.profiles
  where id = auth.uid() and active = true;
  if not found then raise exception 'Usuario sem perfil ativo'; end if;
  if p.somente_leitura is true then
    raise exception 'Usuario configurado como somente leitura';
  end if;

  if tg_op = 'INSERT' then
    if p.perfil not in ('lider', 'supervisor', 'gestao') then
      raise exception 'Perfil % nao pode abrir plano', p.perfil;
    end if;
    new.criado_por_user_id := auth.uid();
    new.criado_por_login := p.usuario;
    new.criado_por_nome := p.nome;
    new.criado_em := now();
    return new;
  end if;

  if new.checagem_cumprido is distinct from old.checagem_cumprido
     or new.checagem_saiu_nc is distinct from old.checagem_saiu_nc
     or new.checagem_evidencia is distinct from old.checagem_evidencia then
    if p.perfil not in ('lider', 'supervisor', 'gestao') then
      raise exception 'Perfil % nao pode checar plano', p.perfil;
    end if;
    new.checado_por_user_id := auth.uid();
    new.checado_por_login := p.usuario;
    new.checado_por_nome := p.nome;
    new.checado_por_perfil := p.perfil;
    new.checado_em := now();
  end if;

  if new.padronizacao_decisao is distinct from old.padronizacao_decisao then
    if p.perfil not in ('supervisor', 'gestao') then
      raise exception 'Decisao A exige supervisor ou gestao';
    end if;
    new.padronizado_por_user_id := auth.uid();
    new.padronizado_por_login := p.usuario;
    new.padronizado_por_nome := p.nome;
    new.padronizado_por_perfil := p.perfil;
    new.padronizado_em := now();
  end if;

  if new.recurso_liberado_em is distinct from old.recurso_liberado_em then
    if p.perfil <> 'gestao' then
      raise exception 'Liberacao de recurso exige gestao industrial';
    end if;
    new.recurso_liberado_por_user_id := auth.uid();
    new.recurso_liberado_por_login := p.usuario;
    new.recurso_liberado_por := p.nome;
    new.recurso_liberado_em := now();
  end if;

  new.criado_por_user_id := old.criado_por_user_id;
  new.criado_por_login := old.criado_por_login;
  new.criado_por_nome := old.criado_por_nome;
  new.criado_em := old.criado_em;
  return new;
end;
$$;

create or replace function public.carimbar_evento_plano()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare p public.profiles%rowtype;
begin
  select * into p from public.profiles
  where id = auth.uid() and active = true;
  if not found then raise exception 'Usuario sem perfil ativo'; end if;
  new.por_login := p.usuario;
  new.por_nome := p.nome;
  new.por_perfil := p.perfil;
  new.em := now();
  return new;
end;
$$;

drop policy if exists planos_acao_insert on public.planos_acao;
drop policy if exists planos_acao_update on public.planos_acao;
drop policy if exists planos_eventos_insert on public.planos_acao_eventos;
revoke insert, update, delete on public.planos_acao from authenticated;
revoke insert, update, delete on public.planos_acao_eventos from authenticated;

-- ---------------------------------------------------------------------
-- 5) RPC para abrir/replanejar, derivando o contexto da origem real
-- ---------------------------------------------------------------------

create or replace function public.rpc_abrir_plano(
  p_origem_tipo text,
  p_origem_id text,
  p_item_numero integer,
  p_o_que text,
  p_quem text,
  p_quando date,
  p_como text default null,
  p_substitui_plano_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.profiles%rowtype;
  c public.checklists%rowtype;
  l public.limpeza_turnos%rowtype;
  j public.ptp_janelas%rowtype;
  anterior public.planos_acao%rowtype;
  item jsonb;
  v_data date;
  v_linha text;
  v_maquina text;
  v_momento text;
  v_turno text;
  v_equipe text;
  v_acao text;
  v_id uuid;
begin
  select * into a from public.profiles
  where id = auth.uid() and active = true;
  if not found or a.somente_leitura is true
     or a.perfil not in ('lider', 'supervisor', 'gestao') then
    raise exception 'Usuario nao pode abrir plano';
  end if;
  if p_item_numero is null
     or nullif(btrim(coalesce(p_o_que, '')), '') is null
     or nullif(btrim(coalesce(p_quem, '')), '') is null
     or p_quando is null then
    raise exception 'Item, o que, quem e prazo sao obrigatorios';
  end if;
  if p_quando < (now() at time zone 'America/Manaus')::date then
    raise exception 'Prazo nao pode nascer vencido';
  end if;

  if p_origem_tipo = 'checklist' then
    select * into c from public.checklists where id = p_origem_id;
    if not found then raise exception 'Checklist de origem nao encontrado'; end if;
    select e into item
    from jsonb_array_elements(
      case when jsonb_typeof(c.respostas) = 'array' then c.respostas else '[]'::jsonb end
    ) e
    where e->>'itemNumero' = p_item_numero::text
      and e->>'resposta' = 'Não conforme'
    limit 1;
    if item is null then raise exception 'Item informado nao e uma NC do checklist'; end if;
    v_data := c.data_operacao; v_linha := c.linha; v_maquina := c.maquina;
    v_momento := c.momento; v_turno := c.turno; v_equipe := c.equipe;
    v_acao := nullif(btrim(coalesce(item->>'observacao', '')), '');

  elsif p_origem_tipo = 'limpeza' then
    select * into l from public.limpeza_turnos where id = p_origem_id;
    if not found then raise exception 'Limpeza de origem nao encontrada'; end if;
    select e into item
    from jsonb_array_elements(
      case when jsonb_typeof(l.itens_json) = 'array' then l.itens_json else '[]'::jsonb end
    ) e
    where e->>'codigo' = p_item_numero::text and e->>'status' = 'nao_realizado'
    limit 1;
    if item is null then raise exception 'Item informado nao e NR na limpeza'; end if;
    v_data := l.data_operacao; v_linha := l.linha; v_maquina := l.maquina;
    v_momento := null; v_turno := l.turno;
    v_acao := nullif(btrim(coalesce(item->>'observacao', '')), '');
    select p.equipe_padrao into v_equipe from public.profiles p
    where p.id = l.operador_user_id
       or (l.operador_user_id is null and p.usuario = l.operador_login)
    order by (p.id = l.operador_user_id) desc limit 1;

  elsif p_origem_tipo = 'ptp' then
    select * into j from public.ptp_janelas where id = p_origem_id;
    if not found then raise exception 'Janela PTP de origem nao encontrada'; end if;
    select e into item
    from jsonb_array_elements(
      case when jsonb_typeof(j.itens_json) = 'array' then j.itens_json else '[]'::jsonb end
    ) e
    where case e->>'codigo'
      when 'TAMPA_ALTA' then 1
      when 'ESTOURANDO' then 2
      when 'FINISH_QUEBRANDO' then 3
      when 'NIVEL_BAIXO' then 4
      when 'SEM_TAMPA' then 5
      else 0 end = p_item_numero
      and coalesce((e->>'quantidade')::integer, 0) > 0
    limit 1;
    if item is null then raise exception 'Item informado nao e ocorrencia do PTP'; end if;
    v_data := j.data_operacao; v_linha := j.linha; v_maquina := j.maquina;
    v_momento := 'PTP ' || j.janela_codigo;
    v_turno := case when substring(j.janela_codigo from 2)::integer <= 6
      then '12x36 Dia' else '12x36 Noite' end;
    v_acao := nullif(btrim(coalesce(j.observacao, '')), '');
    select p.equipe_padrao into v_equipe from public.profiles p
    where p.id = j.operador_user_id
       or (j.operador_user_id is null and p.usuario = j.operador_login)
    order by (p.id = j.operador_user_id) desc limit 1;
  else
    raise exception 'Origem de plano invalida';
  end if;

  if nullif(btrim(coalesce(v_equipe, '')), '') is null then
    raise exception 'Nao foi possivel determinar a equipe do problema';
  end if;
  if a.perfil = 'lider' and not public.pode_acessar_equipe(auth.uid(), v_equipe) then
    raise exception 'Lider nao pode abrir plano para outra equipe';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', 'plano', p_origem_tipo, v_linha, v_maquina, p_item_numero::text), 0
  ));

  if exists (
    select 1 from public.planos_acao
    where origem_tipo = p_origem_tipo and linha = v_linha and maquina = v_maquina
      and item_numero = p_item_numero and status = 'aberto'
  ) then
    raise exception 'Ja existe plano aberto para este problema';
  end if;

  if p_substitui_plano_id is not null then
    select * into anterior from public.planos_acao
    where id = p_substitui_plano_id for update;
    if not found or anterior.status <> 'nao_cumprido'
       or anterior.origem_tipo <> p_origem_tipo
       or anterior.linha <> v_linha or anterior.maquina <> v_maquina
       or anterior.item_numero is distinct from p_item_numero then
      raise exception 'Plano anterior incompativel com o replanejamento';
    end if;
  end if;

  insert into public.planos_acao (
    origem_tipo, origem_id, item_numero, data_operacao, linha, maquina,
    momento, turno, equipe, acao_imediata, o_que, quem, quando, como,
    status, criado_por_user_id, criado_por_login, criado_por_nome,
    substitui_plano_id
  ) values (
    p_origem_tipo, p_origem_id, p_item_numero, v_data, v_linha, v_maquina,
    v_momento, v_turno, v_equipe, v_acao, btrim(p_o_que), btrim(p_quem),
    p_quando, nullif(btrim(coalesce(p_como, '')), ''), 'aberto',
    auth.uid(), a.usuario, a.nome, p_substitui_plano_id
  ) returning id into v_id;

  insert into public.planos_acao_eventos (
    plano_id, acao, por_login, por_nome, por_perfil, antes_json, depois_json
  ) select id,
      case when p_substitui_plano_id is null then 'criou' else 'replanejou' end,
      a.usuario, a.nome, a.perfil, null, to_jsonb(pa)
    from public.planos_acao pa where pa.id = v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) RPCs C, A e recursos
-- ---------------------------------------------------------------------

create or replace function public.rpc_checar_plano(
  p_plano_id uuid,
  p_cumprido boolean,
  p_saiu_nc boolean,
  p_evidencia text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare a public.profiles%rowtype; p public.planos_acao%rowtype;
begin
  select * into a from public.profiles where id = auth.uid() and active = true;
  if not found or a.somente_leitura is true
     or a.perfil not in ('lider', 'supervisor', 'gestao') then
    raise exception 'Usuario nao pode checar plano';
  end if;
  if p_cumprido is null or p_saiu_nc is null
     or nullif(btrim(coalesce(p_evidencia, '')), '') is null then
    raise exception 'As respostas e a evidencia da checagem sao obrigatorias';
  end if;
  select * into p from public.planos_acao where id = p_plano_id for update;
  if not found or p.status <> 'aberto' then raise exception 'Plano nao esta aberto'; end if;
  if a.perfil = 'lider' and not public.pode_acessar_equipe(auth.uid(), p.equipe) then
    raise exception 'Lider nao pode checar plano de outra equipe';
  end if;
  update public.planos_acao set
    status = case when p_cumprido and p_saiu_nc then 'cumprido' else 'nao_cumprido' end,
    checagem_cumprido = p_cumprido,
    checagem_saiu_nc = p_saiu_nc,
    checagem_evidencia = btrim(p_evidencia),
    checado_por_user_id = auth.uid(), checado_por_login = a.usuario,
    checado_por_nome = a.nome, checado_por_perfil = a.perfil, checado_em = now()
  where id = p_plano_id;
  insert into public.planos_acao_eventos (
    plano_id, acao, por_login, por_nome, por_perfil, antes_json, depois_json, observacao
  ) select id, case when p_cumprido and p_saiu_nc then 'checou' else 'reprovou' end,
      a.usuario, a.nome, a.perfil, to_jsonb(p), to_jsonb(pa), btrim(p_evidencia)
    from public.planos_acao pa where pa.id = p_plano_id;
  return p_plano_id;
end;
$$;

create or replace function public.rpc_padronizar_plano(
  p_plano_id uuid,
  p_decisao text,
  p_analise text,
  p_padrao_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare a public.profiles%rowtype; p public.planos_acao%rowtype;
begin
  select * into a from public.profiles where id = auth.uid() and active = true;
  if not found or a.somente_leitura is true or a.perfil not in ('supervisor', 'gestao') then
    raise exception 'Somente supervisor ou gestao decide o A';
  end if;
  if p_decisao not in ('padronizar', 'monitorar', 'girar')
     or nullif(btrim(coalesce(p_analise, '')), '') is null then
    raise exception 'Decisao e analise sao obrigatorias';
  end if;
  if p_decisao = 'padronizar' and nullif(btrim(coalesce(p_padrao_ref, '')), '') is null then
    raise exception 'Padronizacao exige documento e revisao';
  end if;
  select * into p from public.planos_acao where id = p_plano_id for update;
  if not found or p.status <> 'cumprido'
     or p.checagem_cumprido is not true or p.checagem_saiu_nc is not true then
    raise exception 'Decisao A exige checagem aprovada';
  end if;
  if p.padronizado_em is not null then raise exception 'Plano ja recebeu decisao A'; end if;
  update public.planos_acao set
    status = case when p_decisao = 'girar' then 'nao_cumprido' else status end,
    padronizacao_analise = btrim(p_analise),
    padronizacao_decisao = p_decisao,
    padrao_ref = case when p_decisao = 'padronizar' then btrim(p_padrao_ref) else null end,
    padronizado_por_user_id = auth.uid(), padronizado_por_login = a.usuario,
    padronizado_por_nome = a.nome, padronizado_por_perfil = a.perfil,
    padronizado_em = now()
  where id = p_plano_id;
  insert into public.planos_acao_eventos (
    plano_id, acao, por_login, por_nome, por_perfil, antes_json, depois_json, observacao
  ) select id,
      case p_decisao when 'padronizar' then 'padronizou'
        when 'monitorar' then 'monitorou' else 'girou_ciclo' end,
      a.usuario, a.nome, a.perfil, to_jsonb(p), to_jsonb(pa), btrim(p_analise)
    from public.planos_acao pa where pa.id = p_plano_id;
  return p_plano_id;
end;
$$;

create or replace function public.rpc_liberar_recurso_plano(
  p_plano_id uuid,
  p_observacao text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare a public.profiles%rowtype; p public.planos_acao%rowtype;
begin
  select * into a from public.profiles where id = auth.uid() and active = true;
  if not found or a.somente_leitura is true or a.perfil <> 'gestao' then
    raise exception 'Somente a gestao industrial libera recurso';
  end if;
  if nullif(btrim(coalesce(p_observacao, '')), '') is null then
    raise exception 'Descreva o recurso liberado ou o encaminhamento';
  end if;
  select * into p from public.planos_acao where id = p_plano_id for update;
  if not found or p.status <> 'aberto' then raise exception 'Recurso exige plano aberto'; end if;
  if p.recurso_liberado_em is not null then return p_plano_id; end if;
  update public.planos_acao set
    recurso_solicitado = true,
    recurso_observacao = btrim(p_observacao),
    recurso_liberado_por_user_id = auth.uid(),
    recurso_liberado_por_login = a.usuario,
    recurso_liberado_por = a.nome,
    recurso_liberado_em = now()
  where id = p_plano_id;
  insert into public.planos_acao_eventos (
    plano_id, acao, por_login, por_nome, por_perfil, antes_json, depois_json, observacao
  ) select id, 'liberou_recurso', a.usuario, a.nome, a.perfil,
      to_jsonb(p), to_jsonb(pa), btrim(p_observacao)
    from public.planos_acao pa where pa.id = p_plano_id;
  return p_plano_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) Leitura dos planos por escopo e grants das RPCs
-- ---------------------------------------------------------------------

drop policy if exists planos_acao_select on public.planos_acao;
create policy planos_acao_select_escopo_v2
  on public.planos_acao for select to authenticated
  using (
    public.is_active_user(auth.uid())
    and (
      public.pode_acessar_equipe(auth.uid(), equipe)
      or criado_por_user_id = auth.uid()
      or (origem_tipo = 'checklist' and exists (
        select 1 from public.checklists c where c.id = origem_id and c.user_id = auth.uid()
      ))
      or (origem_tipo = 'limpeza' and exists (
        select 1 from public.limpeza_turnos l
        where l.id = origem_id and (
          l.operador_user_id = auth.uid()
          or (l.operador_user_id is null and l.operador_login = (
            select pr.usuario from public.profiles pr where pr.id = auth.uid()
          ))
        )
      ))
      or (origem_tipo = 'ptp' and exists (
        select 1 from public.ptp_janelas j
        where j.id = origem_id and (
          j.operador_user_id = auth.uid()
          or (j.operador_user_id is null and j.operador_login = (
            select pr.usuario from public.profiles pr where pr.id = auth.uid()
          ))
        )
      ))
    )
  );

drop policy if exists planos_eventos_select on public.planos_acao_eventos;
create policy planos_eventos_select_escopo_v2
  on public.planos_acao_eventos for select to authenticated
  using (exists (
    select 1 from public.planos_acao p where p.id = planos_acao_eventos.plano_id
  ));

revoke all on function public.rpc_abrir_plano(
  text, text, integer, text, text, date, text, uuid
) from public;
revoke all on function public.rpc_checar_plano(uuid, boolean, boolean, text) from public;
revoke all on function public.rpc_padronizar_plano(uuid, text, text, text) from public;
revoke all on function public.rpc_liberar_recurso_plano(uuid, text) from public;

grant execute on function public.rpc_abrir_plano(
  text, text, integer, text, text, date, text, uuid
) to authenticated;
grant execute on function public.rpc_checar_plano(uuid, boolean, boolean, text) to authenticated;
grant execute on function public.rpc_padronizar_plano(uuid, text, text, text) to authenticated;
grant execute on function public.rpc_liberar_recurso_plano(uuid, text) to authenticated;

commit;

-- =====================================================================
-- CONFERÊNCIA SOMENTE LEITURA (executada depois da migration)
-- =====================================================================
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'rpc_finalizar_validacao_lider',
    'rpc_finalizar_validacao_contingencia',
    'rpc_abrir_plano', 'rpc_checar_plano',
    'rpc_padronizar_plano', 'rpc_liberar_recurso_plano'
  )
order by proname;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'checklists', 'profiles', 'limpeza_turnos', 'ptp_janelas',
    'fechamentos_validacao', 'validacoes_lider',
    'planos_acao', 'planos_acao_eventos'
  )
order by tablename, cmd, policyname;

-- Não aplique o corte da v1 nesta migration. Depois do rollout completo,
-- criar migration 10 para rejeitar assinatura de líder fora das RPCs.
