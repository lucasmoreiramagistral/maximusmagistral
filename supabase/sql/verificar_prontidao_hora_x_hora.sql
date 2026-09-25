-- Somente leitura. Nao retorna nomes nem valores de producao.
-- Execute no SQL Editor depois das migrations de maquinas e verso.
-- A estrutura pode estar correta mesmo sem operadores das maquinas novas.
with maquinas (maquina_id, maquina) as (
  values
    ('enchedora-2', 'Enchedora 2'),
    ('enchedora-3', 'Enchedora 3'),
    ('empacotadora-2', 'Empacotadora 2'),
    ('empacotadora-3', 'Empacotadora 3')
)
select
  m.maquina,
  (select count(*) from public.profiles p
    where p.perfil = 'operador' and p.active = true
      and p.maquina_id = m.maquina_id) as operadores_ativos,
  (select count(*) from public.producao_horaria h
    where h.maquina = m.maquina and h.finalizado_em is not null) as horas_confirmadas,
  (select count(*) from public.producao_horaria h
    where h.maquina = m.maquina and h.finalizado_em is null
      and (h.quantidade is not null or h.nao_rodou = true)) as horas_legadas_preenchidas,
  (select max(h.data_operacao) from public.producao_horaria h
    where h.maquina = m.maquina and h.finalizado_em is not null) as ultimo_dia_confirmado
from maquinas m
order by m.maquina_id;
