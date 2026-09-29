import { createClient } from "npm:@supabase/supabase-js@2.103.3";
import { z } from "npm:zod@3.24.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function responder(status: number, corpo: Record<string, unknown>): Response {
  return Response.json(corpo, { status, headers: cors });
}

const uuid = z.string().uuid();
const perfil = z.enum(["operador", "lider", "supervisor", "gestao"]);
const hierarquia = z.enum([
  "desenvolvedor", "gerente", "coordenador", "supervisor", "lider",
  "assistente", "operador", "externo",
]);
const modulo = z.enum(["operador", "lider", "supervisor", "gestao", "manutencao", "admin"]);
const maquina = z.enum(["enchedora-2", "enchedora-3", "empacotadora-2", "empacotadora-3"]);
const baseUsuario = z.object({
  nome: z.string().min(2).max(120),
  usuario: z.string().min(2).max(60),
  perfil,
  hierarquia,
  modulosAcesso: z.array(modulo).min(1).max(6),
  matricula: z.string().min(1).max(40).optional().nullable(),
  maquinaId: maquina.optional().nullable(),
  equipePadrao: z.string().max(40).optional().nullable(),
  turnoPadrao: z.string().max(40).optional().nullable(),
});
const criarSchema = baseUsuario.extend({ senha: z.string().min(6).max(72) });
const editarSchema = baseUsuario.extend({ id: uuid });
const statusSchema = z.object({ id: uuid, active: z.boolean() });
const senhaSchema = z.object({ id: uuid, novaSenha: z.string().min(6).max(72) });
const idSchema = z.object({ id: uuid });

const escalas = new Set([
  "Karolainny|12x36 Dia", "Nilson|12x36 Dia",
  "Valderlan|12x36 Noite", "Bruno|12x36 Noite",
  "Comercial|Comercial", "1º Turno|1º Turno",
  "2º Turno|2º Turno", "3º Turno|3º Turno",
]);
const adminsHierarquia = new Set(["desenvolvedor", "gerente", "coordenador"]);
const dominio = "magistral.internal";

function loginNormalizado(login: string): string {
  return login.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "");
}

function escalaValida(equipe?: string | null, turno?: string | null): boolean {
  if (!equipe && !turno) return true;
  return !!equipe && !!turno && escalas.has(`${equipe}|${turno}`);
}

function maquinaValida(perfilUsuario: string, maquinaId?: string | null): boolean {
  return perfilUsuario !== "operador" || !!maquinaId;
}

type AdminClient = ReturnType<typeof createClient>;
type PerfilGestao = { active: boolean; perfil: string; hierarquia: string };

