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
        <Legenda estado="na" />
      </div>

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
          valor={`${cumprimento}%`}
          tom={cumprimento >= 90 ? "bom" : cumprimento >= 70 ? "atencao" : "ruim"}
          nota={`${resumo.totalAvaliado - resumo.nr} de ${resumo.totalAvaliado} verificações`}
        />
      </div>
    </section>
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
    </>
  );

  const classe = cn(
    "flex min-h-[84px] w-full flex-col items-center justify-center rounded-xl border-2 px-2 py-3 text-center transition-transform",
    CLASSE_CELULA[celula.estado],
    clicavel && "cursor-pointer hover:scale-[1.03]",
  );

  const rotulo = `${celula.maquinaId}, ${celula.momento}: ${DESCRICAO_ESTADO[celula.estado]}`;

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
  tom: "bom" | "atencao" | "ruim";
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
        )}
      >
        {valor}
      </p>
      <p className="text-xs text-muted-foreground">{nota}</p>
    </div>
  );
}
