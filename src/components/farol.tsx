/**
 * O FAROL — tela cheia, logo depois do login.
 *
 * O gerente olhou a primeira demo e perguntou "cadê o farol?". Era um
 * quadro no meio da página, disputando espaço com cards. Aqui ele é a
 * primeira coisa, ocupa a largura toda e é a maior coisa da tela.
 */

import { cn } from "@/lib/utils";
import {
  CODIGO_MOMENTO,
  ETAPA_PDCA,
  DESCRICAO_ESTADO,
  ROTULO_ESTADO,
  percentualCumprimento,
  resumirFarol,
  type CelulaFarol,
  type EstadoFarol,
  type LinhaFarol,
} from "@/lib/farol/farol";
import { MOMENTOS_CHECKLIST } from "@/lib/checklist/types";
import { formatarDataBR } from "@/lib/operacao/data-operacional";

const CLASSE_CELULA: Record<EstadoFarol, string> = {
  nc: "bg-destructive text-destructive-foreground border-destructive",
  nr: "bg-destructive-soft text-destructive border-destructive/40 [background-image:repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(0,0,0,.06)_6px,rgba(0,0,0,.06)_12px)]",
  pendente_validacao: "bg-warning/25 text-warning-foreground border-warning/50",
  aguardando: "bg-primary-soft/60 text-primary border-primary/25 border-dashed",
  na: "bg-na-soft text-muted-foreground border-border",
  conforme: "bg-success-soft text-success border-success/40",
  sem_escopo: "bg-muted/40 text-muted-foreground/50 border-dashed border-border",
};

