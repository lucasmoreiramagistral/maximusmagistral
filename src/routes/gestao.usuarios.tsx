import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Power,
  PowerOff,
  Pencil,
  ShieldAlert,
  KeyRound,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ESCALAS, ESCALAS_AGRUPADAS } from "@/lib/operacao/escalas";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useGuard } from "@/hooks/use-guard";
import {
  HIERARQUIAS,
  MODULOS_ACESSO,
  PERFIS_ATIVOS,
  PERFIL_INFO,
  type Hierarquia,
  type ModuloAcesso,
  type Perfil,
} from "@/lib/checklist/types";
import {
  alterarStatusUsuario,
  criarUsuario,
  desativarELiberarLogin,
  editarUsuario,
  listarUsuarios,
  trocarSenhaUsuario,
} from "@/lib/usuarios/usuarios.functions";

const HIERARQUIAS_ADMIN: ReadonlyArray<Hierarquia> = [
  "desenvolvedor",
  "gerente",
  "coordenador",
];

export const Route = createFileRoute("/gestao/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — Gestão Industrial" },
      {
        name: "description",
        content:
          "Cadastro e gestão de usuários do Maximus Magistral com hierarquia e módulos de acesso.",
      },
    ],
  }),
  component: UsuariosPage,
});

interface UsuarioRow {
  id: string;
  nome: string;
  usuario: string;
  email_interno: string;
  perfil: Perfil;
  equipe_padrao: string | null;
  turno_padrao: string | null;
  active: boolean;
  created_at: string;
  matricula: string | null;
  hierarquia: Hierarquia;
  modulos_acesso: ModuloAcesso[];
  somente_leitura: boolean;
  criado_por: string | null;
}

function normalizarLogin(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}

function modulosSugeridos(perfil: Perfil): ModuloAcesso[] {
  return [perfil];
}

