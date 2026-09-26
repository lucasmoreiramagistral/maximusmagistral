-- Somente leitura. Rode antes e depois da migration de assinatura; compare
-- assinaturas_existentes e assinatura_fingerprint para confirmar que as linhas
-- antigas não foram alteradas. Não exibe imagem nem dados pessoais.
with assinatura_resumo as (
  select
    count(*) filter (where assinatura_lider is not null) as assinaturas_existentes,
    count(*) filter (
      where assinatura_lider is not null
        and assinatura_lider->>'userId' is null
    ) as assinaturas_legadas_sem_uid,
    md5(coalesce(string_agg(
      id::text || ':' || md5(assinatura_lider::text),
      '|' order by id
    ) filter (where assinatura_lider is not null), '')) as assinatura_fingerprint
  from public.producao_horaria
), rpc as (
  select to_regprocedure(
    'public.rpc_assinar_hora_lider(uuid,timestamptz,text)'
  ) as oid
)
select
  rpc.oid is not null as rpc_instalada,
  coalesce(has_function_privilege('authenticated', rpc.oid, 'EXECUTE'), false)
    as rpc_permitida_authenticated,
  coalesce(has_function_privilege('anon', rpc.oid, 'EXECUTE'), false)
    as rpc_permitida_anon,
  exists (
    select 1 from pg_trigger
     where tgrelid = 'public.producao_horaria'::regclass
       and tgname = 'trg_maximus_assinatura_hora_direta'
       and tgenabled = 'O' and not tgisinternal
  ) as trigger_bloqueio_ativo,
  assinatura_resumo.assinaturas_existentes,
  assinatura_resumo.assinaturas_legadas_sem_uid,
  assinatura_resumo.assinatura_fingerprint
from assinatura_resumo cross join rpc;
