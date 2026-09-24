import { createClient } from "npm:@supabase/supabase-js@2.103.3";
import { MAQUINAS_CARD } from "../hora-x-hora-telegram/cartao.ts";
import { registrosPublicos } from "./dados.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function resposta(status: number, corpo: Record<string, unknown>): Response {
  return Response.json(corpo, { status, headers: corsHeaders });
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return resposta(405, { erro: "Método não permitido" });

  let token: unknown;
  try {
    ({ token } = await request.json());
  } catch {
    return resposta(400, { erro: "Link inválido" });
  }
  if (typeof token !== "string" || !uuid.test(token)) {
    return resposta(404, { erro: "Link inválido ou revogado" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return resposta(503, { erro: "Serviço indisponível" });

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: publicacao, error: erroToken } = await supabase
    .from("telegram_hora_publicacoes")
    .select("data_operacao,hora_codigo")
    .eq("public_token", token)
    .is("revogado_em", null)
    .maybeSingle();
  if (erroToken) return resposta(503, { erro: "Não foi possível consultar o painel" });
  if (!publicacao) return resposta(404, { erro: "Link inválido ou revogado" });

  const { data: horas, error: erroHoras } = await supabase
    .from("producao_horaria")
    .select("maquina,hora_codigo,quantidade,tempo_parada_min,motivo_parada_codigo,operador_nome,produto_sabor,produto_tamanho,meta,nao_rodou,finalizado_em")
    .eq("data_operacao", publicacao.data_operacao)
    .in("maquina", MAQUINAS_CARD.map((maquina) => maquina.nome))
    .not("finalizado_em", "is", null)
    .order("finalizado_em", { ascending: false })
    .limit(120);
  if (erroHoras) return resposta(503, { erro: "Não foi possível consultar as horas" });

  return resposta(200, {
    dataOperacao: publicacao.data_operacao,
    horaReferencia: publicacao.hora_codigo,
    consultadoEm: new Date().toISOString(),
    registros: registrosPublicos(horas ?? []),
  });
});
