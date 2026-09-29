-- Somente leitura. Executar apos 20260929100000_permitir_hora_atrasada.sql.
with definicao as (
  select pg_get_functiondef(
    'public.maximus_exigir_hora_encerrada_manaus(date,text)'::regprocedure
  ) as corpo
)
select
  corpo ilike '%clock_timestamp() < v_fim%' as exige_hora_encerrada,
  corpo not ilike '%interval ''20 minutes''%' as sem_bloqueio_apos_corte,
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.producao_horaria'::regclass
      and tgname = 'trg_maximus_travar_hora_finalizada'
      and not tgisinternal
  ) as trava_de_hora_confirmada_ativa
from definicao;
