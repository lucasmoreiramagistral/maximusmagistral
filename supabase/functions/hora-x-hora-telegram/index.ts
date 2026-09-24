import { createClient } from "npm:@supabase/supabase-js@2.103.3";
import {
  MAQUINAS_CARD,
  montarCard,
  periodoParaPublicar,
  urlPainel,
  type RegistroCard,
} from "./cartao.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CRON_SECRET = Deno.env.get("MAXIMUS_CRON_SECRET");
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
const APP_URL = Deno.env.get("MAXIMUS_APP_URL") ?? "https://maximusmagistral.digital/";

function resposta(status: number, mensagem: string): Response {
  return Response.json({ mensagem }, { status });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return resposta(405, "Método não permitido");
  if (!CRON_SECRET || request.headers.get("X-Maximus-Cron-Secret") !== CRON_SECRET) {
    return resposta(401, "Não autorizado");
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !BOT_TOKEN || !CHAT_ID) {
    return resposta(503, "Segredos do serviço não configurados");
  }

  const periodo = periodoParaPublicar(new Date());
  if (!periodo) return resposta(200, "Fora da janela de publicação");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: horas, error: erroConsulta } = await supabase
    .from("producao_horaria")
    .select("maquina,quantidade,tempo_parada_min,motivo_parada_codigo,operador_nome,finalizado_em")
    .eq("data_operacao", periodo.dataOperacao)
    .eq("hora_codigo", periodo.horaCodigo)
    .in("maquina", MAQUINAS_CARD.map((maquina) => maquina.nome))
    .lte("finalizado_em", periodo.corteEm)
    .order("finalizado_em", { ascending: false });
  if (erroConsulta) return resposta(503, "Não foi possível consultar as horas confirmadas");

  const unicas = new Map<string, RegistroCard>();
  for (const hora of horas ?? []) {
    if (!unicas.has(hora.maquina)) unicas.set(hora.maquina, hora as RegistroCard);
  }
  const registros = [...unicas.values()];
  const texto = montarCard(periodo, registros);
  const publicToken = crypto.randomUUID();
  const painel = urlPainel(publicToken, APP_URL);
  const { data: reserva, error: erroReserva } = await supabase
    .from("telegram_hora_publicacoes")
    .insert({
      data_operacao: periodo.dataOperacao,
      hora_codigo: periodo.horaCodigo,
      public_token: publicToken,
      corte_em: periodo.corteEm,
      status: "reservado",
      snapshot: { texto, painel, maquinas_presentes: [...unicas.keys()] },
    })
    .select("id")
    .single();
  if (erroReserva?.code === "23505") return resposta(200, "Card deste período já reservado");
  if (erroReserva || !reserva) return resposta(503, "Não foi possível reservar o card");

  let status: "enviado" | "falhou" | "incerto" = "incerto";
  let messageId: number | null = null;
  let detalhe = "Resposta do Telegram não confirmada";
  try {
    const telegram = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: texto,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "Abrir painel", url: painel }]] },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const corpo = await telegram.json() as {
      ok?: boolean;
      result?: { message_id?: number };
      description?: string;
    };
    if (telegram.ok && corpo.ok && typeof corpo.result?.message_id === "number") {
      status = "enviado";
      messageId = corpo.result.message_id;
      detalhe = "";
    } else {
      status = telegram.status >= 400 && telegram.status < 500 ? "falhou" : "incerto";
      detalhe = `Telegram HTTP ${telegram.status}: ${(corpo.description ?? "sem detalhe").slice(0, 200)}`;
    }
  } catch {
    // Uma falha de rede pode ocorrer depois de o Telegram aceitar a mensagem.
    // Não há reenvio automático: isso preserva no máximo um card por período.
  }

  const { error: erroRegistro } = await supabase
    .from("telegram_hora_publicacoes")
    .update({
      status,
      message_id: messageId,
      enviado_em: status === "enviado" ? new Date().toISOString() : null,
      ultimo_erro: detalhe || null,
    })
    .eq("id", reserva.id);
  if (erroRegistro) return resposta(503, "Publicação executada; falha ao registrar resultado");
  return resposta(status === "enviado" ? 200 : 502, status);
});
