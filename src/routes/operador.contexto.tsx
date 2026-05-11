import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TelaCarregando } from "@/components/tela-carregando";
import { useGuard } from "@/hooks/use-guard";
import { storage } from "@/lib/checklist/storage";
import type { ContextoChecklist, Equipe, Turno } from "@/lib/checklist/types";
import { calcularDataOperacional } from "@/lib/operacao/data-operacional";
import { ESCALAS, escalaExataPorTurnoEquipe, escalaPorTurnoEquipe } from "@/lib/operacao/escalas";
import { setTurnoAtivoDoDia } from "@/lib/operacao/turno-ativo";

const calcularDataFolha = calcularDataOperacional;

function formatarDataBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export const Route = createFileRoute("/operador/contexto")({
  head: () => ({ meta: [{ title: "Contexto do checklist — Operador" }] }),
  component: ContextoPage,
});

const STORAGE_CTX = "fm-checklist:contexto-pendente";
const STORAGE_NOME_PREFIX = "fm-checklist:operador-nome:";

function nomeStorageKey(userId: string | undefined | null) {
  return userId ? `${STORAGE_NOME_PREFIX}${userId}` : null;
}

function ContextoPage() {
  const { usuario, loading } = useGuard("operador");
  const navigate = useNavigate();

  const [erro, setErro] = useState("");
  // Pré-seleção a partir do cadastro (se houver), mas operador pode trocar.
  const [turno, setTurno] = useState<Turno | "">(
    (usuario?.turnoPadrao as Turno | undefined) ?? "",
  );
  const [equipe, setEquipe] = useState<Equipe | "">(
    (usuario?.equipePadrao as Equipe | undefined) ?? "",
  );

  // Selects restritos a combos válidos das ESCALAS (sem turno x equipe inválido).
  const TURNOS_UNICOS = Array.from(new Set(ESCALAS.map((e) => e.turno))) as Turno[];
  const equipesValidas: Equipe[] = turno
    ? (ESCALAS.filter((e) => e.turno === turno).map((e) => e.equipe) as Equipe[])
    : [];

  // Combo válido?
  const comboValido = !!turno && !!equipe && !!escalaPorTurnoEquipe(turno, equipe);

  // Data calculada automaticamente a partir do turno/equipe selecionados.
  const data = comboValido ? calcularDataFolha(equipe, turno) : "";

  if (loading || !usuario) return <TelaCarregando />;

  const continuar = () => {
    if (!turno || !equipe) {
      setErro("Selecione turno e equipe para continuar.");
      return;
    }
    if (!comboValido) {
      setErro("Combinação de turno e equipe inválida. Escolha uma escala válida.");
      return;
    }
    const ctx: ContextoChecklist = {
      data: calcularDataFolha(equipe, turno),
      turno,
      equipe,
      linha: "Linha 3",
      maquina: "Enchedora 3",
      area: "Envase",
      equipamento: "Enchedora Zegla 50V",
      operadorResponsavel: usuario.nome,
    };
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_CTX, JSON.stringify(ctx));
      // Mantém compat com o restante do app, que ainda lê o nome do operador
      // por userId em localStorage.
      const nomeKey = nomeStorageKey(usuario.userId);
      if (nomeKey) {
        window.localStorage.setItem(nomeKey, usuario.nome);
        window.dispatchEvent(
          new CustomEvent("fm-storage-update", { detail: { key: nomeKey } }),
        );
      }
    }
    // Alinha o "Turno Ativo do Dia" com o contexto escolhido na frente —
    // assim o verso (PTP/limpeza/validação) acompanha automaticamente.
    setTurnoAtivoDoDia(usuario, { turno, equipe });
    storage.clearRascunho();
    navigate({ to: "/operador/momento" });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Contexto do checklist"
        subtitulo="Confirme os dados antes de iniciar"
        voltarPara="/operador"
      />
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-10">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <CampoFixo titulo="Linha" valor="Linha 3" />
            <CampoFixo titulo="Máquina" valor="Enchedora 3" />
            <CampoFixo titulo="Área" valor="Envase" />
            <CampoFixo titulo="Equipamento" valor="Enchedora Zegla 50V" />

            <div>
              <Label htmlFor="turno-select" className="text-base">
                Turno
              </Label>
              <Select
                value={turno}
                onValueChange={(v) => {
                  const novoTurno = v as Turno;
                  setTurno(novoTurno);
                  // Se equipe atual não pertence à nova lista de escalas, reseta.
                  const novasEquipes = ESCALAS.filter(
                    (e) => e.turno === novoTurno,
                  ).map((e) => e.equipe) as Equipe[];
                  if (equipe && !novasEquipes.includes(equipe)) {
                    setEquipe(novasEquipes[0] ?? "");
                  } else if (!equipe && novasEquipes.length === 1) {
                    setEquipe(novasEquipes[0]);
                  }
                  if (erro) setErro("");
                }}
              >
                <SelectTrigger id="turno-select" className="mt-1.5 h-12 text-base font-semibold">
                  <SelectValue placeholder="Selecione o turno" />
                </SelectTrigger>
                <SelectContent>
                  {TURNOS_UNICOS.map((t) => (
                    <SelectItem key={t} value={t} className="text-base">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="equipe-select" className="text-base">
                Equipe
              </Label>
              <Select
                value={equipe}
                onValueChange={(v) => {
                  setEquipe(v as Equipe);
                  if (erro) setErro("");
                }}
                disabled={!turno}
              >
                <SelectTrigger id="equipe-select" className="mt-1.5 h-12 text-base font-semibold">
                  <SelectValue placeholder={turno ? "Selecione a equipe" : "Escolha o turno antes"} />
                </SelectTrigger>
                <SelectContent>
                  {equipesValidas.map((e) => (
                    <SelectItem key={e} value={e} className="text-base">
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <CampoFixo
                titulo="Data"
                valor={data ? formatarDataBR(data) : "— selecione turno e equipe —"}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Data calculada automaticamente conforme o turno e equipe escolhidos.
              </p>
            </div>

            <div className="md:col-span-2">
              <CampoFixo titulo="Operador responsável" valor={usuario.nome} />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Identificado pelo seu login. A assinatura digital ao final confirma a autoria.
              </p>
            </div>
          </div>

          {erro && (
            <p className="mt-4 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
              {erro}
            </p>
          )}

          <div className="mt-8 flex justify-end">
            <Button onClick={continuar} size="lg" className="h-14 px-10 text-base font-semibold">
              Continuar →
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function CampoFixo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <Label className="text-base">{titulo}</Label>
      <div className="mt-1.5 flex h-12 items-center rounded-md border border-input bg-muted px-3 text-base font-semibold text-foreground">
        {valor}
      </div>
    </div>
  );
}

export { STORAGE_CTX, STORAGE_NOME_PREFIX, nomeStorageKey };
