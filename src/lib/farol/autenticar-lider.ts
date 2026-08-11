/**
 * AUTENTICAÇÃO RÁPIDA DO LÍDER — no mesmo tablet do operador.
 *
 * Hoje a validação oficial é um campo de texto: o operador (ou qualquer um)
 * digita o nome do líder e desenha uma assinatura. O dado de produção mostra
 * o que isso vale — os nomes gravados em `limpeza_turnos.lider_nome` são:
 *
 *   Bruno (47), Bruno Barbosa (9), "Bruno," , "Bruno,," , "Bruno." , "Bruno j"
 *   Valderlan, "Valderlan rabe", "Valderlan Rabelo", "Valderlan RABELO", ...
 *
 * 16 grafias distintas para cerca de 5 pessoas. Não é risco teórico de
 * auditoria: a assinatura já não identifica ninguém de forma confiável, e a
 * cascata de responsabilidade que o gerente desenhou no papel depende
 * exatamente de saber quem assinou.
 *
 * A solução não exige tablet novo. O operador termina o turno e chama o líder;
 * o líder digita o próprio usuário e senha numa janela; o sistema autentica
 * numa sessão isolada (ver client-validacao.ts), guarda id/login/nome/hora
 * vindos do banco, e devolve o tablet ao operador. A sessão do operador não é
 * tocada.
 *
 * A assinatura desenhada pode continuar — o formulário oficial pede. O que
 * muda é que ela passa a estar amarrada a uma identidade verificada, em vez
 * de a um nome digitado.
 */

import { supabase } from "@/integrations/supabase/client";
import { criarClienteValidacao } from "@/integrations/supabase/client-validacao";
import { loginParaEmail, mensagemErroLogin } from "@/lib/usuarios/login-cliente";

export interface IdentidadeLider {
  userId: string;
  login: string;
  nome: string;
  perfil: string;
  /** Carimbo do momento da autenticação. */
  autenticadoEm: string;
}

export type ResultadoAutenticacao =
  | { ok: true; lider: IdentidadeLider }
  | { ok: false; erro: string };

/**
 * Quem pode validar o trabalho do operador.
 *
 * O operador não valida a si mesmo — é a regra inteira do papel do gerente.
 * Supervisor e gestão entram porque cobrem a ausência do líder sem que
 * ninguém precise emprestar senha, que é como o controle morre na prática.
 */
export const PERFIS_QUE_VALIDAM = ["lider", "supervisor", "gestao"] as const;

/**
 * O registro de validação que o BANCO carimba (tabela `validacoes_lider`,
 * migration 06).
 *
 * Por que existe, se o app já autentica o líder na tela: porque a gravação de
 * `limpeza_turnos.lider_nome` acontece na sessão do OPERADOR — é o tablet
 * dele. Nenhuma regra de banco consegue afirmar que aquele nome é de quem
 * assinou, e quem chamar a API direto escreve o nome que quiser.
 *
 * Então separamos: `lider_nome` continua sendo conveniência de exibição, e o
 * FATO vai para uma tabela onde o trigger sobrescreve autor e horário com
 * auth.uid()/now(). Este insert roda dentro da sessão do líder, e é a única
 * coisa que precisa rodar lá.
 */
export interface ValidacaoParaRegistrar {
  alvoTipo: "checklist" | "limpeza" | "producao_horaria";
  alvoId: string;
  dataOperacao: string;
  turno: string;
  linha?: string;
  maquina?: string;
  assinatura?: unknown;
  observacao?: string | null;
}

/**
 * O segundo caminho: o líder não conseguiu entrar e o turno precisa fechar.
 *
 * Existe porque a alternativa real não é "todo mundo usa o caminho certo" —
 * é o operador pedir a senha do líder emprestada. Aí a auditoria vira ficção
 * e ninguém fica sabendo. Melhor ter a saída registrada e contada.
 *
 * O registro nunca diz que o líder assinou. Diz que o operador X gravou que
 * Y autorizou, por tal motivo — e o banco carimba o operador como autor
 * (migration 08).
 */
