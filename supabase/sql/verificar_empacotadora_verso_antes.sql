-- Somente leitura. Executar antes de criar o verso das empacotadoras.
-- As tabelas devem estar ausentes; as tres funcoes devem existir.
select
  to_regclass('public.empacotadora_bobinas') as tabela_bobinas,
  to_regclass('public.empacotadora_consolidacoes') as tabela_consolidacoes,
  to_regprocedure('public.maximus_operador_da_maquina(text)') is not null
    as funcao_operador_maquina,
  to_regprocedure('public.is_gestao(uuid)') is not null
    as funcao_gestao,
  to_regprocedure('public.touch_updated_at()') is not null
    as funcao_updated_at;

-- Mostra quais perfis seriam reconhecidos pela policy de leitura do verso.
-- Nao altera perfis nem expõe nomes individuais.
select
  perfil,
  count(*) as usuarios_ativos,
  count(*) filter (where public.is_gestao(id)) as reconhecidos_como_gestao
from public.profiles
where active = true
group by perfil
order by perfil;
