import { createClient } from "npm:@supabase/supabase-js@2.103.3";
import { MAQUINAS_CARD } from "../hora-x-hora-telegram/cartao.ts";
import { registrosPublicos } from "./dados.ts";
import { idsDeOperadoresSemNome, preencherNomesOperadores } from "../hora-x-hora-telegram/operadores.ts";
import { dataOperacionalAnterior, versoPublico, type BobinaRowPublica, type ConsolidacaoRowPublica } from "./verso.ts";

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

  const empacotadoras = ["Empacotadora 2", "Empacotadora 3"];
  const dataAnterior = dataOperacionalAnterior(publicacao.data_operacao);
  const camposBobina = "maquina,turno,ordem,data_operacao,produto,especificacao_filme,fabricante,numero_lote,peso_liquido_inicial_kg,peso_bruto_final_kg,hora_inicio,hora_termino,data_termino_operacao";
  const camposConsolidacao = "maquina,turno,ordem,data_operacao,sabor,tamanho,hora_inicio,hora_final,quantidade_paletes,quebra_pacotes,pacotes_por_palete,total_pacotes";
  const [horasRes, bobinasDiaRes, bobinasAbertasRes, bobinasTerminadasRes, consolidacoesRes] = await Promise.all([
    supabase.from("producao_horaria")
      .select("maquina,hora_codigo,quantidade,tempo_parada_min,motivo_parada_codigo,operador_nome,operador_user_id,produto_sabor,produto_tamanho,meta,nao_rodou,reinicia_acumulado,finalizado_em")
      .eq("data_operacao", publicacao.data_operacao)
      .in("maquina", MAQUINAS_CARD.map((maquina) => maquina.nome))
      .not("finalizado_em", "is", null)
      .order("finalizado_em", { ascending: false }).limit(120),
    supabase.from("empacotadora_bobinas").select(camposBobina)
      .eq("data_operacao", publicacao.data_operacao).in("maquina", empacotadoras),
    supabase.from("empacotadora_bobinas").select(camposBobina)
      .eq("data_operacao", dataAnterior).in("maquina", empacotadoras)
      .is("hora_termino", null).not("hora_inicio", "is", null),
    supabase.from("empacotadora_bobinas").select(camposBobina)
      .eq("data_operacao", dataAnterior).eq("data_termino_operacao", publicacao.data_operacao)
      .in("maquina", empacotadoras),
    supabase.from("empacotadora_consolidacoes").select(camposConsolidacao)
      .eq("data_operacao", publicacao.data_operacao).in("maquina", empacotadoras),
  ]);
  if (horasRes.error || bobinasDiaRes.error || bobinasAbertasRes.error || bobinasTerminadasRes.error || consolidacoesRes.error) {
    return resposta(503, { erro: "Não foi possível consultar o painel completo" });
  }
  const idsSemNome = idsDeOperadoresSemNome(horasRes.data ?? []);
  const { data: perfis, error: erroPerfis } = idsSemNome.length
    ? await supabase.from("profiles").select("id,nome").in("id", idsSemNome)
    : { data: [], error: null };
  if (erroPerfis) return resposta(503, { erro: "Não foi possível identificar os operadores" });
  const horasComNomes = preencherNomesOperadores(horasRes.data ?? [], perfis ?? []);
  const bobinas = [
    ...(bobinasDiaRes.data ?? []),
    ...(bobinasAbertasRes.data ?? []),
    ...(bobinasTerminadasRes.data ?? []),
  ] as BobinaRowPublica[];

  return resposta(200, {
    dataOperacao: publicacao.data_operacao,
    horaReferencia: publicacao.hora_codigo,
    consultadoEm: new Date().toISOString(),
    registros: registrosPublicos(horasComNomes),
    versoEmpacotadoras: versoPublico(
      publicacao.data_operacao,
      bobinas,
      (consolidacoesRes.data ?? []) as ConsolidacaoRowPublica[],
    ),
  });
});
