import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Factory,
  HardHat,
  ClipboardCheck,
  Loader2,
  ShieldCheck,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuthLoading, useUsuario } from "@/hooks/use-storage";
import type { PerfilAtivo } from "@/lib/checklist/types";
import {
  PERFIS_ATIVOS,
  PERFIL_INFO,
  ROTA_INICIAL,
  ehPerfilAtivo,
} from "@/lib/checklist/types";
import { cn } from "@/lib/utils";
import { TelaCarregando } from "@/components/tela-carregando";
import logoMagistral from "@/assets/logo-magistral.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Entrar — Checklist Operacional" },
      {
        name: "description",
        content: "Entre no checklist operacional digital da Linha 3 — Enchedora 3.",
      },
    ],
  }),
  component: LoginPage,
});

const ICONE_PERFIL: Record<PerfilAtivo, React.ReactNode> = {
  operador: <HardHat className="h-7 w-7" />,
  lider: <ShieldCheck className="h-7 w-7" />,
  supervisor: <ClipboardList className="h-7 w-7" />,
  gestao: <Factory className="h-7 w-7" />,
};

/**
 * Converte o "usuário interno" (ex.: "joao.silva") em e-mail válido para o
 * Supabase Auth. Mantemos esse domínio fixo para não expor e-mails reais.
 * O profile.email_interno deve seguir o mesmo padrão.
 */
function loginParaEmail(login: string): string {
  const limpo = login.trim().toLowerCase();
  if (limpo.includes("@")) return limpo;
  return `${limpo}@magistral.internal`;
}

function mensagemErroLogin(error: { code?: string; message?: string } | null): string {
  if (!error) return "Usuário ou senha inválidos";

  if (error.code === "invalid_credentials") {
    return "Usuário ou senha inválidos";
  }

  if (error.code === "email_not_confirmed") {
    return "E-mail ainda não confirmado. Verifique sua caixa de entrada.";
  }

  if (error.message?.toLowerCase().includes("invalid login credentials")) {
    return "Usuário ou senha inválidos";
  }

  return "Erro ao entrar. Tente novamente.";
}

