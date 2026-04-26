import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthLoading, useUsuario } from "@/hooks/use-storage";
import type { Perfil, Usuario } from "@/lib/checklist/types";

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
    // Perfil "manutencao" foi descontinuado — empurra de volta pro login.
    if (usuario.perfil === "manutencao") {
      navigate({ to: "/" });
      return;
    }
    if (perfilEsperado && usuario.perfil !== perfilEsperado) {
      const destino = usuario.perfil === "operador" ? "/operador" : "/gestao";
      navigate({ to: destino });
    }
  }, [usuario, loading, perfilEsperado, navigate]);

  return { usuario, loading };
}
