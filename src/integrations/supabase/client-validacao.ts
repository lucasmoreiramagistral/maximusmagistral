/**
 * Cliente ISOLADO para a autenticação rápida do líder no tablet do operador.
 *
 * O problema: o tablet fica com a sessão do operador aberta o turno inteiro.
 * Autenticar o líder no cliente normal (`client.ts`) trocaria essa sessão —
 * o operador seria deslogado no meio do turno e provavelmente perderia o que
 * estava preenchendo. Inaceitável no chão de fábrica.
 *
 * Este cliente resolve com `persistSession: false`: a sessão do líder vive só
 * em memória, dura o tempo da assinatura e nunca encosta no localStorage, que
 * é onde mora a sessão do operador. Cada validação cria um cliente novo e o
 * descarta em seguida.
 *
 * Usa a MESMA publishable key do app — ou seja, o líder passa pelo mesmo RLS
 * de todo mundo. Nada aqui eleva privilégio; o que se ganha é saber QUEM
 * assinou, em vez de aceitar um nome digitado.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export function criarClienteValidacao() {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Variáveis do Supabase ausentes para a validação do líder.");
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      // As três linhas que protegem a sessão do operador.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
