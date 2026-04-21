import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TelaCarregando } from "@/components/tela-carregando";
import { SignaturePad } from "@/components/signature-pad";
import { useGuard } from "@/hooks/use-guard";
import { usePtpJanelas } from "@/hooks/use-ptp-janelas";
import {
  buildFolhaDiaKey,
  calcularDataOperacional,
  formatarDataBR,
} from "@/lib/operacao/data-operacional";
import { VERSO_CONTEXTO_FIXO } from "@/lib/verso/constants";
import { deriveStatusJanela, recalcularStatusItens } from "@/lib/verso/format";
import type { PtpItem, PtpJanela } from "@/lib/verso/types";
import { formatarDataHora } from "@/lib/checklist/format";
import { toast } from "sonner";

export const Route = createFileRoute("/operador/verso/ptp/$janelaCodigo")({
  head: () => ({ meta: [{ title: "Janela PTP — Verso da folha" }] }),
  component: PtpJanelaDetalhe,
});

function PtpJanelaDetalhe() {
  const { janelaCodigo } = Route.useParams();
  const { usuario, loading } = useGuard("operador");
  const navigate = useNavigate();

  const equipe = usuario?.equipePadrao ?? null;
  const turno = usuario?.turnoPadrao ?? null;
  const data = calcularDataOperacional(equipe, turno);
  const folhaDiaKey = buildFolhaDiaKey(
    data,
    VERSO_CONTEXTO_FIXO.linha,
    VERSO_CONTEXTO_FIXO.maquina,
  );

  const { janelas, salvarJanela } = usePtpJanelas(folhaDiaKey, data);
  const janelaBase = useMemo(
    () => janelas.find((j) => j.janelaCodigo === janelaCodigo),
    [janelas, janelaCodigo],
  );

  const [itens, setItens] = useState<PtpItem[]>([]);
  const [naoRodou, setNaoRodou] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [motivoEdicao, setMotivoEdicao] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!janelaBase) return;
    setItens(janelaBase.itens);
    setNaoRodou(janelaBase.statusJanela === "nao_rodou");
    setObservacao(janelaBase.observacao ?? "");
    setAssinatura(null); // sempre exigir nova assinatura ao concluir
  }, [janelaBase?.id, janelaBase?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !usuario) return <TelaCarregando />;
  if (!janelaBase) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader
          titulo={`Janela ${janelaCodigo}`}
          subtitulo={`Folha do dia ${formatarDataBR(data)}`}
          voltarPara="/operador/verso/ptp"
        />
        <main className="mx-auto w-full max-w-[900px] px-4 py-6 md:px-8 md:py-10">
          <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Janela não encontrada para esta folha operacional.
          </div>
        </main>
      </div>
    );
  }

  const jaConcluida =
    janelaBase.statusJanela !== "pendente" && janelaBase.statusJanela !== "rascunho";

  const ajustar = (codigo: string, delta: number) => {
    if (naoRodou) return;
    setItens((prev) =>
      recalcularStatusItens(
        prev.map((i) =>
          i.codigo === codigo
            ? { ...i, quantidade: Math.max(0, (i.quantidade || 0) + delta) }
            : i,
        ),
      ),
    );
  };

  const toggleNaoRodou = (v: boolean) => {
    setNaoRodou(v);
    if (v) {
      setItens((prev) => prev.map((i) => ({ ...i, quantidade: 0, status: "sem_ocorrencia" })));
    }
  };

  const montarPayload = (concluir: boolean): PtpJanela => {
    const agora = new Date().toISOString();
    const status = concluir ? deriveStatusJanela(itens, naoRodou) : "rascunho";
    return {
      ...janelaBase,
      itens,
      observacao: observacao.trim() || null,
      statusJanela: status,
      operadorLogin: concluir ? usuario.usuario : janelaBase.operadorLogin ?? usuario.usuario,
      operadorNome: concluir ? usuario.nome : janelaBase.operadorNome ?? usuario.nome,
      operadorUserId: usuario.userId ?? janelaBase.operadorUserId ?? null,
      assinaturaOperador:
        concluir && assinatura
          ? { dataUrl: assinatura, nome: usuario.nome, assinadoEm: agora }
          : janelaBase.assinaturaOperador ?? null,
      assinadoEm: concluir ? agora : janelaBase.assinadoEm ?? null,
      ultimaEdicaoPorLogin: usuario.usuario,
      ultimaEdicaoPorNome: usuario.nome,
    };
  };

  const handleSalvarRascunho = async () => {
    setSalvando(true);
    try {
      const payload = montarPayload(false);
      await salvarJanela(payload, {
        anterior: jaConcluida ? janelaBase : undefined,
        editadoPorLogin: usuario.usuario,
        editadoPorNome: usuario.nome,
        motivoEdicao: motivoEdicao.trim() || undefined,
      });
      toast.success("Rascunho salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const handleConcluir = async () => {
    if (!assinatura) {
      toast.error("Assine para concluir esta janela.");
      return;
    }
    if (jaConcluida && !motivoEdicao.trim()) {
      toast.error("Informe o motivo da edição.");
      return;
    }
    setSalvando(true);
    try {
      const payload = montarPayload(true);
      await salvarJanela(payload, {
        anterior: jaConcluida ? janelaBase : undefined,
        editadoPorLogin: usuario.usuario,
        editadoPorNome: usuario.nome,
        motivoEdicao: motivoEdicao.trim() || undefined,
      });
      toast.success("Janela concluída.");
      navigate({ to: "/operador/verso/ptp" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao concluir.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        titulo={`Janela ${janelaBase.janelaCodigo} — ${janelaBase.janelaInicio} às ${janelaBase.janelaFim}`}
        subtitulo={`Folha do dia ${formatarDataBR(data)}`}
        voltarPara="/operador/verso/ptp"
      />
      <main className="mx-auto w-full max-w-[900px] px-4 py-6 md:px-8 md:py-10">
        {jaConcluida && (
          <div className="mb-4 rounded-xl border-2 border-warning/40 bg-warning/10 p-4 text-sm">
            <p className="font-semibold text-foreground">
              Esta janela já estava concluída por {janelaBase.operadorNome ?? "—"}.
            </p>
            <p className="mt-1 text-muted-foreground">
              Para alterar, informe o motivo da edição e assine novamente.
            </p>
          </div>
        )}

        {/* Não rodou */}
        <div className="mb-5 flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <p className="text-base font-bold text-foreground">Linha não rodou nesta janela</p>
            <p className="text-xs text-muted-foreground">
              Marque se a linha esteve parada no período inteiro.
            </p>
          </div>
          <Switch checked={naoRodou} onCheckedChange={toggleNaoRodou} />
        </div>

        {/* Itens */}
        <div className={`space-y-3 ${naoRodou ? "opacity-50" : ""}`}>
          {itens.map((it) => (
            <div
              key={it.codigo}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">{it.nome}</p>
                <p className="text-xs text-muted-foreground">
                  Marcar a cada 2 ocorrências, conforme padrão da folha.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12"
                  onClick={() => ajustar(it.codigo, -1)}
                  disabled={naoRodou || it.quantidade === 0}
                >
                  <Minus className="h-5 w-5" />
                </Button>
                <span className="w-10 text-center text-2xl font-bold tabular-nums">
                  {it.quantidade}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12"
                  onClick={() => ajustar(it.codigo, +1)}
                  disabled={naoRodou}
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Observação */}
        <div className="mt-5">
          <Label htmlFor="obs" className="text-base">
            Observação (opcional)
          </Label>
          <Textarea
            id="obs"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Informações adicionais desta janela..."
            className="mt-1.5"
            rows={3}
          />
        </div>

        {/* Última assinatura */}
        {janelaBase.assinaturaOperador && (
          <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
            <p>
              Última assinatura: <strong>{janelaBase.assinaturaOperador.nome}</strong> em{" "}
              {formatarDataHora(janelaBase.assinaturaOperador.assinadoEm)}
            </p>
          </div>
        )}

        {/* Motivo da edição (só se já estava concluída) */}
        {jaConcluida && (
          <div className="mt-5">
            <Label htmlFor="motivo" className="text-base">
              Motivo da edição *
            </Label>
            <Textarea
              id="motivo"
              value={motivoEdicao}
              onChange={(e) => setMotivoEdicao(e.target.value)}
              placeholder="Por que esta janela está sendo alterada?"
              className="mt-1.5"
              rows={2}
            />
          </div>
        )}

        {/* Assinatura */}
        <div className="mt-5">
          <SignaturePad
            value={assinatura}
            onChange={setAssinatura}
            label={`Assinatura — ${usuario.nome}`}
            ajuda="Obrigatória para concluir a janela."
          />
        </div>

        {/* Ações */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={handleSalvarRascunho} disabled={salvando}>
            Salvar rascunho
          </Button>
          <Button onClick={handleConcluir} disabled={salvando}>
            Concluir janela
          </Button>
        </div>
      </main>
    </div>
  );
}
