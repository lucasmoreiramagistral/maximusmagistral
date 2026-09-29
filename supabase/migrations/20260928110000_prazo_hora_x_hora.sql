-- Ativar somente depois de publicar o novo app e recarregar os tablets.
-- O card das HH:20 registra definitivamente o que foi confirmado até o corte.
-- Rejeitar uma confirmação posterior evita que o painel passe a mostrar uma
-- hora que o card imutável marcou como "Não realizado".
begin;

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
  v_agora timestamptz;
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
  v_agora := clock_timestamp();

  if v_agora < v_fim then
    raise exception 'A hora ainda nao terminou no horario de Manaus.'
      using errcode = '23514';
  end if;
  if v_agora >= v_fim + interval '20 minutes' then
    raise exception 'O prazo de 20 minutos para salvar esta hora terminou.'
      using errcode = '23514';
  end if;
end;
$$;

commit;
