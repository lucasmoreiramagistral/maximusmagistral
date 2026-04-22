import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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

  // Snapshot do status no momento em que a tela carrega.
  // O bloco "Motivo da edição" só deve aparecer se a janela JÁ ESTAVA
  // concluída quando o operador abriu a tela — não logo após concluir.
  const [jaConcluidaSnapshot, setJaConcluidaSnapshot] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    if (!janelaBase) return;
    setItens(janelaBase.itens);
    setNaoRodou(janelaBase.statusJanela === "nao_rodou");
    setObservacao(janelaBase.observacao ?? "");
    setAssinatura(null); // sempre exigir nova assinatura ao concluir
    if (jaConcluidaSnapshot === null) {
      setJaConcluidaSnapshot(
        janelaBase.statusJanela !== "pendente" &&
          janelaBase.statusJanela !== "rascunho",
      );
    }
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
  // Snapshot fixo no mount — usado para decidir se exigimos motivo de edição.
  const exigeMotivoEdicao = jaConcluidaSnapshot === true;

  /**
   * Define a quantidade de marcações de um item (0..6).
   * Cada marcação representa 2 ocorrências da anomalia, conforme padrão
   * oficial da folha física do PTP (6 quadradinhos por item, valendo 2 cada).
   */
  const setMarcacoes = (codigo: string, novaQtd: number) => {
    if (naoRodou) return;
    const qtd = Math.max(0, Math.min(6, novaQtd));
    setItens((prev) =>
      recalcularStatusItens(
        prev.map((i) => (i.codigo === codigo ? { ...i, quantidade: qtd } : i)),
      ),
    );
  };

  /**
   * Toggle do quadradinho na posição `pos` (1..6).
   * - Se a posição já estava marcada, desmarca todas dela em diante.
   * - Se ainda não estava, marca todas até essa posição (preenchimento sequencial).
   * Esse comportamento espelha como o operador preencheria a folha de papel.
   */
  const toggleQuadradinho = (codigo: string, pos: number) => {
    if (naoRodou) return;
    const item = itens.find((i) => i.codigo === codigo);
    if (!item) return;
    const atual = item.quantidade || 0;
    const nova = atual >= pos ? pos - 1 : pos;
    setMarcacoes(codigo, nova);
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
      // operadorLogin = login da CONTA logada (representa a equipe).
      // operadorNome = "Operador" (genérico) — qualquer um da equipe pode estar
      // operando; o líder logado fica registrado em ultimaEdicaoPorLogin/Nome
      // e nas tabelas de auditoria.
      operadorLogin: concluir ? usuario.usuario : janelaBase.operadorLogin ?? usuario.usuario,
      operadorNome: concluir ? "Operador" : janelaBase.operadorNome ?? "Operador",
      operadorUserId: usuario.userId ?? janelaBase.operadorUserId ?? null,
      assinaturaOperador:
        concluir && assinatura
          ? { dataUrl: assinatura, nome: "Operador", assinadoEm: agora }
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
    if (exigeMotivoEdicao && !motivoEdicao.trim()) {
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
        {exigeMotivoEdicao && (
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

        {/* Aviso de regra */}
        <div className="mb-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-semibold text-foreground">
            Cada marcação na folha equivale a 2 ocorrências da anomalia.
          </p>
          <p className="text-xs text-muted-foreground">
            Toque em um quadradinho para marcar/desmarcar. Limite de 6 marcações por item (= 12 ocorrências).
          </p>
        </div>

        {/* Itens — interface fiel ao papel: 6 quadradinhos clicáveis por item */}
        <div className={`space-y-3 ${naoRodou ? "opacity-50" : ""}`}>
          {itens.map((it) => {
            const marcacoes = it.quantidade || 0;
            const ocorrencias = marcacoes * 2;
            return (
              <div
                key={it.codigo}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <p className="text-sm font-bold text-foreground">{it.nome}</p>
                  <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {marcacoes}/6 · {ocorrencias} ocorr.
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {[1, 2, 3, 4, 5, 6].map((pos) => {
                    const ativo = marcacoes >= pos;
                    return (
                      <button
                        key={pos}
                        type="button"
                        aria-label={`Marcação ${pos} de ${it.nome}`}
                        aria-pressed={ativo}
                        onClick={() => toggleQuadradinho(it.codigo, pos)}
                        disabled={naoRodou}
                        className={`flex h-12 w-12 items-center justify-center rounded-md border-2 text-base font-bold transition-all ${
                          ativo
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border bg-background text-muted-foreground hover:border-primary/50"
                        } ${naoRodou ? "cursor-not-allowed" : "active:scale-95"}`}
                      >
                        {ativo ? "✓" : "2"}
                      </button>
                    );
                  })}
                </div>

                <p className="mt-2 text-[11px] text-muted-foreground">
                  Cada marcação = 2 ocorrências · Equivale a{" "}
                  <strong className="text-foreground">{ocorrencias}</strong>{" "}
                  ocorrência{ocorrencias === 1 ? "" : "s"}
                </p>
              </div>
            );
          })}
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

        {/* Motivo da edição (só se já estava concluída quando a tela carregou) */}
        {exigeMotivoEdicao && (
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

        {/* Assinatura — sempre "Operador" (genérico). Qualquer um da equipe
            pode estar operando, não necessariamente o líder logado. */}
        <div className="mt-5">
          <SignaturePad
            value={assinatura}
            onChange={setAssinatura}
            label="Assinatura — Operador"
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