export interface Contingencia {
  /** Nome de quem autorizou. Texto livre porque é declaração, não identidade. */
  autorizou: string;
  motivo: string;
}

export const MOTIVOS_CONTINGENCIA = [
  "Líder não está na planta",
  "Líder não lembra a senha",
  "Líder ainda não tem login",
  "Problema de conexão no tablet",
] as const;

export type ResultadoValidacao =
  | { ok: true }
  /** A migration 06 ainda não foi aplicada. Ver comentário em registrarValidacoes. */
  | { ok: false; indisponivel: true; erro: string }
  | { ok: false; indisponivel?: false; erro: string };

export async function autenticarLider(
  login: string,
  senha: string,
): Promise<ResultadoAutenticacao> {
  const usuario = login.trim();
  if (!usuario || !senha) {
    return { ok: false, erro: "Informe usuário e senha." };
  }

  const cliente = criarClienteValidacao();

  try {
    const { data, error } = await cliente.auth.signInWithPassword({
      email: loginParaEmail(usuario),
      password: senha,
    });

    if (error || !data.user) {
      return { ok: false, erro: mensagemErroLogin(error) };
    }

    const { data: perfil, error: pErr } = await cliente
      .from("profiles")
      .select("perfil, active, nome, usuario")
      .eq("id", data.user.id)
      .maybeSingle();

    if (pErr || !perfil) {
      return { ok: false, erro: "Perfil não encontrado. Procure o supervisor." };
    }
    if (!perfil.active) {
      return { ok: false, erro: "Usuário inativo. Procure o supervisor." };
    }
    if (!PERFIS_QUE_VALIDAM.includes(perfil.perfil as (typeof PERFIS_QUE_VALIDAM)[number])) {
      return {
        ok: false,
        erro: "Este usuário não tem permissão para validar. Chame o líder.",
      };
    }

    return {
      ok: true,
      lider: {
        userId: data.user.id,
        // O login e o nome vêm do BANCO, nunca do que foi digitado na tela.
        // É essa troca que acaba com os seis "Bruno".
        login: perfil.usuario ?? usuario,
        nome: perfil.nome ?? usuario,
        perfil: perfil.perfil,
        autenticadoEm: new Date().toISOString(),
      },
    };
  } catch (e) {
    console.error("[autenticarLider]", e);
    return { ok: false, erro: "Erro ao validar. Tente novamente." };
  } finally {
    // Encerra a sessão do líder de imediato. Como o cliente é
    // `persistSession: false`, nada sobra no tablet nem no localStorage.
    await cliente.auth.signOut().catch(() => undefined);
  }
}

/**
 * Fecha o turno EM CONTINGÊNCIA, na sessão de quem está no tablet.
 *
 * Usa o cliente normal de propósito: quem grava é o operador logado, e é isso
 * que o banco vai carimbar. Nada aqui tenta parecer assinatura do líder.
 */
export async function registrarContingencia(
  validacoes: ValidacaoParaRegistrar[],
  c: Contingencia,
): Promise<ResultadoValidacao> {
  if (!c.autorizou.trim()) {
    return { ok: false, erro: "Informe quem autorizou o fechamento." };
  }
  if (!c.motivo.trim()) {
    return { ok: false, erro: "Informe por que o líder não pôde validar." };
  }
  if (validacoes.length === 0) return { ok: true };

  const linhas = validacoes.map((v) => ({
    alvo_tipo: v.alvoTipo,
    alvo_id: v.alvoId,
    data_operacao: v.dataOperacao,
    turno: v.turno,
    linha: v.linha ?? "Linha 3",
    maquina: v.maquina ?? "Enchedora 3",
    assinatura: v.assinatura ?? null,
    observacao: v.observacao ?? null,
    contingencia: true,
    contingencia_autorizou: c.autorizou.trim(),
    contingencia_motivo: c.motivo.trim(),
  }));

  const { error } = await supabase.from("validacoes_lider" as never).insert(linhas as never);

  if (error) {
    const indisponivel =
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /contingencia|validacoes_lider/i.test(error.message ?? "");
    console.error("[registrarContingencia]", error);
    return indisponivel
      ? { ok: false, indisponivel: true, erro: "Registro de contingência ainda não disponível." }
      : { ok: false, erro: error.message ?? "Falha ao registrar a contingência." };
  }
  return { ok: true };
}

