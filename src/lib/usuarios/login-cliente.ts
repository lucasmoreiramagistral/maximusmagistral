/**
 * Helpers de login usados no NAVEGADOR.
 *
 * Ficam separados de `usuarios.functions.ts` de propósito: aquele módulo
 * importa o cliente `service_role` e é server-only; puxá-lo para um componente
 * arrastaria a chave privilegiada para dentro do bundle.
 *
 * Cuidado ao unificar com o `loginParaEmail` de `usuarios.functions.ts`: os
 * dois NÃO são equivalentes. Aquele normaliza agressivamente (espaço vira
 * ponto, caractere inválido some) porque cria a conta; este aqui deixa passar
 * um e-mail completo se a pessoa digitar um, porque é a porta de entrada de
 * quem já existe. Fundir os dois muda o login de quem está em produção hoje.
 */

/**
 * Converte o "usuário interno" (ex.: "joao.silva") em e-mail válido para o
 * Supabase Auth. O domínio fixo evita expor e-mails reais.
 */
export function loginParaEmail(login: string): string {
  const limpo = login.trim().toLowerCase();
  if (limpo.includes("@")) return limpo;
  return `${limpo}@magistral.internal`;
}

export function mensagemErroLogin(error: { code?: string; message?: string } | null): string {
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
