-- O líder pode assinar na tela aberta pelo operador, como na folha física.
-- A imutabilidade da produção e a assinatura única continuam protegidas por
-- maximus_travar_hora_finalizada(). A RPC permanece disponível para o Farol.
begin;

drop trigger if exists trg_maximus_assinatura_hora_direta
  on public.producao_horaria;

commit;
