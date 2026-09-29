import { supabase } from "@/integrations/supabase/client";
import type { Hierarquia, ModuloAcesso, Perfil } from "@/lib/checklist/types";
import type { MaquinaId } from "@/lib/maquinas/catalogo";

interface UsuarioDados {
  nome: string;
  usuario: string;
  perfil: Perfil;
  hierarquia: Hierarquia;
  modulosAcesso: ModuloAcesso[];
  matricula?: string | null;
  maquinaId?: MaquinaId | null;
  equipePadrao?: string | null;
  turnoPadrao?: string | null;
}

type Falha = { ok: false; erro: string };

async function mensagemErro(error: unknown): Promise<string> {
  const response = (error as { context?: unknown } | null)?.context;
  if (response instanceof Response) {
    try {
      const body = await response.clone().json() as { erro?: unknown };
      if (typeof body.erro === "string") return body.erro;
    } catch { /* O gateway pode responder sem JSON. */ }
    if (response.status === 401) return "Sessão inválida. Entre novamente.";
    if (response.status === 403) return "Acesso não permitido para este usuário.";
  }
  return "Falha de conexão com o serviço de usuários. Tente novamente.";
}

async function chamar<T extends { ok: true }>(acao: string, dados?: unknown): Promise<T | Falha> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao.session?.access_token;
  if (!token) return { ok: false, erro: "Sessão expirada. Entre novamente." };
  const { data, error } = await supabase.functions.invoke("admin-usuarios", {
    body: { acao, dados },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) return { ok: false, erro: await mensagemErro(error) };
  if (!data || typeof data !== "object" || typeof data.ok !== "boolean") {
    return { ok: false, erro: "Resposta inválida do serviço de usuários." };
  }
  return data as T | Falha;
}

export function listarUsuarios() {
  return chamar<{ ok: true; usuarios: unknown[] }>("listar");
}

export function criarUsuario({ data }: { data: UsuarioDados & { senha: string } }) {
  return chamar<{ ok: true; userId: string }>("criar", data);
}

export function editarUsuario({ data }: { data: UsuarioDados & { id: string } }) {
  return chamar<{ ok: true; loginAlterado: boolean }>("editar", data);
}

export function alterarStatusUsuario({ data }: { data: { id: string; active: boolean } }) {
  return chamar<{ ok: true }>("alterarStatus", data);
}

export function trocarSenhaUsuario({ data }: { data: { id: string; novaSenha: string } }) {
  return chamar<{ ok: true }>("trocarSenha", data);
}

export function desativarELiberarLogin({ data }: { data: { id: string } }) {
  return chamar<{ ok: true; loginLiberado: string; novoLogin: string }>("desativarLiberar", data);
}
