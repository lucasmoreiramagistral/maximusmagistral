import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Apoio, Assepsia e CIP agora vivem dentro do Hora x Hora
 * (aba "Apoio, assepsia e CIP"). Rota antiga mantida como redirecionamento.
 */
export const Route = createFileRoute("/operador/enchedora-apoio")({
  beforeLoad: () => {
    throw redirect({ to: "/operador/hora-x-hora" });
  },
});
