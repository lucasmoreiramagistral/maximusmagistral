/**
 * O FAROL — tela cheia, logo depois do login.
 *
 * O gerente olhou a primeira demo e perguntou "cadê o farol?". Era um
 * quadro no meio da página, disputando espaço com cards. Aqui ele é a
 * primeira coisa, ocupa a largura toda e é a maior coisa da tela.
 */

import { cn } from "@/lib/utils";
import {
  COLUNAS_FAROL,
  ETAPA_PDCA,
  DESCRICAO_ESTADO,
  ROTULO_ESTADO,
  percentualCumprimento,
  resumirFarol,
  type CelulaFarol,
  type EstadoFarol,
  type ItemNcFarol,
  type LinhaFarol,
} from "@/lib/farol/farol";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MOMENTOS_CHECKLIST } from "@/lib/checklist/types";
import { formatarDataBR } from "@/lib/operacao/data-operacional";
import { formatarDataHora } from "@/lib/checklist/format";

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
  modo = "turno",
}: {
  linhas: LinhaFarol[];
  data: string;
  turno?: string | null;
  onAbrirCelula?: (celula: CelulaFarol) => void;
  /** Ver EntradaFarol.modo. "estado" é a leitura do Coord/GI. */
  modo?: "turno" | "estado";
}) {
  const estadoGeral = modo === "estado";
  const [verNc, setVerNc] = useState(false);
  const resumo = resumirFarol(linhas);
  const itensNc: ItemNcFarol[] = linhas.flatMap((l) => l.celulas.flatMap((c) => c.itensNc));
  const cumprimento = percentualCumprimento(resumo);
  const passivoTotal = linhas.reduce((s, l) => s + l.passivoTotal, 0);
  const passivoIdade = linhas.reduce((m, l) => Math.max(m, l.passivoIdadeMaxDias), 0);

  return (
    <section aria-label="Farol do checklist operacional">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-4xl font-black tracking-[0.15em] text-foreground md:text-5xl">FAROL</h2>
        <p className="text-sm text-muted-foreground md:text-base">
          {estadoGeral ? (
            <>
              Situação da linha <b className="text-foreground">agora</b> · o que está em aberto, de
              qualquer data
            </>
          ) : (
            <>
              Checklist Operacional · {formatarDataBR(data)}
              {turno ? ` · ${turno}` : ""}
            </>
          )}
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        {/* Sem largura mínima no tablet: com 5 rotinas a tabela pedia 760px e
            o tablet em pé oferece 687, então o farol rolava de lado e as duas
            colunas novas (Limpeza e PTP) ficavam escondidas — exatamente as
            que o gerente precisa ver. Da largura de notebook para cima ela
            volta a ter folga. */}
        <table className="w-full border-separate border-spacing-0 lg:min-w-[880px]">
          <thead>
            <tr>
              <th className="border-b border-border bg-muted/40 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Máquina
              </th>
              {COLUNAS_FAROL.map((col) => (
                <th
                  key={col.id}
                  className={cn(
                    "border-b border-border bg-muted/40 px-1 py-2 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground lg:px-3 lg:py-3",
                    // Separa visualmente o FM09 das outras rotinas: são
                    // formulários diferentes, não momentos do mesmo checklist.
                    col.tipo !== "checklist" && "border-l-2 border-l-border",
                  )}
                >
                  <span className="text-base font-black text-foreground">{col.codigo}</span>
                  {/* O nome longo some no tablet. A letra basta — ela é a
                      mesma do papel do gerente — e a legenda fica logo abaixo. */}
                  <span className="mt-0.5 hidden text-[11px] font-semibold normal-case tracking-normal lg:block">
                    {col.titulo}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={linha.maquina.id}>
                <td className="border-b border-border px-2 py-3 align-middle lg:px-4">
                  <p
                    className={cn(
                      "text-sm font-bold leading-tight lg:text-base",
                      linha.maquina.ativa ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {linha.maquina.nome}
                  </p>
                  {/* "Zegla 50V" é informação de catálogo: cede espaço no
                      tablet para as colunas, que são o que se olha. */}
                  <p className="hidden text-xs text-muted-foreground lg:block">
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
                  <td
                    key={celula.coluna.id}
                    className={cn(
                      "border-b border-border p-1 lg:p-2",
                      celula.coluna.tipo !== "checklist" && "border-l-2 border-l-border",
                    )}
                  >
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

      {/* Estes números são do DIA mostrado. O passivo entra como cartão
          próprio porque, sem ele, a tela exibia "Aguarda o líder: 0" logo
          acima de uma fila com 55 validações abertas — verdade pela metade
          lida como mentira inteira. */}
      <p className="mt-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {estadoGeral ? "Em aberto agora" : `No dia ${formatarDataBR(data)}`}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Indicador
          rotulo="Não conformidades"
          valor={resumo.ncItens}
          tom={resumo.ncItens > 0 ? "ruim" : "bom"}
          nota={
            resumo.ncItens > 0
              ? `${resumo.ncItens === 1 ? "item fora do padrão" : "itens fora do padrão"} em ${resumo.nc} ${resumo.nc === 1 ? "verificação" : "verificações"} · toque para ver`
              : "itens fora do padrão"
          }
          onClick={itensNc.length > 0 ? () => setVerNc(true) : undefined}
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
        {/* No modo estado não existe "não realizado" — a conta daria 100%
            sempre, o que seria falso conforto. Quem mede cumprimento é o
            painel de série do Sup/Coord, com denominador de verdade. */}
        {!estadoGeral && (
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
        )}
        <Indicador
          rotulo={estadoGeral ? "Mais antiga em aberto" : "Passivo aberto"}
          valor={estadoGeral ? (passivoIdade > 0 ? `${passivoIdade}d` : "—") : passivoTotal}
          tom={passivoTotal > 0 ? "ruim" : "bom"}
          nota={
            passivoTotal > 0
              ? estadoGeral
                ? `${passivoTotal} itens vindos de outros dias`
                : `de outros dias · mais antiga há ${passivoIdade}d`
              : "nada vindo de trás"
          }
        />
      </div>

      <DetalheNcDialog
        aberto={verNc}
        onFechar={() => setVerNc(false)}
        data={data}
        itens={itensNc}
      />
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
            Passivo de dias anteriores continua aberto — a mais antiga há {passivoIdade} dias. A
            execução de hoje não apaga isto.
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
      <span className="text-xl font-black leading-none lg:text-2xl">
        {ROTULO_ESTADO[celula.estado]}
      </span>
      <span className="mt-1 text-[10px] font-bold leading-tight lg:text-[11px]">
        {DESCRICAO_ESTADO[celula.estado]}
      </span>
      {celula.detalhe && (
        <span className="mt-0.5 text-[10px] font-semibold leading-tight opacity-90 lg:text-[11px]">
          {celula.detalhe}
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
    "flex min-h-[84px] w-full flex-col items-center justify-center rounded-xl border-2 px-1 py-3 text-center transition-transform lg:px-2",
    CLASSE_CELULA[celula.estado],
    clicavel && "cursor-pointer hover:scale-[1.03]",
  );

  const rotulo =
    `${celula.maquinaId}, ${celula.coluna.titulo}: ${DESCRICAO_ESTADO[celula.estado]}` +
    (celula.detalhe ? `, ${celula.detalhe}` : "") +
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

function DetalheNcDialog({
  aberto,
  onFechar,
  data,
  itens,
}: {
  aberto: boolean;
  onFechar: () => void;
  data: string;
  itens: ItemNcFarol[];
}) {
  return (
    <Dialog open={aberto} onOpenChange={(o) => (!o ? onFechar() : undefined)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {itens.length} {itens.length === 1 ? "item" : "itens"} fora do padrão
          </DialogTitle>
          <DialogDescription>No dia {formatarDataBR(data)}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {itens.map((i, idx) => (
            <li
              key={`${i.rotina}-${i.titulo}-${idx}`}
              className="rounded-xl border border-destructive/30 bg-destructive-soft/40 p-3"
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-destructive">
                {i.rotina}
              </p>
              <p className="mt-1 text-sm font-bold text-foreground">{i.titulo}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {i.maquinaId} · {i.turno}
                {i.horario
                  ? ` · ${i.horario.includes("T") ? formatarDataHora(i.horario) : i.horario}`
                  : ""}
              </p>
              {i.observacao && (
                <p className="mt-2 rounded-lg bg-card p-2 text-xs text-foreground">
                  {i.observacao}
                </p>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function Indicador({
  rotulo,
  valor,
  nota,
  tom,
  onClick,
}: {
  rotulo: string;
  valor: number | string;
  nota: string;
  tom: "bom" | "atencao" | "ruim" | "neutro";
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border bg-card p-4 text-left shadow-sm",
        onClick && "transition-all hover:border-destructive/50 hover:shadow-md",
      )}
    >
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
    </Tag>
  );
}
