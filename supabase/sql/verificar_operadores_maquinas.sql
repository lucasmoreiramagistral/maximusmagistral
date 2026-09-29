-- Somente leitura. Mostra a cobertura de login por máquina, sem dados pessoais.
with maquinas(maquina_id, nome) as (
  values
    ('enchedora-2', 'Enchedora 2'),
    ('enchedora-3', 'Enchedora 3'),
    ('empacotadora-2', 'Empacotadora 2'),
    ('empacotadora-3', 'Empacotadora 3')
)
select m.nome as maquina,
       count(p.id) filter (where p.active = true) as operadores_ativos
  from maquinas m
  left join public.profiles p
    on p.maquina_id = m.maquina_id and p.perfil = 'operador'
 group by m.nome
 order by m.nome;
