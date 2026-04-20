
-- ============================================
-- ENUMS / domínio fixo via CHECK constraints
-- ============================================

-- ============================================
-- TABELA profiles
-- ============================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  usuario text NOT NULL UNIQUE,
  email_interno text NOT NULL UNIQUE,
  perfil text NOT NULL CHECK (perfil IN ('operador', 'gestao')),
  equipe_padrao text NULL CHECK (equipe_padrao IN ('Karolainny', 'Valderlan', 'Nilson', 'Bruno')),
  turno_padrao text NULL CHECK (turno_padrao IN ('12x36 Dia', '12x36 Noite', '3º Turno')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Função SECURITY DEFINER para verificar se é gestão (evita recursão de RLS)
CREATE OR REPLACE FUNCTION public.is_gestao(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND perfil = 'gestao' AND active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.is_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND active = true
  )
$$;

-- Policies profiles
CREATE POLICY "Usuário lê o próprio profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Gestão lê todos os profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_gestao(auth.uid()));

-- ============================================
-- TABELA checklists
-- ============================================
CREATE TABLE public.checklists (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  operador_login text NOT NULL,
  operador_responsavel text NOT NULL,

  contexto jsonb NOT NULL,
  respostas jsonb NOT NULL,

  momento text NOT NULL,
  status text NOT NULL CHECK (status IN ('rascunho', 'concluido')),

  data_operacao date NOT NULL,
  turno text NOT NULL CHECK (turno IN ('12x36 Dia', '12x36 Noite', '3º Turno')),
  equipe text NOT NULL CHECK (equipe IN ('Karolainny', 'Valderlan', 'Nilson', 'Bruno')),
  linha text NOT NULL,
  area text NOT NULL,
  maquina text NOT NULL,
  equipamento text NOT NULL,

  folha_key text NOT NULL,
  verificacao_numero integer NOT NULL CHECK (verificacao_numero BETWEEN 1 AND 3),

  total_conformes integer NOT NULL DEFAULT 0,
  total_nao_conformes integer NOT NULL DEFAULT 0,
  total_na integer NOT NULL DEFAULT 0,
  total_anomalias integer NOT NULL DEFAULT 0,

  criado_em timestamptz NOT NULL,
  concluido_em timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_checklists_user_id ON public.checklists(user_id);
CREATE INDEX idx_checklists_data ON public.checklists(data_operacao DESC);
CREATE INDEX idx_checklists_turno ON public.checklists(turno);
CREATE INDEX idx_checklists_equipe ON public.checklists(equipe);
CREATE INDEX idx_checklists_momento ON public.checklists(momento);
CREATE INDEX idx_checklists_folha ON public.checklists(folha_key);

CREATE POLICY "Operador insere próprio checklist"
  ON public.checklists FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_active(auth.uid()));

CREATE POLICY "Operador atualiza próprio checklist"
  ON public.checklists FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Operador lê próprios checklists"
  ON public.checklists FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Gestão lê todos checklists"
  ON public.checklists FOR SELECT
  TO authenticated
  USING (public.is_gestao(auth.uid()));

-- ============================================
-- TABELA anomalias
-- ============================================
CREATE TABLE public.anomalias (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  operador_login text NOT NULL,
  operador_responsavel text NOT NULL,

  checklist_id text NULL REFERENCES public.checklists(id) ON DELETE SET NULL,
  item_origem jsonb NULL,

  linha text NOT NULL,
  area text NOT NULL,
  maquina text NOT NULL,
  equipamento text NOT NULL,

  data_operacao date NOT NULL,
  turno text NOT NULL CHECK (turno IN ('12x36 Dia', '12x36 Noite', '3º Turno')),
  equipe text NOT NULL CHECK (equipe IN ('Karolainny', 'Valderlan', 'Nilson', 'Bruno')),
  folha_key text NULL,
  momento text NULL,

  categoria text NOT NULL,
  criticidade text NOT NULL,
  descricao text NOT NULL,
  status text NOT NULL CHECK (status IN ('Aberta', 'Em andamento', 'Resolvida')),

  criado_em timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.anomalias ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_anomalias_user_id ON public.anomalias(user_id);
CREATE INDEX idx_anomalias_data ON public.anomalias(data_operacao DESC);
CREATE INDEX idx_anomalias_turno ON public.anomalias(turno);
CREATE INDEX idx_anomalias_equipe ON public.anomalias(equipe);
CREATE INDEX idx_anomalias_status ON public.anomalias(status);
CREATE INDEX idx_anomalias_checklist ON public.anomalias(checklist_id);
CREATE INDEX idx_anomalias_folha ON public.anomalias(folha_key);

CREATE POLICY "Operador insere própria anomalia"
  ON public.anomalias FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_active(auth.uid()));

CREATE POLICY "Operador atualiza própria anomalia"
  ON public.anomalias FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Operador lê próprias anomalias"
  ON public.anomalias FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Gestão lê todas anomalias"
  ON public.anomalias FOR SELECT
  TO authenticated
  USING (public.is_gestao(auth.uid()));

-- ============================================
-- Trigger automática para criar profile no signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, usuario, email_interno, perfil, equipe_padrao, turno_padrao, active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'usuario', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'perfil', 'operador'),
    NULLIF(NEW.raw_user_meta_data->>'equipe_padrao', ''),
    NULLIF(NEW.raw_user_meta_data->>'turno_padrao', ''),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Trigger updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_checklists_updated_at
  BEFORE UPDATE ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_anomalias_updated_at
  BEFORE UPDATE ON public.anomalias
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================
-- Realtime
-- ============================================
ALTER TABLE public.checklists REPLICA IDENTITY FULL;
ALTER TABLE public.anomalias REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklists;
ALTER PUBLICATION supabase_realtime ADD TABLE public.anomalias;