/**
 * Autentica o líder e grava as validações DENTRO da sessão dele.
 *
 * É a diferença entre o app dizer que o líder assinou e o banco saber disso.
 * A sessão vive só o tempo destes inserts.
 */
export async function autenticarERegistrar(
  login: string,
  senha: string,
  validacoes: ValidacaoParaRegistrar[],
): Promise<
  { ok: true; lider: IdentidadeLider; registro: ResultadoValidacao } | { ok: false; erro: string }
> {
  const usuario = login.trim();
  if (!usuario || !senha) return { ok: false, erro: "Informe usuário e senha." };

  const cliente = criarClienteValidacao();

  try {
    const { data, error } = await cliente.auth.signInWithPassword({
      email: loginParaEmail(usuario),
      password: senha,
    });
    if (error || !data.user) return { ok: false, erro: mensagemErroLogin(error) };

    const { data: perfil, error: pErr } = await cliente
      .from("profiles")
      .select("perfil, active, nome, usuario")
      .eq("id", data.user.id)
      .maybeSingle();

    if (pErr || !perfil) return { ok: false, erro: "Perfil não encontrado. Procure o supervisor." };
    if (!perfil.active) return { ok: false, erro: "Usuário inativo. Procure o supervisor." };
    if (!PERFIS_QUE_VALIDAM.includes(perfil.perfil as (typeof PERFIS_QUE_VALIDAM)[number])) {
      return { ok: false, erro: "Este usuário não tem permissão para validar. Chame o líder." };
    }

    const lider: IdentidadeLider = {
      userId: data.user.id,
      login: perfil.usuario ?? usuario,
      nome: perfil.nome ?? usuario,
      perfil: perfil.perfil,
      autenticadoEm: new Date().toISOString(),
    };

    let registro: ResultadoValidacao = { ok: true };

    if (validacoes.length > 0) {
      const linhas = validacoes.map((v) => ({
        alvo_tipo: v.alvoTipo,
        alvo_id: v.alvoId,
        data_operacao: v.dataOperacao,
        turno: v.turno,
        linha: v.linha ?? "Linha 3",
        maquina: v.maquina ?? "Enchedora 3",
        assinatura: v.assinatura ?? null,
        observacao: v.observacao ?? null,
        // Autor e horário NÃO vão aqui. O trigger da migration 06 os
        // sobrescreve com auth.uid() e now(); mandar valor seria teatro.
      }));

      const { error: vErr } = await cliente
        .from("validacoes_lider" as never)
        .insert(linhas as never);

      if (vErr) {
        // 42P01 = relação não existe; PGRST205 = PostgREST não achou a tabela.
        // Acontece enquanto a migration 06 não foi aplicada. Sinalizado como
        // `indisponivel` para a tela avisar em vez de fingir que gravou.
        const indisponivel =
          vErr.code === "42P01" ||
          vErr.code === "PGRST205" ||
          /validacoes_lider/i.test(vErr.message ?? "");
        console.error("[autenticarERegistrar] validacoes_lider:", vErr);
        registro = indisponivel
          ? { ok: false, indisponivel: true, erro: "Registro de auditoria ainda não disponível." }
          : { ok: false, erro: vErr.message ?? "Falha ao registrar a validação." };
      }
    }

    return { ok: true, lider, registro };
  } catch (e) {
    console.error("[autenticarERegistrar]", e);
    return { ok: false, erro: "Erro ao validar. Tente novamente." };
  } finally {
    await cliente.auth.signOut().catch(() => undefined);
  }
}