function UsuariosPage() {
  const { usuario, loading: authLoading } = useGuard("gestao");

  // Acesso: qualquer pessoa que entra pela sessão gestão pode usar.
  // Cadastrar/editar/trocar senha = qualquer "gestao" ativo.
  // Desativar/Reativar e "Desativar e liberar login" = só desenvolvedor/gerente/coordenador.
  const podeAdministrar = !!usuario;
  const podeAdminHierarquia =
    !!usuario?.hierarquia && HIERARQUIAS_ADMIN.includes(usuario.hierarquia);

  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Dialog de cadastro/edição
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<UsuarioRow | null>(null);

  // Dialog de confirmação de status (ativar/inativar)
  const [confirmStatus, setConfirmStatus] = useState<UsuarioRow | null>(null);
  const [salvandoStatus, setSalvandoStatus] = useState(false);

  // Dialog de troca de senha
  const [trocarSenhaUser, setTrocarSenhaUser] = useState<UsuarioRow | null>(null);

  // Dialog de "desativar e liberar login"
  const [confirmLiberar, setConfirmLiberar] = useState<UsuarioRow | null>(null);
  const [salvandoLiberar, setSalvandoLiberar] = useState(false);

  const carregar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await listarUsuarios();
      if (!res.ok) {
        setErro(res.erro);
        setUsuarios([]);
        return;
      }
      setUsuarios(res.usuarios as unknown as UsuarioRow[]);
    } catch (e) {
      console.error(e);
      setErro("Falha ao carregar usuários");
      setUsuarios([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!podeAdministrar) return;
    void carregar();
  }, [podeAdministrar]);

  if (authLoading || !usuario) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!podeAdministrar) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader titulo="Usuários" subtitulo="Acesso restrito" />
        <main className="mx-auto w-full max-w-[900px] px-4 py-10 text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
          <p className="mt-4 text-lg font-semibold">Acesso restrito</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Você não tem hierarquia suficiente para administrar usuários.
          </p>
        </main>
      </div>
    );
  }

  const abrirNovo = () => {
    setEditando(null);
    setDialogAberto(true);
  };

  const abrirEditar = (u: UsuarioRow) => {
    setEditando(u);
    setDialogAberto(true);
  };

  const confirmarStatus = async () => {
    if (!confirmStatus) return;
    setSalvandoStatus(true);
    try {
      const res = await alterarStatusUsuario({
        data: { id: confirmStatus.id, active: !confirmStatus.active },
      });
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success(
        confirmStatus.active ? "Usuário inativado" : "Usuário reativado",
      );
      setConfirmStatus(null);
      void carregar();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao alterar status");
    } finally {
      setSalvandoStatus(false);
    }
  };

  const confirmarLiberar = async () => {
    if (!confirmLiberar) return;
    setSalvandoLiberar(true);
    try {
      const res = await desativarELiberarLogin({ data: { id: confirmLiberar.id } });
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success(
        `Login "${res.loginLiberado}" liberado. Usuário desativado.`,
      );
      setConfirmLiberar(null);
      void carregar();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao liberar login");
    } finally {
      setSalvandoLiberar(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader titulo="Usuários" subtitulo="Cadastro · hierarquia · módulos" />
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/gestao">
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Usuários</h1>
              <p className="text-sm text-muted-foreground">
                {usuarios.length} {usuarios.length === 1 ? "cadastro" : "cadastros"}
              </p>
            </div>
          </div>
          <Button onClick={abrirNovo} size="lg">
            <Plus className="mr-1 h-4 w-4" /> Novo usuário
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : erro ? (
          <div className="rounded-md border border-destructive/40 bg-destructive-soft p-4 text-sm text-destructive">
            {erro}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Hierarquia</TableHead>
                  <TableHead>Módulos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">
                      {u.matricula ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">{u.nome}</TableCell>
                    <TableCell className="font-mono text-xs">{u.usuario}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{u.perfil}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{u.hierarquia}</Badge>
                      {u.somente_leitura && (
                        <Badge variant="outline" className="ml-1 text-warning-foreground">
                          leitura
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.modulos_acesso.map((m) => (
                          <Badge key={m} variant="outline" className="text-xs">
                            {m}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.active ? (
                        <Badge className="bg-success text-success-foreground">Ativo</Badge>
                      ) : (
                        <Badge variant="destructive">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => abrirEditar(u)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setTrocarSenhaUser(u)}
                          title="Trocar senha"
                        >
                          <KeyRound className="h-4 w-4 text-primary" />
                        </Button>
                        {podeAdminHierarquia && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setConfirmStatus(u)}
                              title={u.active ? "Desativar" : "Reativar"}
                            >
                              {u.active ? (
                                <PowerOff className="h-4 w-4 text-destructive" />
                              ) : (
                                <Power className="h-4 w-4 text-success" />
                              )}
                            </Button>
                            {u.active && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setConfirmLiberar(u)}
                                title="Desativar e liberar login para reuso"
                              >
                                <UserMinus className="h-4 w-4 text-warning-foreground" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {usuarios.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      Nenhum usuário cadastrado ainda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      <UsuarioFormDialog
        aberto={dialogAberto}
        onOpenChange={(o) => {
          setDialogAberto(o);
          if (!o) setEditando(null);
        }}
        editando={editando}
        onSucesso={() => {
          setDialogAberto(false);
          setEditando(null);
          void carregar();
        }}
      />

      <AlertDialog
        open={!!confirmStatus}
        onOpenChange={(o) => !o && setConfirmStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmStatus?.active ? "Inativar usuário?" : "Reativar usuário?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmStatus?.active
                ? `${confirmStatus?.nome} não conseguirá mais entrar no sistema.`
                : `${confirmStatus?.nome} voltará a poder acessar o sistema.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvandoStatus}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarStatus} disabled={salvandoStatus}>
              {salvandoStatus ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TrocarSenhaDialog
        alvo={trocarSenhaUser}
        onOpenChange={(o) => !o && setTrocarSenhaUser(null)}
        onSucesso={() => setTrocarSenhaUser(null)}
      />

      <AlertDialog
        open={!!confirmLiberar}
        onOpenChange={(o) => !o && setConfirmLiberar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar e liberar login?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmLiberar?.nome} será desativado e o login{" "}
              <span className="font-mono font-semibold">{confirmLiberar?.usuario}</span>{" "}
              ficará livre para reuso em um novo cadastro. O histórico operacional
              é preservado (o usuário continua existindo, apenas renomeado).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvandoLiberar}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarLiberar} disabled={salvandoLiberar}>
              {salvandoLiberar ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              Desativar e liberar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ───────────────────── Dialog de troca de senha ─────────────────────

function TrocarSenhaDialog({
  alvo,
  onOpenChange,
  onSucesso,
}: {
  alvo: UsuarioRow | null;
  onOpenChange: (o: boolean) => void;
  onSucesso: () => void;
}) {
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (alvo) {
      setSenha("");
      setConfirmar("");
      setErro(null);
    }
  }, [alvo]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!alvo) return;
    if (senha.length < 6) {
      setErro("Senha precisa ter pelo menos 6 caracteres");
      return;
    }
    if (senha !== confirmar) {
      setErro("As senhas não coincidem");
      return;
    }
    setSalvando(true);
    try {
      const res = await trocarSenhaUsuario({
        data: { id: alvo.id, novaSenha: senha },
      });
      if (!res.ok) {
        setErro(res.erro);
        return;
      }
      toast.success(`Senha de ${alvo.nome} trocada`);
      onSucesso();
    } catch (err) {
      console.error(err);
      setErro("Falha ao trocar senha");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!alvo} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Trocar senha</DialogTitle>
          <DialogDescription>
            {alvo
              ? `Defina uma nova senha para ${alvo.nome} (${alvo.usuario}).`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="nova-senha">Nova senha *</Label>
            <Input
              id="nova-senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              minLength={6}
              required
              disabled={salvando}
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor="confirmar-senha">Confirmar nova senha *</Label>
            <Input
              id="confirmar-senha"
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              minLength={6}
              required
              disabled={salvando}
              autoComplete="new-password"
            />
          </div>
          {erro && (
            <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
              {erro}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Trocar senha
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────── Dialog de cadastro/edição ─────────────────────

function UsuarioFormDialog({
  aberto,
  onOpenChange,
  editando,
  onSucesso,
}: {
  aberto: boolean;
  onOpenChange: (o: boolean) => void;
  editando: UsuarioRow | null;
  onSucesso: () => void;
}) {
  const isEdit = !!editando;

  const [nome, setNome] = useState("");
  const [login, setLogin] = useState("");
  const [loginEditado, setLoginEditado] = useState(false); // só pra novo
  const [senha, setSenha] = useState("");
  const [matricula, setMatricula] = useState("");
  const [perfil, setPerfil] = useState<Perfil>("operador");
  const [hierarquia, setHierarquia] = useState<Hierarquia>("operador");
  const [modulos, setModulos] = useState<ModuloAcesso[]>(["operador"]);
  // Escala padrão estruturada (id de ESCALAS) — "" significa "sem escala fixa".
  const [escalaIdSel, setEscalaIdSel] = useState<string>("");
  // Quando edição traz combo padrão que NÃO bate com nenhuma escala oficial.
  const [padraoInvalido, setPadraoInvalido] = useState<{
    equipe: string | null;
    turno: string | null;
  } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Reset/fill ao abrir
  useEffect(() => {
    if (!aberto) return;
    if (editando) {
      setNome(editando.nome);
      setLogin(editando.usuario);
      setLoginEditado(true);
      setSenha("");
      setMatricula(editando.matricula ?? "");
      setPerfil(editando.perfil);
      setHierarquia(editando.hierarquia);
      setModulos(editando.modulos_acesso);
      const eq = editando.equipe_padrao;
      const tn = editando.turno_padrao;
      if (eq && tn) {
        const escala = ESCALAS.find((e) => e.equipe === eq && e.turno === tn);
        if (escala) {
          setEscalaIdSel(escala.id);
          setPadraoInvalido(null);
        } else {
          setEscalaIdSel("");
          setPadraoInvalido({ equipe: eq, turno: tn });
        }
      } else if (eq || tn) {
        setEscalaIdSel("");
        setPadraoInvalido({ equipe: eq, turno: tn });
      } else {
        setEscalaIdSel("");
        setPadraoInvalido(null);
      }
    } else {
      setNome("");
      setLogin("");
      setLoginEditado(false);
      setSenha("");
      setMatricula("");
      setPerfil("operador");
      setHierarquia("operador");
      setModulos(["operador"]);
      setEscalaIdSel("");
      setPadraoInvalido(null);
    }
    setErro(null);
  }, [aberto, editando]);

  // Sugere login a partir do nome (só em novo cadastro)
  useEffect(() => {
    if (isEdit) return;
    if (loginEditado) return;
    setLogin(normalizarLogin(nome));
  }, [nome, loginEditado, isEdit]);

  // Quando muda o perfil, sugere módulos correspondentes
  const handlePerfilChange = (novo: Perfil) => {
    setPerfil(novo);
    setModulos(modulosSugeridos(novo));
  };

  const toggleModulo = (m: ModuloAcesso) => {
    setModulos((atual) =>
      atual.includes(m) ? atual.filter((x) => x !== m) : [...atual, m],
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (!nome.trim() || nome.trim().length < 2) {
      setErro("Informe o nome completo");
      return;
    }
    const loginNorm = normalizarLogin(login);
    if (loginNorm.length < 2) {
      setErro("Login inválido");
      return;
    }
    if (!isEdit && senha.length < 6) {
      setErro("Senha precisa ter pelo menos 6 caracteres");
      return;
    }
    if (modulos.length === 0) {
      setErro("Selecione ao menos um módulo de acesso");
      return;
    }

    setSalvando(true);
    try {
      const matriculaTrim = matricula.trim() || null;
      // Deriva equipe/turno padrão da escala selecionada (única fonte de verdade).
      const escalaSel = escalaIdSel
        ? ESCALAS.find((e) => e.id === escalaIdSel) ?? null
        : null;
      const equipeTrim = escalaSel ? escalaSel.equipe : null;
      const turnoTrim = escalaSel ? escalaSel.turno : null;

      if (isEdit && editando) {
        const res = await editarUsuario({
          data: {
            id: editando.id,
            nome: nome.trim(),
            usuario: loginNorm,
            perfil,
            hierarquia,
            modulosAcesso: modulos,
            matricula: matriculaTrim,
            equipePadrao: equipeTrim,
            turnoPadrao: turnoTrim,
          },
        });
        if (!res.ok) {
          setErro(res.erro);
          return;
        }
        toast.success(
          "loginAlterado" in res && res.loginAlterado
            ? "Usuário atualizado. O novo login deve ser usado no próximo acesso."
            : "Usuário atualizado",
        );
      } else {
        const res = await criarUsuario({
          data: {
            nome: nome.trim(),
            usuario: normalizarLogin(login),
            senha,
            perfil,
            hierarquia,
            modulosAcesso: modulos,
            matricula: matriculaTrim,
            equipePadrao: equipeTrim,
            turnoPadrao: turnoTrim,
          },
        });
        if (!res.ok) {
          setErro(res.erro);
          return;
        }
        toast.success(
          "aviso" in res && res.aviso ? `Usuário criado. ${res.aviso}` : "Usuário criado",
        );
      }
      onSucesso();
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof Response
          ? `Erro ${e.status}: ${e.statusText || "Falha na requisição"}`
          : "Falha ao salvar usuário";
      setErro(msg);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar usuário" : "Novo usuário"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Altere os dados do usuário. A senha é alterada em outro botão."
              : "Cadastre um novo usuário do Maximus Magistral."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {isEdit && (
            <p className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
              Se você alterar o login, o usuário precisará usar o novo login no próximo
              acesso. A sessão atual dele continua válida até ele sair.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="nome">Nome completo *</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: João da Silva"
                required
                disabled={salvando}
              />
            </div>
            <div>
              <Label htmlFor="matricula">Matrícula</Label>
              <Input
                id="matricula"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                placeholder="Opcional"
                disabled={salvando}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="login">Login *</Label>
              <Input
                id="login"
                value={login}
                onChange={(e) => {
                  setLogin(e.target.value);
                  setLoginEditado(true);
                }}
                placeholder="ex.: joao.silva"
                disabled={salvando}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {login && normalizarLogin(login) !== login
                  ? <>Será salvo como <span className="font-mono font-semibold">{normalizarLogin(login) || "—"}</span></>
                  : "Minúsculas, sem acento e sem espaço."}
              </p>
            </div>
            {!isEdit && (
              <div>
                <Label htmlFor="senha">Senha inicial *</Label>
                <Input
                  id="senha"
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  required
                  disabled={salvando}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Perfil *</Label>
              <Select
                value={perfil}
                onValueChange={(v) => handlePerfilChange(v as Perfil)}
                disabled={salvando}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERFIS_ATIVOS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PERFIL_INFO[p].titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Define a tela inicial e a etapa do PDCA que a pessoa executa.
              </p>
            </div>
            <div>
              <Label>Hierarquia *</Label>
              <Select
                value={hierarquia}
                onValueChange={(v) => setHierarquia(v as Hierarquia)}
                disabled={salvando}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HIERARQUIAS.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hierarquia === "externo" && (
                <p className="mt-1 text-xs text-warning-foreground">
                  Usuário externo será marcado como somente leitura.
                </p>
              )}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Módulos de acesso *</Label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {MODULOS_ACESSO.map((m) => (
                <label
                  key={m}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card p-2 hover:bg-accent"
                >
                  <Checkbox
                    checked={modulos.includes(m)}
                    onCheckedChange={() => toggleModulo(m)}
                    disabled={salvando}
                  />
                  <span className="text-sm font-medium">{m}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Salvo no banco. Hoje o login ainda usa só o perfil — multi-módulo virá numa
              próxima etapa.
            </p>
          </div>

          <div>
            <Label htmlFor="escala-padrao">Escala padrão</Label>
            <Select
              value={escalaIdSel === "" ? "__sem__" : escalaIdSel}
              onValueChange={(v) => setEscalaIdSel(v === "__sem__" ? "" : v)}
              disabled={salvando}
            >
              <SelectTrigger id="escala-padrao">
                <SelectValue placeholder="Selecione a escala padrão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__sem__">
                  Sem escala fixa (extra/cobertura)
                </SelectItem>
                {ESCALAS_AGRUPADAS.map((grupo) => (
                  <SelectGroup key={grupo.grupo}>
                    <SelectLabel>{grupo.grupo}</SelectLabel>
                    {grupo.escalas.map((esc) => (
                      <SelectItem key={esc.id} value={esc.id}>
                        {esc.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {padraoInvalido && (
              <p className="mt-1 rounded-md border border-warning/40 bg-warning-soft px-2.5 py-1.5 text-xs text-warning-foreground">
                O padrão atual no banco (
                <span className="font-mono font-semibold">
                  {padraoInvalido.equipe ?? "—"} · {padraoInvalido.turno ?? "—"}
                </span>
                ) não é uma escala oficial. Selecione uma escala válida ou
                deixe como “Sem escala fixa”.
              </p>
            )}
            {!padraoInvalido && perfil === "operador" && escalaIdSel === "" && (
              <p className="mt-1 rounded-md border border-warning/40 bg-warning-soft px-2.5 py-1.5 text-xs text-warning-foreground">
                Operadores sem escala fixa precisarão definir o turno do dia
                manualmente na tela inicial — senão o checklist de limpeza e
                PTP não aparecem.
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Define o turno e a equipe que o operador trabalha por padrão.
              O operador ainda pode marcar um “turno do dia” diferente quando
              cobrir extra.
            </p>
          </div>

          {erro && (
            <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
              {erro}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Salvar alterações" : "Criar usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
