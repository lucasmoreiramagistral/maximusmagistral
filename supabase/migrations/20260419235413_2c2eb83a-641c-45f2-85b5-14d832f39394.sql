ALTER TABLE public.anomalia_atualizacoes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.anomalia_atualizacoes;