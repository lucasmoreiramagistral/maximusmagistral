import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * DÉBITO TÉCNICO (Etapa 1):
 * - `modulos_acesso` e `somente_leitura` são salvos no banco mas o login
 *   atual (src/routes/index.tsx) e o useGuard (src/hooks/use-guard.ts)
 *   continuam usando apenas `perfil`. Refator futuro: validar acesso a
 *   módulos via has_modulo() em vez de comparar profile.perfil.
 * - Edição não altera senha (resetar/trocar senha será outra etapa).
 */

// ───────────────────── Constantes/utilitários ─────────────────────

const HIERARQUIAS = [
  "desenvolvedor",
  "gerente",
  "coordenador",
  "supervisor",
  "lider",
  "assistente",
  "operador",
  "externo",
] as const;

const MODULOS = ["operador", "gestao", "manutencao", "admin"] as const;

const PERFIS = ["operador", "gestao", "manutencao"] as const;

const EMAIL_DOMAIN = "magistral.internal";

// NOTA: Por decisão de produto, qualquer usuário autenticado com perfil
// "gestao" pode administrar usuários. A validação fina por hierarquia
// (desenvolvedor/gerente/coordenador) será reintroduzida em etapa futura.

function normalizarLogin(login: string): string {
  return login
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}

function loginParaEmail(login: string): string {
  const limpo = normalizarLogin(login);
  return `${limpo}@${EMAIL_DOMAIN}`;
}

/**
 * Verifica se o chamador é um usuário ativo do perfil "gestao".
 * Não restringe por hierarquia (decisão de produto atual).
 */
async function assertAdminGestao(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("active, perfil" as string)
    .eq("id", userId)
    .maybeSingle<{ active: boolean; perfil: string }>();

  if (error || !data) {
    throw new Response("Forbidden: profile não encontrado", { status: 403 });
  }
  if (!data.active) {
    throw new Response("Forbidden: usuário inativo", { status: 403 });
  }
  if (data.perfil !== "gestao") {
    throw new Response("Forbidden: apenas usuários de gestão", { status: 403 });
  }
}

// ───────────────────── Schemas ─────────────────────

const criarUsuarioSchema = z.object({
  nome: z.string().min(2).max(120),
  usuario: z.string().min(2).max(60),
  senha: z.string().min(6).max(72),
  perfil: z.enum(PERFIS),
  hierarquia: z.enum(HIERARQUIAS),
  modulosAcesso: z.array(z.enum(MODULOS)).min(1).max(4),
  matricula: z.string().min(1).max(40).optional().nullable(),
  equipePadrao: z.string().max(40).optional().nullable(),
  turnoPadrao: z.string().max(40).optional().nullable(),
});

const editarUsuarioSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().min(2).max(120),
  perfil: z.enum(PERFIS),
  hierarquia: z.enum(HIERARQUIAS),
  modulosAcesso: z.array(z.enum(MODULOS)).min(1).max(4),
  matricula: z.string().min(1).max(40).optional().nullable(),
  equipePadrao: z.string().max(40).optional().nullable(),
  turnoPadrao: z.string().max(40).optional().nullable(),
});

const alterarStatusSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});

// ───────────────────── Server Functions ─────────────────────

export const listarUsuarios = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminGestao(context.userId);

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, nome, usuario, email_interno, perfil, equipe_padrao, turno_padrao, active, created_at, matricula, hierarquia, modulos_acesso, somente_leitura, criado_por" as string,
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[listarUsuarios] erro:", error);
      return { ok: false as const, erro: "Falha ao carregar usuários", usuarios: [] };
    }

    return { ok: true as const, usuarios: data ?? [] };
  });

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => criarUsuarioSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminGestao(context.userId);

    const usuarioNormalizado = normalizarLogin(data.usuario);
    if (!usuarioNormalizado) {
      return { ok: false as const, erro: "Login inválido após normalização" };
    }

    // Verifica duplicidade de login antes de chamar admin.createUser
    const { data: existente } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("usuario", usuarioNormalizado)
      .maybeSingle();

    if (existente) {
      return { ok: false as const, erro: "Já existe um usuário com este login" };
    }

    if (data.matricula) {
      const { data: dupMatricula } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("matricula" as string, data.matricula)
        .maybeSingle();
      if (dupMatricula) {
        return { ok: false as const, erro: "Já existe um usuário com esta matrícula" };
      }
    }

    const email = loginParaEmail(usuarioNormalizado);
    const somenteLeitura = data.hierarquia === "externo";

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.senha,
      email_confirm: true,
      user_metadata: {
        nome: data.nome,
        usuario: usuarioNormalizado,
        perfil: data.perfil,
        hierarquia: data.hierarquia,
        modulos_acesso: data.modulosAcesso,
        matricula: data.matricula ?? null,
      },
    });

    if (createErr || !created.user) {
      console.error("[criarUsuario] auth.admin.createUser falhou:", createErr);
      const msg =
        createErr?.message?.toLowerCase().includes("already registered")
          ? "E-mail interno já registrado (login duplicado)"
          : createErr?.message ?? "Falha ao criar usuário";
      return { ok: false as const, erro: msg };
    }

    // Trigger handle_new_user já criou o profile a partir de user_metadata.
    // Aplicamos overrides (equipe/turno padrão + criado_por + somente_leitura)
    // diretamente via supabaseAdmin.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (supabaseAdmin.from("profiles") as any)
      .update({
        equipe_padrao: data.equipePadrao ?? null,
        turno_padrao: data.turnoPadrao ?? null,
        somente_leitura: somenteLeitura,
        criado_por: context.userId,
      })
      .eq("id", created.user.id);

    if (updErr) {
      console.error("[criarUsuario] update overrides falhou:", updErr);
      // Não desfazer — usuário existe. Apenas avisar.
      return {
        ok: true as const,
        userId: created.user.id,
        aviso: "Usuário criado, mas alguns campos opcionais não puderam ser salvos.",
      };
    }

    return { ok: true as const, userId: created.user.id };
  });

export const editarUsuario = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => editarUsuarioSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminGestao(context.userId);

    if (data.matricula) {
      const { data: dup } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("matricula" as string, data.matricula)
        .neq("id", data.id)
        .maybeSingle();
      if (dup) {
        return { ok: false as const, erro: "Outro usuário já usa esta matrícula" };
      }
    }

    const somenteLeitura = data.hierarquia === "externo";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("profiles") as any)
      .update({
        nome: data.nome,
        perfil: data.perfil,
        hierarquia: data.hierarquia,
        modulos_acesso: data.modulosAcesso,
        matricula: data.matricula ?? null,
        equipe_padrao: data.equipePadrao ?? null,
        turno_padrao: data.turnoPadrao ?? null,
        somente_leitura: somenteLeitura,
      })
      .eq("id", data.id);

    if (error) {
      console.error("[editarUsuario] erro:", error);
      return { ok: false as const, erro: error.message ?? "Falha ao editar usuário" };
    }

    return { ok: true as const };
  });

export const alterarStatusUsuario = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => alterarStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminGestao(context.userId);

    // Não permite o admin se inativar
    if (data.id === context.userId && !data.active) {
      return { ok: false as const, erro: "Você não pode inativar a si mesmo" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("profiles") as any)
      .update({ active: data.active })
      .eq("id", data.id);

    if (error) {
      console.error("[alterarStatusUsuario] erro:", error);
      return { ok: false as const, erro: error.message ?? "Falha ao alterar status" };
    }

    return { ok: true as const };
  });
