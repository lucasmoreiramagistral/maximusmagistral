import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ClipboardCheck, Droplets, Loader2, Settings2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TelaCarregando } from "@/components/tela-carregando";
import { SignaturePad } from "@/components/signature-pad";
import { useGuard } from "@/hooks/use-guard";
import { useUsuario } from "@/hooks/use-storage";
import { useTurnoAtivoDoDia } from "@/lib/operacao/turno-ativo";
import { toast } from "sonner";
import {
  REGEX_NOME_COMPLETO,
  canonizarNomeOperador,
  obterOuCriarDeviceId,
  salvarIdentidadeDevice,
} from "@/lib/it/identidade";
import { salvarAta, type AtaDocumento } from "@/lib/it/atas";
import { cn } from "@/lib/utils";

const TURNOS = ["12x36 Dia", "12x36 Noite", "3º Turno"] as const;

const DOC_INFO: Record<
  AtaDocumento,
  { titulo: string; subtitulo: string; icon: typeof Settings2; cor: string }
> = {
  it002: {
    titulo: "IT 002 — Operação Enchedora",
    subtitulo: "Treinamento operacional na operação da Enchedora L3",
    icon: Settings2,
    cor: "text-primary",
  },
  it005: {
    titulo: "IT 005 — Limpeza Enchedora",
    subtitulo: "Treinamento operacional na limpeza da Enchedora L3",
    icon: Droplets,
    cor: "text-primary",
  },
};

export const Route = createFileRoute("/operador/it/ata")({
  head: () => ({
    meta: [
      { title: "Ata de Treinamento — IT" },
      {
        name: "description",
        content: "Cadastro de ata de treinamento na função operacional.",
      },
    ],
  }),
  component: AtaTreinamentoPage,
});

