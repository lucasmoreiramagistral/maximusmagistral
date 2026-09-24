-- Somente leitura. Executar antes de criar o verso das empacotadoras.
-- Uma consulta/um resultado: tabelas ausentes, funcoes presentes e perfis.
-- Nao altera perfis nem expoe nomes individuais.
with estrutura as (
  select
    to_regclass('public.empacotadora_bobinas') is null as bobinas_ausente,
    to_regclass('public.empacotadora_consolidacoes') is null
      as consolidacoes_ausente,
    to_regprocedure('public.maximus_operador_da_maquina(text)') is not null
      as funcao_operador_maquina,
    to_regprocedure('public.is_gestao(uuid)') is not null as funcao_gestao,
    to_regprocedure('public.touch_updated_at()') is not null
      as funcao_updated_at
), perfis as (
  select
    perfil,
    count(*) as usuarios_ativos,
    count(*) filter (where public.is_gestao(id)) as reconhecidos_como_gestao
  from public.profiles
  where active = true
  group by perfil
)
select estrutura.*, perfis.*
from estrutura cross join perfis
order by perfis.perfil;
