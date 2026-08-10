import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { escalaExataPorTurnoEquipe } from "@/lib/operacao/escalas";
import type { Equipe, Turno } from "@/lib/checklist/types";
import {
  HIERARQUIAS as HIERARQUIAS_TIPOS,
  MODULOS_ACESSO,
  PERFIS_ATIVOS,
} from "@/lib/checklist/types";

/**
 * DÉBITO TÉCNICO (Etapa 1):
 * - `modulos_acesso` e `somente_leitura` são salvos no banco mas o login
 *   atual (src/routes/index.tsx) e o useGuard (src/hooks/use-guard.ts)
 *   continuam usando apenas `perfil`. Refator futuro: validar acesso a
 *   módulos via has_modulo() em vez de comparar profile.perfil.
 * - Edição não altera senha (resetar/trocar senha será outra etapa).
 */

// ───────────────────── Constantes/utilitários ─────────────────────

/**
 * As listas vêm de @/lib/checklist/types — NÃO duplicar aqui.
 *
 * Estavam repetidas neste arquivo e ficaram para trás quando os perfis
 * `lider` e `supervisor` entraram: o Zod do servidor rejeitava "lider"
 * mesmo com o tipo já aceitando, e o cadastro falhava sem explicar direito.
 */
const HIERARQUIAS = HIERARQUIAS_TIPOS as unknown as readonly [string, ...string[]];
const MODULOS = MODULOS_ACESSO as unknown as readonly [string, ...string[]];
const PERFIS = PERFIS_ATIVOS as unknown as readonly [string, ...string[]];

const EMAIL_DOMAIN = "magistral.internal";

// REGRAS DE ACESSO (definidas pela coordenação):
// - Cadastrar usuário     → qualquer "gestao" ativo (assertAdminGestao)
// - Trocar senha          → qualquer "gestao" ativo (assertAdminGestao)
// - Desativar/Reativar    → só desenvolvedor/gerente/coordenador (assertAdminHierarquia)
// - Desativar e liberar   → só desenvolvedor/gerente/coordenador (assertAdminHierarquia)

