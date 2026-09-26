/** Assina uma checagem do Hora x Hora na sessão isolada do líder. */
import { criarClienteValidacao } from "@/integrations/supabase/client-validacao";
import { loginParaEmail, mensagemErroLogin } from "@/lib/usuarios/login-cliente";
import type { IdentidadeLider } from "@/lib/farol/autenticar-lider";
import { producaoHoraFromRow, type ProducaoHoraRow } from "./mappers";
import type { ProducaoHora } from "./types";

export interface HoraAssinada {
  hora: ProducaoHora;
  lider: IdentidadeLider;
}

function interpretarResposta(valor: unknown, horaId: string, uid: string): HoraAssinada | null {
  if (!valor || typeof valor !== "object") return null;
  const resposta = valor as Record<string, unknown>;
  const ator = resposta.ator as Record<string, unknown> | undefined;
  const linha = resposta.hora as Record<string, unknown> | undefined;
  const assinatura = linha?.assinatura_lider as Record<string, unknown> | undefined;
  if (!ator || !linha || !assinatura ||
      linha.id !== horaId || ator.userId !== uid || assinatura.userId !== uid ||
      typeof ator.login !== "string" || typeof ator.nome !== "string" ||
      typeof ator.perfil !== "string" || typeof assinatura.dataUrl !== "string" ||
      typeof linha.lider_assinou_em !== "string" ||
      linha.lider_nome !== ator.nome || assinatura.nome !== ator.nome ||
      assinatura.assinadoEm !== linha.lider_assinou_em) {
    return null;
  }
  return {
    hora: producaoHoraFromRow(linha as unknown as ProducaoHoraRow),
    lider: {
      userId: uid,
      login: ator.login,
      nome: ator.nome,
      perfil: ator.perfil,
      autenticadoEm: linha.lider_assinou_em,
    },
  };
}

export async function assinarHoraComLogin(
  hora: ProducaoHora,
  assinaturaDataUrl: string,
  login: string,
  senha: string,
): Promise<HoraAssinada> {
  if (!hora.createdAt || !hora.updatedAt) {
    throw new Error("Recarregue a hora antes de colher a assinatura do líder.");
  }
  const usuario = login.trim();
  if (!usuario || !senha) throw new Error("Informe usuário e senha do líder.");
  if (!assinaturaDataUrl.startsWith("data:image/png;base64,") ||
      assinaturaDataUrl.length < 100) {
    throw new Error("Desenhe a assinatura do líder antes de confirmar.");
  }

  const cliente = criarClienteValidacao();
  try {
    const { data: autenticacao, error: erroLogin } = await cliente.auth.signInWithPassword({
      email: loginParaEmail(usuario),
      password: senha,
    });
    if (erroLogin || !autenticacao.user) {
      throw new Error(mensagemErroLogin(erroLogin));
    }

    // A RPC confere perfil, equipe, versão e hora finalizada. O banco carimba
    // userId/nome/horário; nenhum desses dados é aceito do cliente.
    const { data, error } = await cliente.rpc("rpc_assinar_hora_lider", {
      p_hora_id: hora.id,
      p_updated_at: hora.updatedAt,
      p_assinatura_data_url: assinaturaDataUrl,
    });
    if (error) {
      if (error.code === "PGRST202") {
        throw new Error("A validação segura do Hora x Hora ainda não foi instalada no Supabase.");
      }
      throw new Error(error.message || "O banco não confirmou a assinatura do líder.");
    }
    const resposta = interpretarResposta(data, hora.id, autenticacao.user.id);
    if (!resposta || resposta.hora.assinaturaLider?.dataUrl !== assinaturaDataUrl) {
      throw new Error("O banco não devolveu a assinatura confirmada. Recarregue a hora.");
    }
    return resposta;
  } finally {
    await cliente.auth.signOut().catch(() => undefined);
  }
}
