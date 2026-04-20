import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { useRascunho } from "@/hooks/use-storage";
import { useGuard } from "@/hooks/use-guard";
import { useConnectionStatus, useOfflineQueue } from "@/hooks/use-connection-status";
import { TelaCarregando } from "@/components/tela-carregando";
import { storage, genId } from "@/lib/checklist/storage";
import { insertAnomalia } from "@/lib/checklist/supabase-storage";
import type {
  Anomalia,
  CategoriaAnomalia,
  CriticidadeAnomalia,
  Equipe,
  StatusAnomalia,
  Turno,
} from "@/lib/checklist/types";
import { formatarDataHora } from "@/lib/checklist/format";

export const Route = createFileRoute("/operador/anomalia/nova")({
  head: () => ({ meta: [{ title: "Registrar anomalia — Operador" }] }),
  component: NovaAnomaliaPage,
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
const STATUS: StatusAnomalia[] = ["Aberta", "Em andamento", "Resolvida"];
const EQUIPAMENTOS_AFETADOS = ["Enchedora 3", "Unimix 3", "Trocador de Calor 3", "Outro"] as const;

interface Origem {
  checklistId: string;
  itemNumero: number;
  descricao: string;
  equipe: Equipe;
  turno: Turno;
  retornarPara: string;
}

function NovaAnomaliaPage() {
  const navigate = useNavigate();
  const { usuario, loading } = useGuard("operador");
  const rascunho = useRascunho();
  const { checkNow, isOnline, pendingCount } = useConnectionStatus();
  const { enfileirar } = useOfflineQueue();

  const [origem, setOrigem] = useState<Origem | null>(null);
  const [categoria, setCategoria] = useState<CategoriaAnomalia | "">("");
  const [criticidade, setCriticidade] = useState<CriticidadeAnomalia>("Média");
  const [descricao, setDescricao] = useState("");
  const [equipamentoAfetado, setEquipamentoAfetado] = useState<string>("Enchedora 3");
  const [status, setStatus] = useState<StatusAnomalia>("Aberta");
  // Equipe e turno são FIXOS — vêm do profile do usuário logado e não podem ser alterados.
  const equipeFixa = (usuario?.equipePadrao ?? null) as Equipe | null;
  const turnoFixo = (usuario?.turnoPadrao ?? null) as Turno | null;
  const [operadorRespManual, setOperadorRespManual] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [criadoEm] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (typeof window === "undefined" || loading || !usuario) return;
    const raw = window.sessionStorage.getItem("fm-checklist:anomalia-origem");
    if (raw) setOrigem(JSON.parse(raw) as Origem);
  }, [usuario, loading]);

  if (loading || !usuario) return <TelaCarregando />;

  const ehManual = !origem;

  const salvar = async () => {
    if (!categoria) {
      setErro("Selecione a categoria");
      return;
    }
    if (!descricao.trim()) {
      setErro("Descreva a anomalia");
      return;
    }
    if (ehManual && (!equipeFixa || !turnoFixo)) {
      setErro(
        "Sua conta não possui equipe/turno configurados. Procure a gestão.",
      );
      return;
    }

    // Operador responsável: manual exige digitação; vindo de checklist herda do rascunho
    let operadorResp: string;
    if (ehManual) {
      const nomeNorm = operadorRespManual.trim().replace(/\s+/g, " ");
      if (nomeNorm.length < 3) {
        setErro("Informe o operador responsável (mínimo 3 caracteres)");
        return;
      }
      if (/^\d+$/.test(nomeNorm)) {
        setErro("O operador responsável não pode ser apenas números");
        return;
      }
      operadorResp = nomeNorm;
    } else {
      operadorResp = rascunho?.contexto.operadorResponsavel ?? usuario?.nome ?? "Operador";
    }

    const equipeFinal = (origem?.equipe ?? equipeFixa) as Equipe;
    const turnoFinal = (origem?.turno ?? turnoFixo) as Turno;
    const dataOperacao = rascunho?.contexto.data ?? criadoEm.slice(0, 10);
    const folhaKey = rascunho?.folhaKey;
    const momento = rascunho?.momento;

    const anomalia: Anomalia = {
      id: genId(),
      criadoEm,
      linha: "Linha 3",
      area: "Envase",
      maquina: "Enchedora 3",
      itemOrigem: origem ? { numero: origem.itemNumero, descricao: origem.descricao } : undefined,
      // IMPORTANTE: NÃO enviar checklistId aqui — o checklist ainda é apenas rascunho local,
      // não existe na tabela checklists, então a FK falharia. O vínculo é feito ao concluir o checklist.
      checklistId: undefined,
      categoria,
      criticidade,
      descricao: descricao.trim(),
      status,
      equipe: equipeFinal,
      turno: turnoFinal,
      operador: usuario?.nome ?? "Operador",
      operadorLogin: usuario?.usuario,
      operadorResponsavel: operadorResp,
      folhaKey,
      momento,
      origemAnomalia: ehManual ? "manual_operador" : "checklist_operador",
      abertoPorLogin: usuario?.usuario,
      abertoPorPerfil: "operador",
      equipamentoAfetado,
    };

    setErro("");
    setSalvando(true);

    const vincularRascunho = () => {
      if (origem && rascunho && rascunho.id === origem.checklistId) {
        const novas = rascunho.respostas.map((r) =>
          r.itemNumero === origem.itemNumero ? { ...r, anomaliaId: anomalia.id } : r,
        );
        storage.setRascunho({ ...rascunho, respostas: novas });
      }
    };

    // preflight
    const online = await checkNow();
    if (!online) {
      enfileirar("anomalia", { anomalia, dataOperacao });
      storage.saveAnomalia(anomalia);
      vincularRascunho();
      setSalvando(false);
      setSucesso(true);
      return;
    }

    try {
      await insertAnomalia(anomalia, dataOperacao);
      storage.saveAnomalia(anomalia);
      vincularRascunho();
      setSucesso(true);
    } catch (e) {
      console.error("[salvar anomalia] erro de rede, enfileirando:", e);
      enfileirar("anomalia", { anomalia, dataOperacao });
      storage.saveAnomalia(anomalia);
      vincularRascunho();
      setSucesso(true);
    } finally {
      setSalvando(false);
    }
  };

  const fecharSucesso = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("fm-checklist:anomalia-origem");
    }
    if (origem?.retornarPara === "checklist") {
      // Sinaliza ao checklist para avançar para o próximo item (ou ir ao resumo
      // se a anomalia foi do último item). A lógica fica em operador.checklist.tsx.
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          "fm-checklist:retorno-anomalia",
          JSON.stringify({
            checklistId: origem.checklistId,
            itemNumero: origem.itemNumero,
          }),
        );
      }
      navigate({ to: "/operador/checklist" });
    } else {
      navigate({ to: "/operador" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo="Registrar anomalia"
        subtitulo={ehManual ? "Registro manual" : "Vinculada a item do checklist"}
        voltarPara={origem?.retornarPara === "checklist" ? "/operador/checklist" : "/operador"}
      />
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-10">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-7">
          <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-4 md:grid-cols-4">
            <Info label="Data/hora" valor={formatarDataHora(criadoEm)} />
            <Info label="Linha" valor="Linha 3" />
            <Info label="Área" valor="Envase" />
            <Info label="Máquina" valor="Enchedora 3" />
          </div>

          {origem && (
            <div className="mb-5 rounded-xl border border-warning/40 bg-warning/10 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-warning-foreground">
                Item de origem
              </p>
              <p className="mt-1 font-semibold text-foreground">
                Item {origem.itemNumero} — {origem.descricao}
              </p>
            </div>
          )}

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
              <Label className="text-base">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusAnomalia)}>
                <SelectTrigger className="mt-1.5 h-12 w-full text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS.map((s) => (
                    <SelectItem key={s} value={s} className="text-base">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {ehManual && (
              <div>
                <Label className="text-base">Equipe</Label>
                <div className="mt-1.5 flex h-12 items-center rounded-md border border-input bg-muted px-3 text-base font-semibold text-foreground">
                  {equipeFixa ?? "—"}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Definida pela sua conta. Não pode ser alterada aqui.
                </p>
              </div>
            )}

            {ehManual && (
              <div>
                <Label className="text-base">Turno</Label>
                <div className="mt-1.5 flex h-12 items-center rounded-md border border-input bg-muted px-3 text-base font-semibold text-foreground">
                  {turnoFixo ?? "—"}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Definido pela sua conta. Não pode ser alterado aqui.
                </p>
              </div>
            )}

            {ehManual && (
              <div className="md:col-span-2">
                <Label htmlFor="op-resp-manual" className="text-base">
                  Operador responsável
                </Label>
                <Input
                  id="op-resp-manual"
                  value={operadorRespManual}
                  onChange={(e) => {
                    setOperadorRespManual(e.target.value);
                    setErro("");
                  }}
                  placeholder="Digite o nome do operador responsável"
                  className="mt-1.5 h-12 text-base"
                  autoComplete="off"
                />
              </div>
            )}

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
            <h2 className="text-xl font-bold text-foreground">Anomalia registrada com sucesso</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isOnline && pendingCount === 0
                ? "Sincronizado com o servidor"
                : "Salvo no dispositivo. Será enviado automaticamente quando a conexão voltar."}
            </p>
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
