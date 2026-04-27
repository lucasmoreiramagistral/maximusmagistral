// Tipos para tutoriais de software (ex.: SIGMA Manutenção) consumidos do
// Supabase Storage. Diferente das ITs (que são imagens grandes tipo página
// de PDF), aqui cada passo tem texto explicativo + imagem de tela.

export interface TutorialStep {
  step: number;
  title: string;
  description: string;
  image: string;
}

export interface TutorialManifest {
  id: string;
  title: string;
  subtitle: string;
  version: string;
  trigger: string;
  steps: TutorialStep[];
}