export function Farol({
  linhas,
  data,
  turno,
  onAbrirCelula,
}: {
  linhas: LinhaFarol[];
  data: string;
  turno?: string | null;
  onAbrirCelula?: (celula: CelulaFarol) => void;
}) {
  const resumo = resumirFarol(linhas);
  const cumprimento = percentualCumprimento(resumo);

  return (
    <section aria-label="Farol do checklist operacional">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-4xl font-black tracking-[0.15em] text-foreground md:text-5xl">
          FAROL
        </h2>
        <p className="text-sm text-muted-foreground md:text-base">
          Checklist Operacional · {formatarDataBR(data)}
          {turno ? ` · ${turno}` : ""}
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[760px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="border-b border-border bg-muted/40 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Máquina
              </th>
              {MOMENTOS_CHECKLIST.map((m, i) => (
                <th
                  key={m}
                  className="border-b border-border bg-muted/40 px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  <span className="text-base font-black text-foreground">
                    {CODIGO_MOMENTO[i]}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-semibold normal-case tracking-normal">
                    {m}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={linha.maquina.id}>
                <td className="border-b border-border px-4 py-3 align-middle">
                  <p
                    className={cn(
                      "text-base font-bold",
                      linha.maquina.ativa ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {linha.maquina.nome}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {linha.maquina.ativa ? linha.maquina.detalhe : "a implantar"}
                  </p>
                  {/* O passivo é da MÁQUINA, não do turno de hoje. Fica aqui,
                      na linha, e não dentro da célula do dia. */}
                  {linha.passivoTotal > 0 && (
                    <p className="mt-1.5 inline-block rounded-full bg-destructive-soft px-2 py-0.5 text-[11px] font-black text-destructive">
                      {linha.passivoTotal} de outros dias · mais antiga há{" "}
                      {linha.passivoIdadeMaxDias}d
                    </p>
                  )}
                </td>
                {linha.celulas.map((celula) => (
                  <td key={celula.momento} className="border-b border-border p-2">
                    <CelulaLampada celula={celula} onAbrir={onAbrirCelula} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <Legenda estado="conforme" />
        <Legenda estado="nc" />
        <Legenda estado="nr" />
        <Legenda estado="pendente_validacao" />
        <Legenda estado="aguardando" />
        <Legenda estado="na" />
      </div>

      <AcoesPdca linhas={linhas} />

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Não conformidades"
          valor={resumo.nc}
          tom={resumo.nc > 0 ? "ruim" : "bom"}
          nota="itens fora do padrão"
        />
        <Indicador
          rotulo="Não realizado"
          valor={resumo.nr}
          tom={resumo.nr > 0 ? "ruim" : "bom"}
          nota="checklist não preenchido"
        />
        <Indicador
          rotulo="Aguarda o líder"
          valor={resumo.pendenteValidacao}
          tom={resumo.pendenteValidacao > 0 ? "atencao" : "bom"}
          nota="validação pendente"
        />
        <Indicador
          rotulo="Cumprimento"
          valor={resumo.totalAvaliado === 0 ? "—" : `${cumprimento}%`}
          tom={
            resumo.totalAvaliado === 0
              ? "neutro"
              : cumprimento >= 90
                ? "bom"
                : cumprimento >= 70
                  ? "atencao"
                  : "ruim"
          }
          nota={
            resumo.totalAvaliado === 0
              ? `turno em andamento · ${resumo.aguardando} a vencer`
              : `${resumo.totalAvaliado - resumo.nr} de ${resumo.totalAvaliado} verificações`
          }
        />
      </div>
    </section>
  );
}

/**
 * O que o farol está pedindo, na linguagem do ciclo.
 *
 * Cada estado que exige ação aponta a letra do PDCA que está parada e quem
 * tem que agir. Sem isso o farol informa, mas não manda ninguém fazer nada.
 */
function AcoesPdca({ linhas }: { linhas: LinhaFarol[] }) {
  const pendencias = new Map<string, { letra: string; acao: string; qtd: number }>();
  for (const linha of linhas) {
    for (const c of linha.celulas) {
      const etapa = ETAPA_PDCA[c.estado];
      if (!etapa) continue;
      const atual = pendencias.get(c.estado) ?? { ...etapa, qtd: 0 };
      atual.qtd += 1;
      pendencias.set(c.estado, atual);
    }
  }

  // O passivo saiu da cor da célula, mas NÃO pode sair daqui. Se ele sumisse
  // desta lista, a tela voltaria a dizer "Ciclo em dia" com 55 validações
  // abertas há 102 dias — que é literalmente a mentira que este farol existe
  // para matar, só que por um caminho novo.
  const passivoTotal = linhas.reduce((s, l) => s + l.passivoTotal, 0);
  const passivoIdade = linhas.reduce((m, l) => Math.max(m, l.passivoIdadeMaxDias), 0);

  if (pendencias.size === 0 && passivoTotal === 0) {
    return (
      <div className="mt-4 rounded-xl border border-success/40 bg-success-soft px-4 py-3 text-sm font-semibold text-success">
        Ciclo em dia — nada exigindo ação agora.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {passivoTotal > 0 && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-destructive/40 bg-destructive-soft/50 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive text-base font-black text-destructive-foreground">
            D
          </span>
          <p className="text-sm font-semibold text-foreground">
            Passivo de dias anteriores continua aberto — a mais antiga há {passivoIdade}{" "}
            dias. A execução de hoje não apaga isto.
          </p>
          <span className="ml-auto rounded-full bg-destructive px-2.5 py-0.5 text-xs font-bold text-destructive-foreground">
            {passivoTotal}
          </span>
        </div>
      )}
      {[...pendencias.values()]
        .sort((a, b) => b.qtd - a.qtd)
        .map((p) => (
          <div
            key={p.acao}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-black text-primary-foreground">
              {p.letra}
            </span>
            <p className="text-sm font-semibold text-foreground">{p.acao}</p>
            <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-foreground">
              {p.qtd}
            </span>
          </div>
        ))}
    </div>
  );
}

function CelulaLampada({
  celula,
  onAbrir,
}: {
  celula: CelulaFarol;
  onAbrir?: (c: CelulaFarol) => void;
}) {
  const clicavel = !!onAbrir && celula.estado !== "sem_escopo";
  const conteudo = (
    <>
      <span className="text-2xl font-black leading-none">
        {ROTULO_ESTADO[celula.estado]}
      </span>
      <span className="mt-1 text-[11px] font-bold leading-tight">
        {DESCRICAO_ESTADO[celula.estado]}
      </span>
      {celula.totalNc > 0 && (
        <span className="mt-0.5 text-[11px] font-semibold opacity-80">
          {celula.totalNc} {celula.totalNc === 1 ? "item" : "itens"}
        </span>
      )}
      {/* Passivo de outros dias. Fica FORA da cor de propósito: a cor é do
          turno de hoje, isto aqui é herança. A idade é o número que ganha a
          reunião — uma NC de 60 dias tem que gritar mais alto que a de ontem. */}
      {celula.passivoAnterior > 0 && (
        <span className="mt-1.5 rounded-full bg-background px-2 py-0.5 text-[10px] font-black text-destructive shadow-sm">
          +{celula.passivoAnterior} de antes · {celula.idadeMaxDias}d
        </span>
      )}
    </>
  );

  const classe = cn(
    "flex min-h-[84px] w-full flex-col items-center justify-center rounded-xl border-2 px-2 py-3 text-center transition-transform",
    CLASSE_CELULA[celula.estado],
    clicavel && "cursor-pointer hover:scale-[1.03]",
  );

  const rotulo =
    `${celula.maquinaId}, ${celula.momento}: ${DESCRICAO_ESTADO[celula.estado]}` +
    (celula.passivoAnterior > 0
      ? `. Mais ${celula.passivoAnterior} pendência(s) de dias anteriores, a mais antiga há ${celula.idadeMaxDias} dias.`
      : "");

  if (!clicavel) {
    return (
      <div className={classe} aria-label={rotulo}>
        {conteudo}
      </div>
    );
  }
  return (
    <button type="button" className={classe} aria-label={rotulo} onClick={() => onAbrir(celula)}>
      {conteudo}
    </button>
  );
}

function Legenda({ estado }: { estado: EstadoFarol }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      <i className={cn("inline-block h-4 w-7 rounded border-2", CLASSE_CELULA[estado])} />
      <b className="font-bold text-foreground">{ROTULO_ESTADO[estado]}</b>
      {DESCRICAO_ESTADO[estado]}
    </span>
  );
}

function Indicador({
  rotulo,
  valor,
  nota,
  tom,
}: {
  rotulo: string;
  valor: number | string;
  nota: string;
  tom: "bom" | "atencao" | "ruim" | "neutro";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          "mt-1 text-3xl font-black tracking-tight",
          tom === "ruim" && "text-destructive",
          tom === "atencao" && "text-warning-foreground",
          tom === "bom" && "text-success",
          tom === "neutro" && "text-muted-foreground",
        )}
      >
        {valor}
      </p>
      <p className="text-xs text-muted-foreground">{nota}</p>
    </div>
  );
}
