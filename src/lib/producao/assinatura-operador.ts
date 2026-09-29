/** Assinatura desenhada pelo operador autenticado após a última hora do turno. */
import { supabase } from "@/integrations/supabase/client";
import { producaoHoraFromRow, type ProducaoHoraRow } from "./mappers";
import type { ProducaoHora } from "./types";

function interpretarResposta(
  valor: unknown,
  horaId: string,
  uid: string,
  desenho: string,
): ProducaoHora | null {
  if (!valor || typeof valor !== "object") return null;
  const resposta = valor as Record<string, unknown>;
  const linha = resposta.hora as Record<string, unknown> | undefined;
  const assinatura = linha?.assinatura_operador as Record<string, unknown> | undefined;
  if (
    !linha ||
    !assinatura ||
    linha.id !== horaId ||
    linha.operador_user_id !== uid ||
    assinatura.userId !== uid ||
    assinatura.dataUrl !== desenho ||
    typeof assinatura.nome !== "string" ||
    !assinatura.nome.trim() ||
    typeof linha.operador_assinou_em !== "string" ||
    assinatura.assinadoEm !== linha.operador_assinou_em
  ) {
    return null;
  }
  return producaoHoraFromRow(linha as unknown as ProducaoHoraRow);
}

export async function assinarHoraOperador(
  hora: ProducaoHora,
  assinaturaDataUrl: string,
): Promise<ProducaoHora> {
  if (
    !hora.createdAt ||
    !hora.updatedAt ||
    !hora.finalizadoEm ||
    !["H12", "H24"].includes(hora.horaCodigo)
  ) {
    throw new Error("Confirme a última hora do turno antes de assinar.");
  }
  if (hora.assinaturaOperador?.dataUrl) {
    throw new Error("O operador já assinou este turno.");
  }
  if (
    !assinaturaDataUrl.startsWith("data:image/png;base64,") ||
    assinaturaDataUrl.length < 100 ||
    assinaturaDataUrl.length > 2_000_000
  ) {
    throw new Error("Desenhe a assinatura do operador antes de confirmar.");
  }

  const { data: usuario, error: erroUsuario } = await supabase.auth.getUser();
  if (erroUsuario || !usuario.user?.id) {
    throw new Error("Entre novamente na conta do operador antes de assinar.");
  }
  const uid = usuario.user.id;
  if (hora.operadorUserId !== uid) {
    throw new Error("Somente o operador que lançou esta hora pode assinar o turno.");
  }

  const { data, error } = await supabase.rpc("rpc_assinar_hora_operador", {
    p_hora_id: hora.id,
    p_updated_at: hora.updatedAt,
    p_assinatura_data_url: assinaturaDataUrl,
  });
  if (error) {
    if (error.code === "PGRST202") {
      throw new Error("A assinatura do operador ainda não foi instalada no Supabase.");
    }
    throw new Error(error.message || "O banco não confirmou a assinatura do operador.");
  }
  const confirmada = interpretarResposta(data, hora.id, uid, assinaturaDataUrl);
  if (!confirmada) {
    throw new Error("O banco não devolveu a assinatura confirmada. Recarregue a hora.");
  }
  return confirmada;
}
