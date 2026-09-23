-- Somente leitura. Confirma os nomes ja gravados antes de aplicar a policy
-- que vincula os operadores a Enchedora 2/3 ou Empacotadora 2/3.
with registros as (
  select 'anomalias'::text as tabela, maquina from public.anomalias
  union all select 'checklists', maquina from public.checklists
  union all select 'limpeza_turnos', maquina from public.limpeza_turnos
  union all select 'producao_apoio', maquina from public.producao_apoio
  union all select 'producao_horaria', maquina from public.producao_horaria
  union all select 'producao_passagem_turno', maquina from public.producao_passagem_turno
  union all select 'producao_tanques', maquina from public.producao_tanques
  union all select 'ptp_janelas', maquina from public.ptp_janelas
)
select tabela, coalesce(maquina, '<NULL>') as maquina, count(*) as registros
  from registros
 group by tabela, maquina
 order by tabela, maquina;
