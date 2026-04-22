import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TelaCarregando } from "@/components/tela-carregando";
import { useGuard } from "@/hooks/use-guard";
import { storage } from "@/lib/checklist/storage";
import type { ContextoChecklist, Equipe, Turno } from "@/lib/checklist/types";

function calcularDataFolha(equipe: Equipe | null, turno: Turno | null): string {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const manaus = new Date(utcMs - 4 * 60 * 60_000);

  const horaMin = manaus.getUTCHours() * 60 + manaus.getUTCMinutes();
  const ehNoite =
    equipe === "Valderlan" ||
    equipe === "Bruno" ||
    turno === "12x36 Noite";

  if (ehNoite && horaMin < 6 * 60 + 10) {
    manaus.setUTCDate(manaus.getUTCDate() - 1);
  }

  const y = manaus.getUTCFullYear();
  const m = String(manaus.getUTCMonth() + 1).padStart(2, "0");
  const d = String(manaus.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatarDataBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export const Route = createFileRoute("/operador/contexto")({
  head: () => ({ meta: [{ title: "Contexto do checklist — Operador" }] }),
  component: ContextoPage,
});

const STORAGE_CTX = "fm-checklist:contexto-pendente";

function ContextoPage() {
  const { usuario, loading } = useGuard("operador");
  const navigate = useNavigate();

  const [erro, setErro] = useState("");

  // Equipe e turno são FIXOS — vêm do profile do usuário logado e não são editáveis.
  const turno = usuario?.turnoPadrao ?? null;
  const equipe = usuario?.equipePadrao ?? null;

  // Data calculada automaticamente a partir do turno/equipe — operador não pode editar.
  const data = calcularDataFolha(equipe, turno);

  if (loading || !usuario) return <TelaCarregando />;

  const continuar = () => {
    if (!turno || !equipe) {
      setErro(
        "Sua conta não possui equipe/turno configurados. Procure a gestão.",
      );
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
    }
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
              <CampoFixo titulo="Data" valor={formatarDataBR(data)} />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Data calculada automaticamente conforme seu turno. Não pode ser alterada.
              </p>
            </div>

            <CampoFixo titulo="Turno" valor={turno ?? "—"} />

            <div className="md:col-span-2">
              <CampoFixo titulo="Equipe" valor={equipe ?? "—"} />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Equipe e turno definidos pela sua conta. Não podem ser alterados aqui.
              </p>
            </div>

            <div className="md:col-span-2">
              <CampoFixo titulo="Operador responsável" valor={usuario.nome} />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Identificado automaticamente pela sua conta. Você assinará digitalmente ao final do checklist do dia.
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

export { STORAGE_CTX };