function AtaTreinamentoPage() {
  const { usuario, loading } = useGuard("operador");
  const navigate = useNavigate();

  // Turno ATIVO do dia (cobre extra/cobertura), não o padrão do cadastro.
  const turnoAtivo = useTurnoAtivoDoDia(usuario);

  const [doc, setDoc] = useState<AtaDocumento | null>(null);
  const [nome, setNome] = useState("");
  const [turno, setTurno] = useState<string>(turnoAtivo.turno ?? "");
  const [instrutor, setInstrutor] = useState("");
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [tocou, setTocou] = useState({ nome: false, instrutor: false });

  // Sincroniza turno com o Turno Ativo do dia (cobre quando o operador
  // define/altera o turno após esta tela ter montado).
  useEffect(() => {
    if (!turno && turnoAtivo.turno) setTurno(turnoAtivo.turno);
  }, [turnoAtivo.turno, turno]);

  const nomeLimpo = useMemo(
    () => nome.trim().replace(/\s+/g, " "),
    [nome],
  );
  const nomeValido = REGEX_NOME_COMPLETO.test(nomeLimpo);
  const instrutorLimpo = instrutor.trim().replace(/\s+/g, " ");
  const instrutorValido = REGEX_NOME_COMPLETO.test(instrutorLimpo);
  const podeEnviar =
    !!doc && nomeValido && instrutorValido && !!turno && !!assinatura && !salvando;

  if (loading || !usuario) return <TelaCarregando />;

  // ─── Tela 1: escolher qual IT ───
  if (!doc) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader
          titulo="Ata de Treinamento na Função"
          subtitulo="Selecione qual IT você foi treinado"
          voltarPara="/operador/it"
        />
        <main className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
          <div className="mb-6 rounded-xl border border-primary/20 bg-primary-soft/40 p-4 md:p-5">
            <div className="flex items-start gap-3">
              <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="text-sm text-foreground md:text-base">
                Esta ata <strong>libera o seu acesso</strong> à instrução de
                trabalho. Após cadastrada, você poderá consultar a IT a qualquer
                momento usando seu nome completo.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(["it002", "it005"] as const).map((d) => {
              const info = DOC_INFO[d];
              const Icon = info.icon;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDoc(d)}
                  className="group flex flex-col gap-4 rounded-2xl border-2 border-border bg-card p-6 text-left transition-all hover:border-primary/50 hover:shadow-md active:bg-primary active:text-primary-foreground active:border-primary md:p-8"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-soft text-primary group-active:bg-primary-foreground/15 group-active:text-primary-foreground">
                    <Icon className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="text-lg font-bold md:text-xl">{info.titulo}</p>
                    <p className="mt-1 text-sm text-muted-foreground group-active:text-primary-foreground/80">
                      {info.subtitulo}
                    </p>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-muted-foreground group-active:text-primary-foreground/80">
                    Cadastrar ata desta IT →
                  </p>
                </button>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  const info = DOC_INFO[doc];
  const Icon = info.icon;

  async function handleEnviar() {
    if (!doc || !podeEnviar) return;
    setSalvando(true);
    try {
      const deviceId = obterOuCriarDeviceId();
      await salvarAta({
        documento: doc,
        operadorNome: nomeLimpo,
        operadorUserId: usuario?.userId ?? null,
        turno,
        equipe: usuario?.equipePadrao ?? null,
        instrutorNome: instrutorLimpo,
        instrutorAssinatura: assinatura!,
        deviceId,
        registradoPorLogin: usuario?.usuario ?? null,
        registradoPorPerfil: usuario?.perfil ?? null,
      });

      // Já salva a identidade local pra liberar o gate sem reperguntar
      const agora = new Date().toISOString();
      salvarIdentidadeDevice({
        userId: usuario?.userId ?? null,
        nomeCompleto: nomeLimpo,
        nomeCanonico: canonizarNomeOperador(nomeLimpo),
        confirmadoEm: agora,
        ultimoUso: agora,
      });

      toast.success("Ata cadastrada!", {
        description: `Acesso à ${info.titulo} liberado para ${nomeLimpo}.`,
      });
      navigate({ to: "/operador/it" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast.error("Não foi possível salvar a ata", { description: msg });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <AppHeader
        titulo="Ata de Treinamento na Função"
        subtitulo={info.titulo}
        voltarPara="/operador/it"
      />
      <main className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
        <button
          type="button"
          onClick={() => setDoc(null)}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Trocar IT
        </button>

        <div className="mb-6 flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="font-bold text-foreground">{info.titulo}</p>
            <p className="text-sm text-muted-foreground">{info.subtitulo}</p>
          </div>
        </div>

        <div className="space-y-5 rounded-2xl border border-border bg-card p-5 md:p-6">
          {/* Nome completo */}
          <div className="space-y-2">
            <Label htmlFor="ata-nome" className="text-sm font-semibold">
              Seu nome completo *
            </Label>
            <Input
              id="ata-nome"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                if (!tocou.nome) setTocou((t) => ({ ...t, nome: true }));
              }}
              autoComplete="name"
              autoCapitalize="words"
              spellCheck={false}
              placeholder="Ex: Lucas Moreira"
              className={cn(
                "h-12 text-base",
                tocou.nome &&
                  !nomeValido &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
            {tocou.nome && !nomeValido && (
              <p className="text-xs font-medium text-destructive">
                Digite seu nome e sobrenome (≥2 letras cada).
              </p>
            )}
          </div>

          {/* Turno */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Turno *</Label>
            <Select value={turno} onValueChange={setTurno}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Selecione seu turno" />
              </SelectTrigger>
              <SelectContent>
                {TURNOS.map((t) => (
                  <SelectItem key={t} value={t} className="text-base">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Instrutor nome */}
          <div className="space-y-2">
            <Label htmlFor="ata-instrutor" className="text-sm font-semibold">
              Nome do instrutor *
            </Label>
            <p className="text-xs text-muted-foreground">
              Quem ensinou você (líder, outro operador, supervisor…).
            </p>
            <Input
              id="ata-instrutor"
              value={instrutor}
              onChange={(e) => {
                setInstrutor(e.target.value);
                if (!tocou.instrutor)
                  setTocou((t) => ({ ...t, instrutor: true }));
              }}
              autoComplete="off"
              autoCapitalize="words"
              spellCheck={false}
              placeholder="Ex: Karolainny Silva"
              className={cn(
                "h-12 text-base",
                tocou.instrutor &&
                  !instrutorValido &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
            {tocou.instrutor && !instrutorValido && (
              <p className="text-xs font-medium text-destructive">
                Digite o nome completo do instrutor.
              </p>
            )}
          </div>

          {/* Assinatura do instrutor */}
          <div className="space-y-2">
            <SignaturePad
              value={assinatura}
              onChange={setAssinatura}
              label="Assinatura do instrutor *"
              ajuda="Peça para o instrutor assinar com o dedo na caixa abaixo."
              altura={200}
            />
          </div>

          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            A data do treinamento será preenchida automaticamente como{" "}
            <strong>
              {new Date().toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </strong>
            .
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-4 backdrop-blur md:static md:mt-6 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <div className="mx-auto w-full max-w-2xl">
            <Button
              type="button"
              onClick={handleEnviar}
              disabled={!podeEnviar}
              className="h-14 w-full text-base font-semibold"
            >
              {salvando && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              {salvando ? "Cadastrando…" : "Cadastrar ata e liberar acesso"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
