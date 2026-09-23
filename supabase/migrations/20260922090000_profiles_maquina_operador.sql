-- Aplicar antes de publicar o código que lê/grava profiles.maquina_id.
-- Todos os operadores já existentes pertencem ao app original da Enchedora 3.
-- Novos operadores precisam receber a máquina explicitamente no cadastro.
begin;

alter table public.profiles
  add column if not exists maquina_id text;

-- O gatilho de auth.users que cria profiles pode nao listar maquina_id entre
-- as colunas inseridas (foi instalado antes desta coluna existir). O novo
-- cadastro administrativo ja envia maquina_id em user_metadata; copiamos esse
-- valor antes do CHECK sem reescrever o gatilho historico de autenticacao.
-- Um cadastro novo sempre comeca inativo. Somente o fluxo administrativo
-- ativa o perfil depois de preencher/validar seus dados. Isso tambem evita
-- que self-signup usando user_metadata se declare gestao e ganhe acesso.
create or replace function public.maximus_profile_maquina_from_auth_metadata()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v_maquina text;
begin
  new.active := false;
  if new.perfil = 'operador' and new.maquina_id is null then
    select nullif(u.raw_user_meta_data->>'maquina_id', '')
      into v_maquina
      from auth.users u where u.id = new.id;
    new.maquina_id := v_maquina;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.profiles'::regclass
       and tgname = 'trg_maximus_profile_maquina_from_auth_metadata'
       and not tgisinternal
  ) then
    create trigger trg_maximus_profile_maquina_from_auth_metadata
      before insert on public.profiles
      for each row execute function public.maximus_profile_maquina_from_auth_metadata();
  end if;
end;
$$;

update public.profiles
   set maquina_id = 'enchedora-3'
 where perfil = 'operador'
   and maquina_id is null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_maquina_id_check'
  ) then
    alter table public.profiles
      add constraint profiles_maquina_id_check
      check (
        maquina_id is null or maquina_id in (
          'enchedora-2',
          'enchedora-3',
          'empacotadora-2',
          'empacotadora-3'
        )
      );
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_operador_maquina_obrigatoria'
  ) then
    alter table public.profiles
      add constraint profiles_operador_maquina_obrigatoria
      check (perfil <> 'operador' or maquina_id is not null);
  end if;
end;
$$;

comment on column public.profiles.maquina_id is
  'Máquina atribuída ao login; obrigatória para todo operador.';

commit;
