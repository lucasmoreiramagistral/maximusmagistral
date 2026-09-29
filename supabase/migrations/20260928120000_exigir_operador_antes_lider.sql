-- Ativar somente depois de publicar o novo app e recarregar os tablets.
-- Nas horas novas, o líder valida após a assinatura desenhada pelo operador.
-- Horas históricas preenchidas sem finalizado_em mantêm o fluxo anterior.
begin;

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
  -- OLD impede que as duas assinaturas sejam introduzidas no mesmo UPDATE.
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

commit;