function LoginPage() {
  const navigate = useNavigate();
  const usuarioAtual = useUsuario();
  const authLoading = useAuthLoading();
  const [perfilSel, setPerfilSel] = useState<PerfilAtivo>("operador");
  const [usuario, setUsuarioInput] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // Se já estiver logado E o profile já carregado, redireciona direto.
  // Importante: só age depois que authLoading=false para evitar loop.
  useEffect(() => {
    if (authLoading) return;
    if (!usuarioAtual) return;
    if (!ehPerfilAtivo(usuarioAtual.perfil)) {
      void supabase.auth.signOut();
      setRedirecting(false);
      setErro(
        "Este perfil não tem mais acesso ao app. Procure a supervisão.",
      );
      return;
    }
    setRedirecting(true);
    navigate({ to: ROTA_INICIAL[usuarioAtual.perfil] });
  }, [authLoading, usuarioAtual, navigate]);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");

    const usuarioLimpo = usuario.trim();
    const senhaLimpa = senha.trim();

    if (!usuarioLimpo) {
      setErro("Informe o usuário");
      return;
    }
    if (!senhaLimpa) {
      setErro("Informe a senha");
      return;
    }

    setLoading(true);
    let sucesso = false;

    try {
      const email = loginParaEmail(usuarioLimpo);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: senhaLimpa,
      });

      if (error) {
        setErro(mensagemErroLogin(error));
        return;
      }

      if (!data.user) {
        setErro("Usuário ou senha inválidos");
        return;
      }

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("perfil, active")
        .eq("id", data.user.id)
        .maybeSingle();

      if (pErr || !profile) {
        await supabase.auth.signOut();
        setErro("Perfil não encontrado. Procure o supervisor.");
        return;
      }

      if (!profile.active) {
        await supabase.auth.signOut();
        setErro("Usuário inativo. Procure o supervisor.");
        return;
      }

      if (!ehPerfilAtivo(profile.perfil)) {
        await supabase.auth.signOut();
        setErro("Este perfil não tem mais acesso ao app. Procure a supervisão.");
        return;
      }

      if (profile.perfil !== perfilSel) {
        await supabase.auth.signOut();
        setErro(
          `Esta conta é do perfil "${PERFIL_INFO[profile.perfil].titulo}". Selecione o perfil correto.`,
        );
        return;
      }

      sucesso = true;
      setRedirecting(true);
      navigate({ to: ROTA_INICIAL[perfilSel] });
    } catch (err) {
      console.error(err);
      setErro("Erro ao entrar. Tente novamente.");
    } finally {
      if (!sucesso) {
        setLoading(false);
      }
    }
  };

  return (
    <div className="relative min-h-screen bg-background">
      {(redirecting || loading) && (
        <div className="fixed inset-0 z-50">
          <TelaCarregando texto="Carregando acesso..." />
        </div>
      )}
      <img
        src={logoMagistral}
        alt="Logo Magistral"
        className="absolute left-4 top-4 h-16 w-auto md:left-6 md:top-6 md:h-20"
      />
      <div className="mx-auto flex min-h-screen w-full max-w-[1100px] flex-col items-center justify-center px-4 py-8 md:px-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <ClipboardCheck className="h-9 w-9" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Checklist Operacional
          </h1>
          <p className="mt-2 text-base text-muted-foreground md:text-lg">Linha 3 — Enchedora 3</p>
        </div>

        <div className="w-full max-w-4xl rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <form onSubmit={entrar} className="space-y-6">
            <div>
              <Label className="mb-3 block text-base font-semibold">Selecione o perfil</Label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {PERFIS_ATIVOS.map((p) => (
                  <PerfilCard
                    key={p}
                    icon={ICONE_PERFIL[p]}
                    titulo={PERFIL_INFO[p].titulo}
                    descricao={PERFIL_INFO[p].descricao}
                    etapas={PERFIL_INFO[p].etapas}
                    ativo={perfilSel === p}
                    onClick={() => setPerfilSel(p)}
                    disabled={loading || redirecting}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="usuario" className="text-base">
                  Usuário
                </Label>
                <Input
                  id="usuario"
                  value={usuario}
                  onChange={(e) => {
                    setUsuarioInput(e.target.value);
                    setErro("");
                  }}
                  className="mt-1.5 h-12 text-base"
                  placeholder="Digite seu usuário"
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
              <div>
                <Label htmlFor="senha" className="text-base">
                  Senha
                </Label>
                <Input
                  id="senha"
                  type="password"
                  value={senha}
                  onChange={(e) => {
                    setSenha(e.target.value);
                    setErro("");
                  }}
                  className="mt-1.5 h-12 text-base"
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  disabled={loading}
                />
              </div>
            </div>

            {erro && (
              <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
                {erro}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="h-14 w-full text-base font-semibold"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Entrando…
                </>
              ) : (
                "Entrar"
              )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Use o usuário e senha fornecidos pelo supervisor
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

/** As 4 letras do PDCA, acesas conforme as etapas que o perfil executa. */
function EtapasPDCA({ etapas, ativo }: { etapas: string; ativo: boolean }) {
  return (
    <div className="flex gap-1" aria-label={`Etapas do PDCA: ${etapas.split("").join(", ")}`}>
      {["P", "D", "C", "A"].map((letra) => {
        const on = etapas.includes(letra);
        return (
          <span
            key={letra}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold",
              on
                ? ativo
                  ? "bg-primary text-primary-foreground"
                  : "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground/50",
            )}
          >
            {letra}
          </span>
        );
      })}
    </div>
  );
}

function PerfilCard({
  icon,
  titulo,
  descricao,
  etapas,
  ativo,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
  etapas: string;
  ativo: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ativo}
      className={cn(
        "flex h-full flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all",
        ativo
          ? "border-primary bg-primary-soft shadow-sm"
          : "border-border bg-card hover:border-primary/40 hover:bg-accent",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-lg",
          ativo ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-base font-bold text-foreground">{titulo}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>
      </div>
      <EtapasPDCA etapas={etapas} ativo={ativo} />
    </button>
  );
}
