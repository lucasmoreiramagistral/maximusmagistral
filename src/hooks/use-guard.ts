import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthLoading, useUsuario } from "@/hooks/use-storage";
import type { PerfilAtivo, Usuario } from "@/lib/checklist/types";
import { ROTA_INICIAL, ehPerfilAtivo } from "@/lib/checklist/types";
import { podeAbrirArea, setAreaAtiva } from "@/lib/checklist/areas";

/**
 * Guarda de rota: redireciona para "/" se não houver sessão válida,
 * mas SOMENTE depois que o carregamento da auth terminar.
 *
 * - Enquanto loading=true → não navega (evita loop)
 * - O acesso à área é por MÓDULO (`modulos_acesso`), não só pelo perfil:
 *   quem tem o módulo liberado abre a área sem trocar de conta. Quem não
 *   tem volta para a área inicial do próprio perfil.
 *
 * Retorna { usuario, loading } para o componente decidir o que renderizar.
 */
export function useGuard(perfilEsperado?: PerfilAtivo): {
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
    if (!perfilEsperado) return;

    // Acesso é por MÓDULO, não só por perfil: quem tem o módulo liberado
    // (ou 'admin') pode abrir a área sem trocar de conta.
    if (podeAbrirArea(usuario, perfilEsperado)) {
      setAreaAtiva(perfilEsperado);
      return;
    }
    navigate({ to: ROTA_INICIAL[usuario.perfil] });
  }, [usuario, loading, perfilEsperado, navigate]);

  return { usuario, loading };
}
