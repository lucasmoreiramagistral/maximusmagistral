import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGuard } from "@/hooks/use-guard";
import { TelaCarregando } from "@/components/tela-carregando";
import { genId } from "@/lib/checklist/storage";
import { insertAnomalia } from "@/lib/checklist/supabase-storage";
import type {
  Anomalia,
  CategoriaAnomalia,
  CriticidadeAnomalia,
  Equipe,
  Turno,
} from "@/lib/checklist/types";
import { formatarDataHora } from "@/lib/checklist/format";

export const Route = createFileRoute("/manutencao/anomalia/nova")({
  head: () => ({ meta: [{ title: "Registrar anomalia — Manutenção" }] }),
  component: NovaAnomaliaManutencao,
});

const CATEGORIAS: CategoriaAnomalia[] = [
  "Mecânica",
  "Elétrica",
  "Automação",
  "Processo",
  "Segurança",
  "Limpeza / 5S",
  "Outro",
];

const CRITICIDADES: CriticidadeAnomalia[] = ["Baixa", "Média", "Alta", "Crítica"];
const EQUIPAMENTOS_AFETADOS = ["Enchedora 3", "Unimix 3", "Trocador de Calor 3", "Outro"] as const;

const EQUIPES: { equipe: Equipe; label: string; turno: Turno }[] = [
  { equipe: "Karolainny", label: "Equipe 1 — Karolainny", turno: "12x36 Dia" },
  { equipe: "Valderlan", label: "Equipe 2 — Valderlan", turno: "12x36 Noite" },
  { equipe: "Nilson", label: "Equipe 3 — Nilson", turno: "12x36 Dia" },
  { equipe: "Bruno", label: "Equipe 4 — Bruno", turno: "12x36 Noite" },
];