const HIERARQUIAS_ADMIN = ["desenvolvedor", "gerente", "coordenador"] as const;

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
async function assertAdminGestao(
  userId: string,
  /**
   * Client a usar na checagem. Por padrão o admin (service_role).
   *
   * A listagem passa o client da SESSÃO do usuário de propósito: a policy
   * "Gestão lê todos os profiles" (is_gestao) já permite essa leitura pelo
   * RLS, então ler a lista não precisa de chave secreta. Isso mantém a tela
   * de pé mesmo que a service_role do servidor esteja errada ou ausente.
   */
  client: { from: typeof supabaseAdmin.from } = supabaseAdmin,
): Promise<void> {
  const { data, error } = await client
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

/**
 * Verifica se o chamador é gestão ativo E tem hierarquia administrativa
 * (desenvolvedor/gerente/coordenador). Usado para ações destrutivas:
 * desativar usuário e desativar-e-liberar-login.
 */
async function assertAdminHierarquia(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("active, perfil, hierarquia" as string)
    .eq("id", userId)
    .maybeSingle<{ active: boolean; perfil: string; hierarquia: string }>();

  if (error || !data) {
    throw new Response("Forbidden: profile não encontrado", { status: 403 });
  }
  if (!data.active) {
    throw new Response("Forbidden: usuário inativo", { status: 403 });
  }
  if (data.perfil !== "gestao") {
    throw new Response("Forbidden: apenas usuários de gestão", { status: 403 });
  }
  if (!HIERARQUIAS_ADMIN.includes(data.hierarquia as (typeof HIERARQUIAS_ADMIN)[number])) {
    throw new Response(
      "Forbidden: apenas desenvolvedor, gerente ou coordenador",
      { status: 403 },
    );
  }
}

// ───────────────────── Schemas ─────────────────────

// Refine: equipe e turno padrão devem vir AMBOS preenchidos OU AMBOS nulos.
// Combos parciais nunca formam escala válida.
const escalaPadraoRefine = (val: {
  equipePadrao?: string | null;
  turnoPadrao?: string | null;
}): boolean => {
  const eq = val.equipePadrao ?? null;
  const tn = val.turnoPadrao ?? null;
  return (eq === null && tn === null) || (eq !== null && tn !== null);
};

const criarUsuarioSchema = z
  .object({
    nome: z.string().min(2).max(120),
    usuario: z.string().min(2).max(60),
    senha: z.string().min(6).max(72),
    perfil: z.enum(PERFIS),
    hierarquia: z.enum(HIERARQUIAS),
    modulosAcesso: z.array(z.enum(MODULOS)).min(1).max(MODULOS.length),
    matricula: z.string().min(1).max(40).optional().nullable(),
    equipePadrao: z.string().max(40).optional().nullable(),
    turnoPadrao: z.string().max(40).optional().nullable(),
  })
  .refine(escalaPadraoRefine, {
    message: "Equipe padrão e turno padrão devem ser definidos juntos",
    path: ["equipePadrao"],
  });

const editarUsuarioSchema = z
  .object({
    id: z.string().uuid(),
    nome: z.string().min(2).max(120),
    usuario: z.string().min(2).max(60),
    perfil: z.enum(PERFIS),
    hierarquia: z.enum(HIERARQUIAS),
    modulosAcesso: z.array(z.enum(MODULOS)).min(1).max(MODULOS.length),
    matricula: z.string().min(1).max(40).optional().nullable(),
    equipePadrao: z.string().max(40).optional().nullable(),
    turnoPadrao: z.string().max(40).optional().nullable(),
  })
  .refine(escalaPadraoRefine, {
    message: "Equipe padrão e turno padrão devem ser definidos juntos",
    path: ["equipePadrao"],
  });

/**
 * Garante que (equipePadrao, turnoPadrao) — quando preenchidos — formam uma das
 * 8 escalas oficiais. Retorna null quando OK, ou string de erro caso inválido.
 */
function validarEscalaPadrao(
  equipePadrao: string | null | undefined,
  turnoPadrao: string | null | undefined,
): string | null {
  const eq = equipePadrao ?? null;
  const tn = turnoPadrao ?? null;
  if (eq === null && tn === null) return null;
  if (eq === null || tn === null) {
    return "Equipe padrão e turno padrão devem ser definidos juntos";
  }
  const escala = escalaExataPorTurnoEquipe(tn as Turno, eq as Equipe);
  if (!escala) {
    return `Combinação inválida: "${eq} · ${tn}" não é uma das escalas oficiais`;
  }
  return null;
}

const alterarStatusSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});

const trocarSenhaSchema = z.object({
  id: z.string().uuid(),
  novaSenha: z.string().min(6).max(72),
});

const desativarLiberarSchema = z.object({
  id: z.string().uuid(),
});

// ───────────────────── Server Functions ─────────────────────

export const listarUsuarios = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Só leitura: usa a sessão do próprio usuário, não a service_role.
    // O RLS ("Gestão lê todos os profiles") já autoriza, e assim a tela
    // não depende de nenhuma chave secreta estar correta no servidor.
    await assertAdminGestao(context.userId, context.supabase);

    const { data, error } = await context.supabase
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

    const erroEscala = validarEscalaPadrao(data.equipePadrao, data.turnoPadrao);
    if (erroEscala) {
      return { ok: false as const, erro: erroEscala };
    }

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

    const erroEscala = validarEscalaPadrao(data.equipePadrao, data.turnoPadrao);
    if (erroEscala) {
      return { ok: false as const, erro: erroEscala };
    }

    // Carrega login/email atuais para decidir se precisa mexer no auth.
    const { data: alvo, error: lookupErr } = await supabaseAdmin
      .from("profiles")
      .select("usuario, email_interno" as string)
      .eq("id", data.id)
      .maybeSingle<{ usuario: string; email_interno: string }>();

    if (lookupErr || !alvo) {
      return { ok: false as const, erro: "Usuário não encontrado" };
    }

    const novoLogin = normalizarLogin(data.usuario);
    if (novoLogin.length < 2) {
      return { ok: false as const, erro: "Login inválido após normalização" };
    }
    const loginMudou = novoLogin !== alvo.usuario;
    const novoEmail = loginParaEmail(novoLogin);

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

    if (loginMudou) {
      // Checa duplicidade de login (em usuario E email_interno).
      const { data: dupLogin } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("usuario", novoLogin)
        .neq("id", data.id)
        .maybeSingle();
      if (dupLogin) {
        return { ok: false as const, erro: "Outro usuário já usa este login" };
      }
      const { data: dupEmail } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email_interno", novoEmail)
        .neq("id", data.id)
        .maybeSingle();
      if (dupEmail) {
        return { ok: false as const, erro: "Outro usuário já usa este login" };
      }

      // Atualiza o e-mail no Supabase Auth ANTES de tocar no profile.
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
        email: novoEmail,
        email_confirm: true,
      });
      if (authErr) {
        console.error("[editarUsuario] auth update falhou:", authErr);
        return {
          ok: false as const,
          erro: authErr.message ?? "Falha ao atualizar login no auth",
        };
      }
    }

    const somenteLeitura = data.hierarquia === "externo";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("profiles") as any)
      .update({
        nome: data.nome,
        usuario: novoLogin,
        email_interno: novoEmail,
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
      // Rollback do auth se o login havia sido alterado.
      if (loginMudou) {
        await supabaseAdmin.auth.admin.updateUserById(data.id, {
          email: alvo.email_interno,
        });
      }
      return { ok: false as const, erro: error.message ?? "Falha ao editar usuário" };
    }

    return { ok: true as const, loginAlterado: loginMudou };
  });

