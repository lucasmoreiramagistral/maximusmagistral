-- Aplicar após publicar o frontend que chama rpc_assinar_hora_lider.
-- Impede que o login do operador envie diretamente os campos da assinatura.
begin;

create or replace function public.maximus_bloquear_assinatura_hora_direta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Administração via SQL Editor continua possível; uma chave de API, inclusive
  -- service_role, não equivale a uma sessão SQL de manutenção.
  if session_user = 'postgres' and auth.role() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.lider_nome is not null or new.assinatura_lider is not null
       or new.lider_assinou_em is not null then
      raise exception 'Assinatura do líder somente pela validação autenticada.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.lider_nome is distinct from old.lider_nome
     or new.assinatura_lider is distinct from old.assinatura_lider
     or new.lider_assinou_em is distinct from old.lider_assinou_em then
    if auth.role() is distinct from 'authenticated'
       or auth.uid() is null
       or current_setting('app.maximus_hora_lider_rpc', true) is distinct from
          auth.uid()::text || ':' || new.id::text then
      raise exception 'Assinatura do líder somente pela validação autenticada.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.maximus_bloquear_assinatura_hora_direta() from public;

drop trigger if exists trg_maximus_assinatura_hora_direta on public.producao_horaria;
create trigger trg_maximus_assinatura_hora_direta
  before insert or update on public.producao_horaria
  for each row execute function public.maximus_bloquear_assinatura_hora_direta();

commit;
