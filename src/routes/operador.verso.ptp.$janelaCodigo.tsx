import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TelaCarregando } from "@/components/tela-carregando";
import { SignaturePad } from "@/components/signature-pad";
import { PtpItemContador } from "@/components/ptp-item-contador";
import { useGuard } from "@/hooks/use-guard";
import { usePtpJanelas } from "@/hooks/use-ptp-janelas";
import {
  buildFolhaDiaKey,
  formatarDataBR,
} from "@/lib/operacao/data-operacional";
import { useTurnoAtivoDoDia } from "@/lib/operacao/turno-ativo";
import {
  VERSO_CONTEXTO_FIXO,
  criarAnaliseAnguloVazia,
} from "@/lib/verso/constants";
import { deriveStatusJanela, recalcularStatusItens } from "@/lib/verso/format";
import type {
  PtpAnaliseAngulo,
  PtpItem,
  PtpJanela,
  PtpLancamento,
} from "@/lib/verso/types";
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
  const [analiseAngulo, setAnaliseAngulo] = useState<PtpAnaliseAngulo>(
    criarAnaliseAnguloVazia(),
  );
  const [naoRodou, setNaoRodou] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [motivoEdicao, setMotivoEdicao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [jaConcluidaSnapshot, setJaConcluidaSnapshot] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    if (!janelaBase) return;
    setItens(janelaBase.itens);
    setAnaliseAngulo(janelaBase.analiseAngulo ?? criarAnaliseAnguloVazia());
    setNaoRodou(janelaBase.statusJanela === "nao_rodou");
    setObservacao(janelaBase.observacao ?? "");
    setAssinatura(null);
    if (jaConcluidaSnapshot === null) {
      setJaConcluidaSnapshot(
        janelaBase.statusJanela !== "pendente" &&
          janelaBase.statusJanela !== "rascunho",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [janelaBase?.id, janelaBase?.updatedAt]);

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
  const exigeMotivoEdicao = jaConcluidaSnapshot === true;

  /** Adiciona quantidade real ao total acumulado de um item, registrando histórico. */
  const adicionarOcorrencia = (codigo: string, quantidade: number) => {
    if (naoRodou) return;
    if (quantidade <= 0) return;
    const lanc: PtpLancamento = {
      quantidade,
      horario: new Date().toISOString(),
      tipo: "lancamento",
      operadorLogin: usuario.usuario,
      operadorNome: usuario.nome,
      operadorUserId: usuario.userId ?? null,
    };
    setItens((prev) =>
      recalcularStatusItens(
        prev.map((i) =>
          i.codigo === codigo
            ? {
                ...i,
                quantidade: (i.quantidade || 0) + quantidade,
                historico: [...(i.historico ?? []), lanc],
              }
            : i,
        ),
      ),
    );
  };

  /** Remove o último lançamento POSITIVO do histórico (só desfaz o que foi adicionado). */
  const desfazerUltimo = (codigo: string) => {
    if (naoRodou) return;
    setItens((prev) =>
      recalcularStatusItens(
        prev.map((i) => {
          if (i.codigo !== codigo) return i;
          const hist = [...(i.historico ?? [])];
          // procura o último com quantidade > 0 (lancamento normal)
          for (let idx = hist.length - 1; idx >= 0; idx--) {
            if (hist[idx].quantidade > 0) {
              const removido = hist.splice(idx, 1)[0];
              return {
                ...i,
                quantidade: Math.max(0, (i.quantidade || 0) - removido.quantidade),
                historico: hist,
              };
            }
          }
          return i;
        }),
      ),
    );
  };

  /** Zera o total registrando uma correção negativa (preserva histórico). */
  const zerarTotal = (codigo: string) => {
    if (naoRodou) return;
    setItens((prev) =>
      recalcularStatusItens(
        prev.map((i) => {
          if (i.codigo !== codigo) return i;
          const total = i.quantidade || 0;
          if (total === 0) return i;
          const correcao: PtpLancamento = {
            quantidade: -total,
            horario: new Date().toISOString(),
            tipo: "correcao_zerar",
            motivo: "Correção do operador (zerar total)",
            operadorLogin: usuario.usuario,
            operadorNome: usuario.nome,
            operadorUserId: usuario.userId ?? null,
          };
          return {
            ...i,
            quantidade: 0,
            historico: [...(i.historico ?? []), correcao],
          };
        }),
      ),
    );
  };

  const itemPodeDesfazer = (it: PtpItem): boolean =>
    (it.historico ?? []).some((l) => l.quantidade > 0);

  const toggleNaoRodou = (v: boolean) => {
    setNaoRodou(v);
    if (v) {
      // não apaga histórico, só zera quantidade visível e marca correção em itens com total
      setItens((prev) =>
        prev.map((i) => {
          if ((i.quantidade || 0) === 0) {
            return { ...i, quantidade: 0, status: "sem_ocorrencia" };
          }
          const correcao: PtpLancamento = {
            quantidade: -i.quantidade,
            horario: new Date().toISOString(),
            tipo: "correcao_zerar",
            motivo: "Linha não rodou nesta janela",
            operadorLogin: usuario.usuario,
            operadorNome: usuario.nome,
            operadorUserId: usuario.userId ?? null,
          };
          return {
            ...i,
            quantidade: 0,
            status: "sem_ocorrencia",
            historico: [...(i.historico ?? []), correcao],
          };
        }),
      );
      setAnaliseAngulo(criarAnaliseAnguloVazia());
    }
  };

  const toggleVerificacaoAngulo = (qual: "v1" | "v2", checked: boolean) => {
    if (naoRodou) return;
    const agora = new Date().toISOString();
    setAnaliseAngulo((prev) => ({
      ...prev,
      [`${qual}Realizada`]: checked,
      [`${qual}Em`]: checked ? agora : null,
      [`${qual}PorLogin`]: checked ? usuario.usuario : null,
      [`${qual}PorNome`]: checked ? usuario.nome : null,
      [`${qual}PorUserId`]: checked ? usuario.userId ?? null : null,
    }));
  };

  const montarPayload = (concluir: boolean): PtpJanela => {
    const agora = new Date().toISOString();
    // Status: NÃO conta análise de ângulo. Só os 5 defeitos.
    const status = concluir ? deriveStatusJanela(itens, naoRodou) : "rascunho";
    // Nome real do operador: usuario.userId é o auth.uid()/profiles.id e
    // usuario.nome vem do profile carregado pelo login próprio.
    const nomeOperador = (usuario.nome || usuario.usuario || "").trim();
    return {
      ...janelaBase,
      itens,
      analiseAngulo,
      observacao: observacao.trim() || null,
      statusJanela: status,
      operadorLogin: concluir ? usuario.usuario : janelaBase.operadorLogin ?? usuario.usuario,
      operadorNome: concluir ? nomeOperador : janelaBase.operadorNome ?? nomeOperador,
      operadorUserId: usuario.userId ?? janelaBase.operadorUserId ?? null,
      assinaturaOperador:
        concluir && assinatura
          ? { dataUrl: assinatura, nome: nomeOperador, assinadoEm: agora }
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

        {/* Aviso de regra nova */}
        <div className="mb-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-semibold text-foreground">
            Informe a quantidade real quando houver ocorrência.
          </p>
          <p className="text-xs text-muted-foreground">
            Use os botões para ajustar a quantidade e clique em "Adicionar ao
            total" para registrar. Pressione e segure para aumentar mais rápido.
          </p>
        </div>

        {/* Itens — contador acumulativo */}
        <div className={`space-y-3 ${naoRodou ? "opacity-50" : ""}`}>
          {itens.map((it) => (
            <PtpItemContador
              key={it.codigo}
              nome={it.nome}
              totalAcumulado={it.quantidade || 0}
              disabled={naoRodou}
              onAdicionar={(q) => adicionarOcorrencia(it.codigo, q)}
              onDesfazerUltimo={() => desfazerUltimo(it.codigo)}
              onZerarTotal={() => zerarTotal(it.codigo)}
              podeDesfazer={itemPodeDesfazer(it)}
            />
          ))}
        </div>

        {/* Análise de ângulo */}
        <div
          className={`mt-4 rounded-xl border-2 border-accent/40 bg-accent/5 p-4 ${
            naoRodou ? "opacity-50" : ""
          }`}
        >
          <p className="text-sm font-bold text-foreground">ANÁLISE DE ÂNGULO</p>
          <p className="mt-1 text-xs text-muted-foreground">
            2 verificações por janela (cada uma representa 30 min). Não conta
            como ocorrência — é verificação de aderência.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(["v1", "v2"] as const).map((qual, idx) => {
              const realizada =
                qual === "v1" ? analiseAngulo.v1Realizada : analiseAngulo.v2Realizada;
              const em = qual === "v1" ? analiseAngulo.v1Em : analiseAngulo.v2Em;
              const por =
                qual === "v1"
                  ? analiseAngulo.v1PorNome
                  : analiseAngulo.v2PorNome;
              return (
                <label
                  key={qual}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                    realizada
                      ? "border-accent bg-accent/10"
                      : "border-border bg-background"
                  } ${naoRodou ? "cursor-not-allowed" : ""}`}
                >
                  <Checkbox
                    checked={realizada}
                    onCheckedChange={(c) =>
                      toggleVerificacaoAngulo(qual, c === true)
                    }
                    disabled={naoRodou}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      Verificação {idx + 1} — 30 min
                    </p>
                    {realizada && em && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatarDataHora(em)}
                        {por ? ` · ${por}` : ""}
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
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

        {/* Motivo da edição */}
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

        {/* Assinatura */}
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
