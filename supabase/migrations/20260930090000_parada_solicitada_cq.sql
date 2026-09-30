-- Adiciona a parada solicitada pelo CQ ao catalogo de motivos da Filial.
begin;

alter table public.producao_horaria
  drop constraint if exists producao_horaria_motivo_catalogo;
alter table public.producao_horaria
  add constraint producao_horaria_motivo_catalogo check (
    motivo_parada_codigo is null
    or motivo_parada_codigo in (
      'parada_sopradora', 'sopradora_engate_saida',
      'sopradora_forno_preforma', 'sopradora_eixo_servo',
      'parada_rotuladora', 'rotuladora_marca_corte',
      'falha_codificacao', 'transporte_aereo', 'baixa_pressao_ar',
      'troca_sabor', 'troca_tamanho', 'limpeza', 'refeicao', 'inventario',
      'troca_turno', 'falta_efetivo', 'falta_energia',
      'aguardando_qualidade', 'parada_solicitada_cq', 'sem_programacao',
      'manutencao_planejada', 'nao_identificado', 'outro_nao_listado'
    )
    or (maquina in (
      'Enchedora 2', 'Enchedora 3', 'Enchedora Matriz 1', 'Enchedora Matriz 2'
    )
      and motivo_parada_codigo in (
        'parada_empacotadora', 'ajuste_enchedora', 'falha_enchedora',
        'falha_carbonatacao', 'cip_assepsia', 'falta_garrafas',
        'falta_tampas', 'falta_xarope'
      ))
    or (maquina in (
      'Empacotadora 2', 'Empacotadora 3', 'Empacotadora Matriz 1', 'Empacotadora Matriz 2'
    )
      and motivo_parada_codigo in (
        'parada_enchedora', 'ajuste_empacotadora', 'falha_empacotadora',
        'troca_bobina_filme', 'filme_selagem', 'esteira_transporte',
        'paletizacao', 'falta_filme'
      ))
  );

commit;