function NovaAnomaliaManutencao() {
  const navigate = useNavigate();
  const { usuario, loading } = useGuard("manutencao");

  const [categoria, setCategoria] = useState<CategoriaAnomalia | "">("");
  const [criticidade, setCriticidade] = useState<CriticidadeAnomalia>("Média");
  const [descricao, setDescricao] = useState("");
  const [equipamentoAfetado, setEquipamentoAfetado] = useState<string>("Enchedora 3");
  const [equipe, setEquipe] = useState<Equipe | "">("");
  const [tecnico, setTecnico] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [criadoEm] = useState(() => new Date().toISOString());

  const turnoAuto = useMemo<Turno | null>(() => {
    const found = EQUIPES.find((e) => e.equipe === equipe);
    return found?.turno ?? null;
  }, [equipe]);

  if (loading || !usuario) return <TelaCarregando />;

  const salvar = async () => {
    if (!categoria) {
      setErro("Selecione a categoria");
      return;
    }
    if (!descricao.trim()) {
      setErro("Descreva a anomalia");
      return;
    }
    if (!equipe || !turnoAuto) {
      setErro("Selecione a equipe");
      return;
    }
    const nomeNorm = tecnico.trim().replace(/\s+/g, " ");
    if (nomeNorm.length < 3) {
      setErro("Informe o técnico responsável (mínimo 3 caracteres)");
      return;
    }
    if (/^\d+$/.test(nomeNorm)) {
      setErro("O técnico responsável não pode ser apenas números");
      return;
    }

    const dataOperacao = criadoEm.slice(0, 10);
    const anomalia: Anomalia = {
      id: genId(),
      criadoEm,
      linha: "Linha 3",
      area: "Envase",
      maquina: "Enchedora 3",
      categoria,
      criticidade,
      descricao: descricao.trim(),
      status: "Aberta",
      equipe,
      turno: turnoAuto,
      operador: nomeNorm,
      operadorLogin: usuario.usuario,
      operadorResponsavel: nomeNorm,
      origemAnomalia: "manual_manutencao",
      abertoPorLogin: usuario.usuario,
      abertoPorPerfil: "manutencao",
      tecnicoResponsavel: nomeNorm,
      equipamentoAfetado,
    };

    setErro("");
    setSalvando(true);
    try {
      await insertAnomalia(anomalia, dataOperacao);
      setSucesso(true);
    } catch (e) {
      console.error("[salvar anomalia manutenção] erro:", e);
      const msg = e instanceof Error ? e.message : String(e);
      setErro(`Não foi possível salvar a anomalia. ${msg}`);
    } finally {
      setSalvando(false);
    }
  };

  const fecharSucesso = () => {
    navigate({ to: "/manutencao/anomalias" });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Registrar anomalia"
        subtitulo="Manutenção — registro manual"
        voltarPara="/manutencao"
      />
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-10">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-7">
          <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-4 md:grid-cols-4">
            <Info label="Data/hora" valor={formatarDataHora(criadoEm)} />
            <Info label="Linha" valor="Linha 3" />
            <Info label="Área" valor="Produção" />
            <Info label="Máquina" valor="Enchedora 3" />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <Label className="text-base">Categoria</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaAnomalia)}>
                <SelectTrigger className="mt-1.5 h-12 w-full text-base">
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c} value={c} className="text-base">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-base">Equipamento afetado</Label>
              <Select value={equipamentoAfetado} onValueChange={setEquipamentoAfetado}>
                <SelectTrigger className="mt-1.5 h-12 w-full text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPAMENTOS_AFETADOS.map((eq) => (
                    <SelectItem key={eq} value={eq} className="text-base">
                      {eq}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">Opcional. Padrão: Enchedora 3.</p>
            </div>

            <div>
              <Label className="text-base">Criticidade</Label>
              <Select
                value={criticidade}
                onValueChange={(v) => setCriticidade(v as CriticidadeAnomalia)}
              >
                <SelectTrigger className="mt-1.5 h-12 w-full text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRITICIDADES.map((c) => (
                    <SelectItem key={c} value={c} className="text-base">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-base">Equipe</Label>
              <Select value={equipe} onValueChange={(v) => setEquipe(v as Equipe)}>
                <SelectTrigger className="mt-1.5 h-12 w-full text-base">
                  <SelectValue placeholder="Selecione a equipe" />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPES.map((e) => (
                    <SelectItem key={e.equipe} value={e.equipe} className="text-base">
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-base">Turno</Label>
              <div className="mt-1.5 flex h-12 items-center rounded-md border border-input bg-muted px-3 text-base font-semibold text-foreground">
                {turnoAuto ?? "—"}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Definido automaticamente pela equipe escolhida.
              </p>
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="tecnico" className="text-base">
                Técnico responsável
              </Label>
              <Input
                id="tecnico"
                value={tecnico}
                onChange={(e) => {
                  setTecnico(e.target.value);
                  setErro("");
                }}
                placeholder="Nome do técnico que está abrindo a anomalia"
                className="mt-1.5 h-12 text-base"
                autoComplete="off"
              />
            </div>

            <div className="md:col-span-2">
              <Label className="text-base">Descrição da anomalia</Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descreva o que aconteceu, condições e impactos"
                className="mt-1.5 min-h-[140px] text-base"
              />
            </div>
          </div>

          {erro && (
            <p className="mt-4 rounded-md bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive">
              {erro}
            </p>
          )}

          <div className="mt-7 flex justify-end">
            <Button
              size="lg"
              className="h-14 px-8 text-base font-semibold"
              onClick={salvar}
              disabled={salvando}
            >
              {salvando ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Salvando…
                </>
              ) : (
                <>
                  <AlertTriangle className="mr-2 h-5 w-5" />
                  Salvar anomalia
                </>
              )}
            </Button>
          </div>
        </div>
      </main>

      {sucesso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-lg md:p-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Anomalia registrada</h2>
            <p className="mt-2 text-sm text-muted-foreground">Sincronizado com o servidor</p>
            <Button onClick={fecharSucesso} size="lg" className="mt-6 h-12 w-full text-base">
              Continuar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{valor}</p>
    </div>
  );
}