async function executar(
  admin: AdminClient, userId: string, perfilGestao: PerfilGestao,
  acao: string, dados: unknown,
): Promise<Response> {
  if ((acao === "alterarStatus" || acao === "desativarLiberar") &&
      !adminsHierarquia.has(perfilGestao.hierarquia)) {
    return responder(403, { ok: false, erro: "Apenas desenvolvedor, gerente ou coordenador" });
  }

  if (acao === "listar") {
    const { data, error } = await admin.from("profiles")
      .select("id,nome,usuario,email_interno,perfil,maquina_id,equipe_padrao,turno_padrao,active,created_at,matricula,hierarquia,modulos_acesso,somente_leitura,criado_por")
      .order("created_at", { ascending: false });
    if (error) return responder(503, { ok: false, erro: "Falha ao carregar usuários" });
    return responder(200, { ok: true, usuarios: data ?? [] });
  }

  if (acao === "criar") {
    const validado = criarSchema.safeParse(dados);
    if (!validado.success) return responder(400, { ok: false, erro: "Dados do cadastro inválidos" });
    const d = validado.data;
    if (!escalaValida(d.equipePadrao, d.turnoPadrao)) {
      return responder(200, { ok: false, erro: "Equipe e turno precisam formar uma escala oficial" });
    }
    if (!maquinaValida(d.perfil, d.maquinaId)) {
      return responder(200, { ok: false, erro: "Selecione a máquina do operador" });
    }
    const login = loginNormalizado(d.usuario);
    if (login.length < 2) return responder(200, { ok: false, erro: "Login inválido após normalização" });
    const { data: existente, error: erroLogin } = await admin.from("profiles")
      .select("id").eq("usuario", login).maybeSingle();
    if (erroLogin) return responder(503, { ok: false, erro: "Falha ao verificar login" });
    if (existente) return responder(200, { ok: false, erro: "Já existe um usuário com este login" });
    if (d.matricula) {
      const { data: duplicada, error } = await admin.from("profiles")
        .select("id").eq("matricula", d.matricula).maybeSingle();
      if (error) return responder(503, { ok: false, erro: "Falha ao verificar matrícula" });
      if (duplicada) return responder(200, { ok: false, erro: "Já existe um usuário com esta matrícula" });
    }
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: `${login}@${dominio}`,
      password: d.senha,
      email_confirm: true,
      user_metadata: {
        nome: d.nome, usuario: login, perfil: d.perfil, hierarquia: d.hierarquia,
        modulos_acesso: d.modulosAcesso, matricula: d.matricula ?? null,
        maquina_id: d.maquinaId ?? null,
      },
    });
    if (createError || !created.user) {
      console.error("[admin-usuarios] createUser:", createError);
      const duplicado = createError?.message?.toLowerCase().includes("already registered");
      return responder(200, { ok: false, erro: duplicado
        ? "E-mail interno já registrado (login duplicado)" : "Falha ao criar usuário" });
    }
    const { data: atualizado, error: updateError } = await admin.from("profiles")
      .update({
        active: true,
        maquina_id: d.perfil === "operador" ? d.maquinaId : null,
        equipe_padrao: d.equipePadrao ?? null,
        turno_padrao: d.turnoPadrao ?? null,
        somente_leitura: d.hierarquia === "externo",
        criado_por: userId,
      })
      .eq("id", created.user.id).select("id").maybeSingle();
    if (updateError || !atualizado) {
      console.error("[admin-usuarios] profile após criação:", updateError);
      const { error: rollbackError } = await admin.auth.admin.deleteUser(created.user.id);
      if (rollbackError) {
        console.error("[admin-usuarios] rollback:", rollbackError);
        return responder(503, { ok: false,
          erro: "Cadastro incompleto. Verifique o usuário criado antes de tentar novamente." });
      }
      return responder(503, { ok: false,
        erro: "O cadastro não pôde ser concluído e foi desfeito. Tente novamente." });
    }
    return responder(200, { ok: true, userId: created.user.id });
  }

  if (acao === "editar") {
    const validado = editarSchema.safeParse(dados);
    if (!validado.success) return responder(400, { ok: false, erro: "Dados da edição inválidos" });
    const d = validado.data;
    if (!escalaValida(d.equipePadrao, d.turnoPadrao)) {
      return responder(200, { ok: false, erro: "Equipe e turno precisam formar uma escala oficial" });
    }
    if (!maquinaValida(d.perfil, d.maquinaId)) {
      return responder(200, { ok: false, erro: "Selecione a máquina do operador" });
    }
    const { data: alvo, error: lookupError } = await admin.from("profiles")
      .select("usuario,email_interno").eq("id", d.id).maybeSingle();
    if (lookupError || !alvo) return responder(200, { ok: false, erro: "Usuário não encontrado" });
    const novoLogin = loginNormalizado(d.usuario);
    if (novoLogin.length < 2) return responder(200, { ok: false, erro: "Login inválido após normalização" });
    const mudou = novoLogin !== alvo.usuario;
    const novoEmail = `${novoLogin}@${dominio}`;
    if (d.matricula) {
      const { data: duplicada, error } = await admin.from("profiles")
        .select("id").eq("matricula", d.matricula).neq("id", d.id).maybeSingle();
      if (error) return responder(503, { ok: false, erro: "Falha ao verificar matrícula" });
      if (duplicada) return responder(200, { ok: false, erro: "Outro usuário já usa esta matrícula" });
    }
    if (mudou) {
      const { data: duplicado, error } = await admin.from("profiles")
        .select("id").eq("usuario", novoLogin).neq("id", d.id).maybeSingle();
      if (error) return responder(503, { ok: false, erro: "Falha ao verificar login" });
      if (duplicado) return responder(200, { ok: false, erro: "Outro usuário já usa este login" });
      const { data: emailDuplicado, error: erroEmail } = await admin.from("profiles")
        .select("id").eq("email_interno", novoEmail).neq("id", d.id).maybeSingle();
      if (erroEmail) return responder(503, { ok: false, erro: "Falha ao verificar e-mail interno" });
      if (emailDuplicado) return responder(200, { ok: false, erro: "Outro usuário já usa este login" });
      const { error: authError } = await admin.auth.admin.updateUserById(d.id, {
        email: novoEmail, email_confirm: true,
      });
      if (authError) {
        console.error("[admin-usuarios] updateUserById:", authError);
        return responder(503, { ok: false, erro: "Falha ao atualizar login" });
      }
    }
    const { data: atualizado, error: updateError } = await admin.from("profiles")
      .update({
        nome: d.nome, usuario: novoLogin, email_interno: novoEmail,
        perfil: d.perfil, hierarquia: d.hierarquia, modulos_acesso: d.modulosAcesso,
        matricula: d.matricula ?? null, maquina_id: d.maquinaId ?? null,
        equipe_padrao: d.equipePadrao ?? null, turno_padrao: d.turnoPadrao ?? null,
        somente_leitura: d.hierarquia === "externo",
      })
      .eq("id", d.id).select("id").maybeSingle();
    if (updateError || !atualizado) {
      console.error("[admin-usuarios] update profile:", updateError);
      if (mudou) await admin.auth.admin.updateUserById(d.id, { email: alvo.email_interno });
      return responder(503, { ok: false, erro: "Falha ao editar usuário" });
    }
    return responder(200, { ok: true, loginAlterado: mudou });
  }

  if (acao === "alterarStatus") {
    const validado = statusSchema.safeParse(dados);
    if (!validado.success) return responder(400, { ok: false, erro: "Dados do status inválidos" });
    if (validado.data.id === userId && !validado.data.active) {
      return responder(200, { ok: false, erro: "Você não pode inativar a si mesmo" });
    }
    const { data: atualizado, error } = await admin.from("profiles")
      .update({ active: validado.data.active }).eq("id", validado.data.id)
      .select("id").maybeSingle();
    if (error || !atualizado) return responder(503, { ok: false, erro: "Falha ao alterar status" });
    return responder(200, { ok: true });
  }

  if (acao === "trocarSenha") {
    const validado = senhaSchema.safeParse(dados);
    if (!validado.success) return responder(400, { ok: false, erro: "Dados da senha inválidos" });
    const { error } = await admin.auth.admin.updateUserById(validado.data.id, {
      password: validado.data.novaSenha,
    });
    if (error) {
      console.error("[admin-usuarios] password:", error);
      return responder(503, { ok: false, erro: "Falha ao trocar senha" });
    }
    return responder(200, { ok: true });
  }

  if (acao === "desativarLiberar") {
    const validado = idSchema.safeParse(dados);
    if (!validado.success) return responder(400, { ok: false, erro: "Usuário inválido" });
    const id = validado.data.id;
    if (id === userId) return responder(200, { ok: false, erro: "Você não pode desativar a si mesmo" });
    const { data: alvo, error: lookupError } = await admin.from("profiles")
      .select("usuario,email_interno").eq("id", id).maybeSingle();
    if (lookupError || !alvo) return responder(200, { ok: false, erro: "Usuário não encontrado" });
    const sufixo = `__desativado_${Date.now()}`;
    const novoLogin = `${alvo.usuario.slice(0, 60 - sufixo.length)}${sufixo}`;
    const novoEmail = `${loginNormalizado(novoLogin)}@${dominio}`;
    const { error: authError } = await admin.auth.admin.updateUserById(id, {
      email: novoEmail, email_confirm: true,
    });
    if (authError) {
      console.error("[admin-usuarios] release auth:", authError);
      return responder(503, { ok: false, erro: "Falha ao liberar e-mail no auth" });
    }
    const { data: atualizado, error: updateError } = await admin.from("profiles")
      .update({ usuario: novoLogin, email_interno: novoEmail, active: false })
      .eq("id", id).select("id").maybeSingle();
    if (updateError || !atualizado) {
      console.error("[admin-usuarios] release profile:", updateError);
      await admin.auth.admin.updateUserById(id, { email: alvo.email_interno });
      return responder(503, { ok: false, erro: "Falha ao liberar login no perfil" });
    }
    return responder(200, { ok: true, loginLiberado: alvo.usuario, novoLogin });
  }

  return responder(400, { ok: false, erro: "Ação desconhecida" });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return responder(405, { ok: false, erro: "Método não permitido" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return responder(503, { ok: false, erro: "Serviço de usuários indisponível" });
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ") || header.length <= 7) {
    return responder(401, { ok: false, erro: "Faça login para continuar" });
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: autenticado, error: authError } = await admin.auth.getUser(header.slice(7));
  if (authError || !autenticado.user) {
    return responder(401, { ok: false, erro: "Sessão inválida. Entre novamente." });
  }
  const userId = autenticado.user.id;
  const { data: perfilGestao, error: perfilError } = await admin.from("profiles")
    .select("active,perfil,hierarquia").eq("id", userId).maybeSingle();
  if (perfilError) return responder(503, { ok: false, erro: "Falha ao conferir perfil" });
  if (!perfilGestao?.active || perfilGestao.perfil !== "gestao") {
    return responder(403, { ok: false, erro: "Apenas Gestão ativa pode administrar usuários" });
  }
  try {
    const body = await request.json() as { acao?: unknown; dados?: unknown };
    if (typeof body?.acao !== "string") {
      return responder(400, { ok: false, erro: "Ação inválida" });
    }
    return await executar(admin, userId, perfilGestao, body.acao, body.dados);
  } catch (error) {
    console.error("[admin-usuarios] erro inesperado:", error);
    return responder(503, { ok: false, erro: "Serviço de usuários indisponível. Tente novamente." });
  }
});