export const alterarStatusUsuario = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => alterarStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Apenas hierarquia administrativa pode (des)ativar usuários.
    await assertAdminHierarquia(context.userId);

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

/**
 * Troca a senha de qualquer usuário (não exige a senha atual).
 * Permitido para qualquer "gestao" ativo.
 */
export const trocarSenhaUsuario = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => trocarSenhaSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminGestao(context.userId);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      password: data.novaSenha,
    });

    if (error) {
      console.error("[trocarSenhaUsuario] erro:", error);
      return { ok: false as const, erro: error.message ?? "Falha ao trocar senha" };
    }

    return { ok: true as const };
  });

/**
 * Desativa o usuário E libera o login para reuso, renomeando o login/email
 * atuais com sufixo "__desativado_<timestamp>". Mantém o user_id (preserva
 * histórico operacional) mas o login original fica disponível para um novo
 * cadastro. Apenas desenvolvedor/gerente/coordenador.
 */
export const desativarELiberarLogin = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => desativarLiberarSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdminHierarquia(context.userId);

    if (data.id === context.userId) {
      return { ok: false as const, erro: "Você não pode desativar a si mesmo" };
    }

    // Carrega o profile alvo para conhecer login atual.
    const { data: alvo, error: lookupErr } = await supabaseAdmin
      .from("profiles")
      .select("usuario, email_interno" as string)
      .eq("id", data.id)
      .maybeSingle<{ usuario: string; email_interno: string }>();

    if (lookupErr || !alvo) {
      return { ok: false as const, erro: "Usuário não encontrado" };
    }

    const ts = Date.now();
    const sufixo = `__desativado_${ts}`;
    const novoLogin = `${alvo.usuario}${sufixo}`.slice(0, 60);
    const novoEmail = `${normalizarLogin(novoLogin)}@${EMAIL_DOMAIN}`;

    // 1) Renomeia o e-mail no auth (libera o e-mail original).
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      email: novoEmail,
      email_confirm: true,
    });
    if (authErr) {
      console.error("[desativarELiberarLogin] auth update falhou:", authErr);
      return {
        ok: false as const,
        erro: authErr.message ?? "Falha ao liberar e-mail no auth",
      };
    }

    // 2) Renomeia profile e marca inativo (libera o login original).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: profErr } = await (supabaseAdmin.from("profiles") as any)
      .update({
        usuario: novoLogin,
        email_interno: novoEmail,
        active: false,
      })
      .eq("id", data.id);

    if (profErr) {
      console.error("[desativarELiberarLogin] profile update falhou:", profErr);
      // Tenta reverter o e-mail no auth para não deixar incoerente.
      await supabaseAdmin.auth.admin.updateUserById(data.id, {
        email: alvo.email_interno,
      });
      return {
        ok: false as const,
        erro: profErr.message ?? "Falha ao liberar login no profile",
      };
    }

    return {
      ok: true as const,
      loginLiberado: alvo.usuario,
      novoLogin,
    };
  });
