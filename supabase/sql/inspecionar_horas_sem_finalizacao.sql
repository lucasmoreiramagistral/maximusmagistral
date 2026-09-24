-- Somente leitura. O contador de finalizado_em NULL nao distingue legado de
-- registros em branco. Agrupar antes de interpretar o total da verificacao.
select
  data_operacao,
  maquina,
  case
    when quantidade is not null or nao_rodou is true then 'preenchida_sem_carimbo'
    else 'em_branco'
  end as situacao,
  count(*) as horas,
  min(created_at at time zone 'America/Manaus') as primeira_criacao_manaus,
  max(created_at at time zone 'America/Manaus') as ultima_criacao_manaus
from public.producao_horaria
where finalizado_em is null
group by data_operacao, maquina, situacao
order by data_operacao, maquina, situacao;
