import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthLoading, useUsuario } from "@/hooks/use-storage";
import type { Perfil, Usuario } from "@/lib/checklist/types";
import { ROTA_INICIAL, ehPerfilAtivo } from "@/lib/checklist/types";

/**
 * Guarda de rota: redireciona para "/" se não houver sessão válida,
 * mas SOMENTE depois que o carregamento da auth terminar.
 *
 * - Enquanto loading=true → não navega (evita loop)
 * - Se perfilEsperado for fornecido e o usuário tiver outro perfil,
 *   redireciona para a área correta dele.
 *
 * Retorna { usuario, loading } para o componente decidir o que renderizar.
 */
export function useGuard(perfilEsperado?: Perfil): {
  usuario: Usuario | null;
  loading: boolean;
} {
  const usuario = useUsuario();
  const loading = useAuthLoading();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loading) return; // ainda carregando profile/sessão → NÃO redirecionar
    if (!usuario) {
      navigate({ to: "/" });
      return;
    }
    // Perfil sem área própria (ex.: "manutencao", descontinuado) volta pro login.
    if (!ehPerfilAtivo(usuario.perfil)) {
      navigate({ to: "/" });
      return;
    }
    if (perfilEsperado && usuario.perfil !== perfilEsperado) {
      navigate({ to: ROTA_INICIAL[usuario.perfil] });
    }
  }, [usuario, loading, perfilEsperado, navigate]);

  return { usuario, loading };
}
