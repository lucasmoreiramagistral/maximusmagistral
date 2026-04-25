import ExcelJS from "exceljs";
import { ITENS_CHECKLIST } from "./itens";
import type {
  Anomalia,
  Checklist,
  FolhaChecklistDia,
  RespostaItem,
  Turno,
} from "./types";
import type { LimpezaTurno, PtpJanela } from "@/lib/verso/types";
// Template Excel FM09 embutido como base64 no bundle JS.
// Garante que funcione em QUALQUER ambiente (preview, .lovable.app, custom domain)
// sem depender de fetch HTTP nem do asset ser servido estaticamente pelo host.
import { TEMPLATE_BASE64 } from "@/assets/templates/checklist-template";
import { gerarVersoWorksheet } from "@/lib/verso/excel-export";
import {
  fetchLimpezaTurnos,
  fetchPtpJanelas,
} from "@/lib/verso/supabase-storage";
import {
  fetchObservacoesVerso,
  formatarLinhaObservacao,
  type ObservacaoVerso,
} from "@/lib/verso/observacoes";
import { janelasPtpDoTurno, LIMPEZA_ITENS_DEF } from "@/lib/verso/constants";
import { buildFolhaDiaKey } from "@/lib/operacao/data-operacional";
import { colunaPosicionalDoTurno } from "@/lib/operacao/escalas";

const SHEET_NAME = "ENCHEDORA 3";

/** Mapa item.numero → linha na planilha */
const LINHA_POR_ITEM: Record<number, number> = {
  1: 6, 2: 7, 3: 8, 4: 9, 5: 10, 6: 11,
  7: 13, 8: 14, 9: 15, 10: 16, 11: 17, 12: 18,
  13: 20, 14: 21, 15: 22, 16: 23, 17: 24, 18: 25, 19: 26, 20: 27,
};

interface MapaTurno {
  /** Coluna do valor/status (ex.: "D"). Usada para itens numéricos. */
  colValor: string;
  /** Coluna do horário (ex.: "E"). Para itens "simples"/"texto", o status (C/NC/NA)
   *  no template oficial fica nessa mesma coluna (a coluna de valor fica vazia
   *  para esses tipos no formulário em papel — só horário é registrado).
   *  Mas precisamos registrar C/NC/NA em algum lugar visível, então:
   *  - tipo numerico: colValor recebe "X uni" e colHora recebe HH:mm
   *  - tipo simples/texto: colValor recebe "C"/"NC"/"NA" e colHora recebe HH:mm
   */
  colHora: string;
  /** Coordenada (linha 28) do bloco "ASSINATURA OPERADOR" do turno. */
  cellAssinatura: string;
  /** Coordenada (linha 29) do bloco "ASSINATURA LÍDER" do turno. */
  cellAssinaturaLider: string;
}

/**
 * Mapa POSICIONAL do Excel da frente — 3 colunas físicas oficiais.
 * Os 6 turnos são distribuídos pela `colunaPosicional` de cada escala:
 *   coluna 1 (D/E, D28/D29) → 12x36 Dia, 1º Turno, Comercial
 *   coluna 2 (F/G, F28/F29) → 12x36 Noite, 2º Turno
 *   coluna 3 (H/I, H28/H29) → 3º Turno
 */
const MAPA_TURNOS: Record<1 | 2 | 3, MapaTurno> = {
  1: { colValor: "D", colHora: "E", cellAssinatura: "D28", cellAssinaturaLider: "D29" },
  2: { colValor: "F", colHora: "G", cellAssinatura: "F28", cellAssinaturaLider: "F29" },
  3: { colValor: "H", colHora: "I", cellAssinatura: "H28", cellAssinaturaLider: "H29" },
};

/** Resolve o mapa do Excel a partir do turno via coluna posicional. */
function mapaDoTurno(turno: Turno): MapaTurno {
  const col = colunaPosicionalDoTurno(turno) ?? 1;
  return MAPA_TURNOS[col];
}

const ABREV_RESPOSTA: Record<string, string> = {
  Conforme: "C",
  "Não conforme": "NC",
  "Não aplicável": "NA",
};

function formatarDataBR(iso: string): string {
  try {
    const d = iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return iso;
  }
}

function formatarHoraBR(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
}

function sanitizarArquivo(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_.]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function carregarTemplate(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(base64ToArrayBuffer(TEMPLATE_BASE64));
  return wb;
}

function preencherRespostasChecklist(
  ws: ExcelJS.Worksheet,
  checklist: Checklist,
  mapa: MapaTurno,
): void {
  for (const r of checklist.respostas) {
    const linha = LINHA_POR_ITEM[r.itemNumero];
    if (!linha) continue;

    const itemDef = ITENS_CHECKLIST.find((i) => i.numero === r.itemNumero);
    const tipo = itemDef?.tipo ?? "simples";

    const valorTxt = construirValorCelula(r, tipo, itemDef?.unidade);
    const horarioTxt = formatarHoraBR(r.horarioVerificacao);

    if (valorTxt) {
      ws.getCell(`${mapa.colValor}${linha}`).value = valorTxt;
    }
    if (horarioTxt) {
      ws.getCell(`${mapa.colHora}${linha}`).value = horarioTxt;
    }
  }
}

/** Preenche a assinatura do operador UMA ÚNICA VEZ por turno,
 *  preservando o rótulo original do template ("ASSINATURA OPERADOR:"). */
function preencherAssinaturaOperador(
  ws: ExcelJS.Worksheet,
  mapa: MapaTurno,
  nomeOp: string,
  rotuloOriginal: string,
): void {
  if (!nomeOp) return;
  const cellAss = ws.getCell(mapa.cellAssinatura);
  cellAss.value = `${rotuloOriginal.trim()} ${nomeOp}`.trim();
  cellAss.alignment = { wrapText: true, vertical: "middle", horizontal: "left" };
}

/** Converte data URL "data:image/png;base64,..." em ArrayBuffer (compatível com ExcelJS).  */
function dataUrlParaBase64(dataUrl: string): string | null {
  try {
    const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    return base64?.trim() || null;
  } catch {
    return null;
  }
}

/** Insere uma imagem de assinatura sobre uma célula (formato cellAddress).
 *  Usa range tl/br para a imagem ocupar a célula inteira. */
function inserirAssinaturaImagem(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  rangeAddress: string,
  dataUrl: string,
): void {
  const base64 = dataUrlParaBase64(dataUrl);
  if (!base64) return;
  const imageId = wb.addImage({ base64, extension: "png" });
  const [startAddress, endAddress = startAddress] = rangeAddress.split(":");
  const start = /^([A-Z]+)(\d+)$/.exec(startAddress);
  const end = /^([A-Z]+)(\d+)$/.exec(endAddress);
  if (!start || !end) return;

  const toColNum = (letters: string) => {
    let colNum = 0;
    for (let i = 0; i < letters.length; i++) {
      colNum = colNum * 26 + (letters.charCodeAt(i) - 64);
    }
    return colNum;
  };

  const colStart = toColNum(start[1]);
  const rowStart = parseInt(start[2], 10);
  const colEnd = toColNum(end[1]);
  const rowEnd = parseInt(end[2], 10);
  const paddingX = 0.08;
  const paddingTop = 0.38;
  const paddingBottom = 0.08;
  const largura = colEnd - colStart + 1;
  const altura = rowEnd - rowStart + 1;

  const tlCol = colStart - 1 + paddingX;
  const tlRow = rowStart - 1 + paddingTop;
  const brCol = colStart - 1 + largura - paddingX;
  const brRow = rowStart - 1 + altura - paddingBottom;

  ws.addImage(imageId, {
    tl: { col: tlCol, row: tlRow },
    br: { col: brCol, row: brRow },
    editAs: "oneCell",
  } as unknown as Parameters<typeof ws.addImage>[1]);
}

function limparTextoAssinatura(ws: ExcelJS.Worksheet, rangeAddress: string, legenda: string): void {
  const [startAddress] = rangeAddress.split(":");
  const cell = ws.getCell(startAddress);
  cell.value = legenda;
  cell.alignment = { wrapText: true, vertical: "top", horizontal: "left" };
  cell.font = { ...(cell.font ?? {}), size: 8, bold: true };
}

/** Preenche assinaturas digitais (operador + líder) numa célula de assinatura.
 *  Substitui o rótulo por uma imagem da assinatura e adiciona o nome ao lado. */
function preencherAssinaturasDigitais(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  mapa: MapaTurno,
  checklist: Checklist,
): void {
  const ass = checklist.assinaturaOperador;
  const lider = checklist.assinaturaLider;
  if (!ass && !lider) return;

  // Aumenta a altura da linha 28 para a imagem caber confortavelmente.
  if (ass) {
    const row = ws.getRow(28);
    if (!row.height || row.height < 72) row.height = 72;
    limparTextoAssinatura(ws, `${mapa.cellAssinatura}:${mapa.colHora}28`, `Operador · ${formatarHoraBR(ass.assinadoEm)}`);
    inserirAssinaturaImagem(wb, ws, `${mapa.cellAssinatura}:${mapa.colHora}28`, ass.dataUrl);
  }

  if (lider) {
    const row = ws.getRow(29);
    if (!row.height || row.height < 72) row.height = 72;
    limparTextoAssinatura(ws, `${mapa.cellAssinaturaLider}:${mapa.colHora}29`, `Líder · ${formatarHoraBR(lider.assinadoEm)}`);
    inserirAssinaturaImagem(wb, ws, `${mapa.cellAssinaturaLider}:${mapa.colHora}29`, lider.dataUrl);
  }
}

function nomeDoOperador(c: Checklist): string {
  return (
    c.operadorResponsavel?.trim() ||
    c.operador?.trim() ||
    c.operadorLogin?.trim() ||
    ""
  );
}

/** Encontra o checklist concluído de "Pós-setup" (que carrega as assinaturas). */
function checklistComAssinaturas(checklists: Checklist[]): Checklist | null {
  return (
    checklists.find(
      (c) => c.momento === "Pós-setup" && (c.assinaturaOperador || c.assinaturaLider),
    ) ?? null
  );
}

/** Snapshot dos rótulos originais das células de assinatura, antes de
 *  qualquer escrita, para que possamos reescrever sem duplicar.
 *  Indexado por coluna posicional (1|2|3), não por turno. */
function snapshotRotulosAssinatura(ws: ExcelJS.Worksheet): Record<1 | 2 | 3, string> {
  return {
    1: String(ws.getCell(MAPA_TURNOS[1].cellAssinatura).value ?? ""),
    2: String(ws.getCell(MAPA_TURNOS[2].cellAssinatura).value ?? ""),
    3: String(ws.getCell(MAPA_TURNOS[3].cellAssinatura).value ?? ""),
  };
}

/** Resolve a coluna posicional (1|2|3) a partir do turno, com fallback em 1. */
function colunaDoTurno(turno: Turno): 1 | 2 | 3 {
  return colunaPosicionalDoTurno(turno) ?? 1;
}

function construirValorCelula(
  r: RespostaItem,
  tipo: "simples" | "numerico" | "texto",
  unidade?: string,
): string {
  if (tipo === "numerico") {
    if (r.valorNumerico && r.valorNumerico.trim() !== "") {
      return unidade ? `${r.valorNumerico} ${unidade}` : r.valorNumerico;
    }
    if (r.resposta && ABREV_RESPOSTA[r.resposta]) {
      return ABREV_RESPOSTA[r.resposta];
    }
    return "";
  }
  // simples + texto: usar abreviação da resposta
  if (r.resposta && ABREV_RESPOSTA[r.resposta]) {
    return ABREV_RESPOSTA[r.resposta];
  }
  return "";
}

function turnoBaseObservacao(turno: Turno): Turno {
  const col = colunaPosicionalDoTurno(turno) ?? 1;
  if (col === 1) return "12x36 Dia";
  if (col === 2) return "12x36 Noite";
  return "3º Turno";
}

function turnoDaObservacaoEspelho(o: ObservacaoVerso): Turno {
  const label = `${o.origemLabel} ${o.origemCodigo}`.toLowerCase();
  if (label.includes("noite") || label.includes("2º") || label.includes("2°")) {
    return "12x36 Noite";
  }
  if (label.includes("3º") || label.includes("3°")) {
    return "3º Turno";
  }
  const codigoJanela = /^J\d{2}$/i.test(o.origemCodigo)
    ? o.origemCodigo.toUpperCase()
    : null;
  if (codigoJanela) {
    const n = Number(codigoJanela.slice(1));
    if (n >= 5 && n <= 8) return "12x36 Noite";
    if (n >= 9) return "3º Turno";
  }
  return "12x36 Dia";
}

/** Monta texto de uma anomalia respeitando o estado atual real:
 *  - Aberta → "Anomalia HH:mm — Item X — descrição"
 *  - Em andamento → "Anomalia HH:mm — Em andamento — Item X — descrição"
 *  - Resolvida → "Anomalia HH:mm→HH:mm — Item X — descrição — resolvida"
 */
function textoAnomalia(a: Anomalia): string {
  const horaIni = formatarHoraBR(a.criadoEm);
  const horaFim = a.resolvidoEm ? formatarHoraBR(a.resolvidoEm) : "";
  const item = a.itemOrigem ? `Item ${a.itemOrigem.numero} — ` : "";
  const desc = a.descricao.trim();

  let cabecalho = `Anomalia ${horaIni}`;
  let sufixo = "";
  if (a.status === "Resolvida" && horaFim) {
    cabecalho = `Anomalia ${horaIni}→${horaFim}`;
    sufixo = " — resolvida";
  } else if (a.status === "Em andamento") {
    cabecalho = `Anomalia ${horaIni} — Em andamento`;
  }
  return `${cabecalho} — ${item}${desc}${sufixo}`;
}

interface ObsGrupo {
  turno: Turno;
  itens: string[];
  anomalias: string[];
}

/** Coleta observações agrupadas por turno e separadas em itens × anomalias.
 *  USA APENAS os dados atuais da folha/checklist — nunca histórico de auditoria.
 *
 *  Inclui também (opcional):
 *   - observações por ITEM da Limpeza (status = "nao_realizado") por turno;
 *   - observações de cada JANELA do PTP (mapeadas para o turno que cobre a janela).
 */
function coletarObservacoesPorTurno(
  checklists: Checklist[],
  anomalias: Anomalia[],
  verso?: {
    ptpJanelas?: PtpJanela[];
    limpezaTurnos?: LimpezaTurno[];
    observacoesVerso?: ObservacaoVerso[];
  },
): ObsGrupo[] {
  const mapa = new Map<Turno, ObsGrupo>();

  function getGrupo(t: Turno): ObsGrupo {
    let g = mapa.get(t);
    if (!g) {
      g = { turno: t, itens: [], anomalias: [] };
      mapa.set(t, g);
    }
    return g;
  }

  for (const c of checklists) {
    const grupo = getGrupo(turnoBaseObservacao(c.contexto.turno));
    for (const r of c.respostas) {
      const obs = (r.observacao ?? "").trim();
      const isNC = r.resposta === "Não conforme";
      const itemDef = ITENS_CHECKLIST.find((i) => i.numero === r.itemNumero);
      const isItemTexto =
        itemDef?.tipo === "texto" && (r.valorTexto?.trim().length ?? 0) > 0;

      if (obs) {
        grupo.itens.push(`Item ${r.itemNumero} — ${obs}`);
      } else if (isNC) {
        grupo.itens.push(`Item ${r.itemNumero} — Não conforme`);
      }
      if (isItemTexto) {
        grupo.itens.push(`Item ${r.itemNumero} — ${r.valorTexto.trim()}`);
      }
    }
  }

  // Anomalias: agrupar pelo turno da própria anomalia (estado atual real)
  for (const a of anomalias) {
    // só inclui se for da mesma folha/dia que algum checklist exportado
    const pertence = checklists.some(
      (c) =>
        a.checklistId === c.id ||
        c.respostas.some((rr) => rr?.anomaliaId === a.id) ||
        (a.folhaKey && a.folhaKey === c.folhaKey),
    );
    if (!pertence) continue;
    const grupo = getGrupo(turnoBaseObservacao(a.turno));
    grupo.anomalias.push(textoAnomalia(a));
  }

  const observacoesEspelho = verso?.observacoesVerso ?? [];
  const usarEspelhoVerso = observacoesEspelho.length > 0;

  // ─── Limpeza: 1 entrada por item NR com observação ──────────────────
  // Se a tabela-espelho oficial já tem observações, ela é a fonte da frente;
  // os dados brutos abaixo ficam apenas como fallback para histórico não espelhado.
  const limpezaTurnos = verso?.limpezaTurnos ?? [];
  for (const lt of usarEspelhoVerso ? [] : limpezaTurnos) {
    if (lt.status === "pendente" || lt.status === "rascunho") continue;
    const grupo = getGrupo(turnoBaseObservacao(lt.turno));
    for (const it of lt.itens) {
      if (it.status !== "nao_realizado") continue;
      const texto = (it.observacao ?? "").trim();
      const def = LIMPEZA_ITENS_DEF.find((d) => d.codigo === it.codigo);
      const rotulo = def ? `${def.grupo} — ${def.secao}` : `Item ${it.codigo}`;
      const linha = texto
        ? `Limpeza ${it.codigo} (${rotulo}) — Não realizado: ${texto}`
        : `Limpeza ${it.codigo} (${rotulo}) — Não realizado`;
      grupo.itens.push(linha);
    }
  }

  // ─── PTP: 1 entrada por janela com observação ──────────────────────
  const ptpJanelas = usarEspelhoVerso ? [] : (verso?.ptpJanelas ?? []);
  if (ptpJanelas.length > 0) {
    // Mapeia janelaCodigo → turno (primeiro turno que cobre aquela janela).
    const turnosPossiveis: Turno[] = [
      "12x36 Dia",
      "12x36 Noite",
      "Comercial",
      "1º Turno",
      "2º Turno",
      "3º Turno",
    ];
    const turnoDeJanela = new Map<string, Turno>();
    for (const t of turnosPossiveis) {
      for (const codigo of janelasPtpDoTurno(t, null as never)) {
        if (!turnoDeJanela.has(codigo)) turnoDeJanela.set(codigo, t);
      }
    }
    for (const j of ptpJanelas) {
      if (j.statusJanela === "pendente" || j.statusJanela === "rascunho") continue;
      const texto = (j.observacao ?? "").trim();
      if (!texto) continue;
      const turno = turnoDeJanela.get(j.janelaCodigo);
      if (!turno) continue;
      const grupo = getGrupo(turnoBaseObservacao(turno));
      grupo.itens.push(
        `PTP ${j.janelaCodigo} (${j.janelaInicio}–${j.janelaFim}) — ${texto}`,
      );
    }
  }

  for (const o of observacoesEspelho) {
    const turno = turnoDaObservacaoEspelho(o);
    const grupo = getGrupo(turnoBaseObservacao(turno));
    grupo.itens.push(formatarLinhaObservacao(o));
  }

  // Ordem fixa: Dia → Noite → 3º
  const ordem: Turno[] = ["12x36 Dia", "12x36 Noite", "3º Turno"];
  return ordem.map((t) => mapa.get(t)).filter((g): g is ObsGrupo => !!g && (g.itens.length + g.anomalias.length > 0));
}

function rotuloCurtoTurno(t: Turno): string {
  if (t === "12x36 Dia") return "Dia";
  if (t === "12x36 Noite") return "Noite";
  return "3º turno";
}

/** Monta segmentos prontos para distribuir nas linhas: cada segmento começa
 *  com o prefixo de turno e contém as entradas compactadas com " • ". */
function montarSegmentosObservacoes(grupos: ObsGrupo[]): string[] {
  const segmentos: string[] = [];
  for (const g of grupos) {
    const prefixo = `[${rotuloCurtoTurno(g.turno)}] `;
    if (g.itens.length > 0) {
      segmentos.push(prefixo + g.itens.join(" • "));
    }
    if (g.anomalias.length > 0) {
      segmentos.push(prefixo + g.anomalias.join(" • "));
    }
  }
  return segmentos;
}

/** Largura visual aproximada do bloco merged A:I (em caracteres).
 *  ~110 chars rendem bem com wrap em Arial 10. */
const LARGURA_LINHA_OBS = 110;
const LINHAS_OBS = [31, 32, 33, 34, 35, 36];

/** Distribui segmentos em linhas com quebra inteligente:
 *  - concatena segmentos curtos com "  •  " na mesma linha quando cabe
 *  - segmento longo ocupa sua própria linha (wrap cuida do resto)
 *  - se sobrar, anexa o excedente à última linha disponível */
function distribuirEmLinhas(segmentos: string[], maxLinhas: number): string[] {
  if (segmentos.length === 0) return [];
  const linhas: string[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) {
      linhas.push(buffer);
      buffer = "";
    }
  };

  for (const seg of segmentos) {
    if (!buffer) {
      buffer = seg;
      continue;
    }
    const tentativa = `${buffer}  •  ${seg}`;
    if (tentativa.length <= LARGURA_LINHA_OBS) {
      buffer = tentativa;
    } else {
      flush();
      buffer = seg;
    }
  }
  flush();

  if (linhas.length > maxLinhas) {
    const extras = linhas.splice(maxLinhas - 1);
    linhas.push(extras.join("  •  "));
  }
  return linhas;
}

function preencherObservacoesSegmentadas(
  ws: ExcelJS.Worksheet,
  segmentos: string[],
): void {
  if (segmentos.length === 0) return;
  const linhas = distribuirEmLinhas(segmentos, LINHAS_OBS.length);
  linhas.forEach((texto, idx) => {
    const cell = ws.getCell(`A${LINHAS_OBS[idx]}`);
    cell.value = texto;
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "left" };
  });
}

function preencherCabecalhoData(ws: ExcelJS.Worksheet, dataIso: string): void {
  ws.getCell("A3").value = `DATA: ${formatarDataBR(dataIso)}`;
}

function checklistsConcluidos(folha: FolhaChecklistDia): Checklist[] {
  const out: Checklist[] = [];
  for (const m of folha.momentos) {
    for (const v of m.verificacoes) {
      if (v.status === "concluido") out.push(v);
    }
  }
  return out;
}

/** Remove qualquer proteção (planilha + workbook) do arquivo exportado.
 *  Garante que o .xlsx final abra editável, sem senha. */
function removerProtecoes(wb: ExcelJS.Workbook): void {
  // Remove proteção da workbook (workbookProtection no XML)
  const wbAny = wb as unknown as { _workbookProtection?: unknown; workbookProtection?: unknown };
  wbAny._workbookProtection = undefined;
  wbAny.workbookProtection = undefined;

  // Remove proteção de cada worksheet e desbloqueia células
  wb.worksheets.forEach((ws) => {
    const wsAny = ws as unknown as { sheetProtection?: unknown; _sheetProtection?: unknown };
    wsAny.sheetProtection = undefined;
    wsAny._sheetProtection = undefined;
  });
}

const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Detecta se a aplicação está rodando dentro de um app nativo Capacitor (Android/iOS).
 *  No navegador retorna false; no APK retorna true. */
function rodandoNoCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return !!w.Capacitor?.isNativePlatform?.();
}

/** Converte ArrayBuffer em string base64 (sem usar Buffer, p/ funcionar no browser e WebView). */
function arrayBufferParaBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Salva o .xlsx no Android via @capacitor/filesystem e abre o Share Sheet
 *  (WhatsApp, Drive, Email, "Salvar no dispositivo", etc.). */
async function salvarViaCapacitor(buffer: ArrayBuffer, nomeArquivo: string): Promise<void> {
  // Imports dinâmicos escondidos do bundler via Function() — Vite/Rollup não tentam
  // resolver @capacitor/* no build web. Só carregam em runtime dentro do APK,
  // depois de `npm install @capacitor/filesystem @capacitor/share` no seu PC.
  const dynImport = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;
  const fsMod = (await dynImport("@capacitor/filesystem")) as {
    Filesystem: { writeFile: (opts: Record<string, unknown>) => Promise<{ uri: string }> };
    Directory: { Documents: string };
  };
  const shareMod = (await dynImport("@capacitor/share")) as {
    Share: { share: (opts: Record<string, unknown>) => Promise<unknown> };
  };
  const { Filesystem, Directory } = fsMod;
  const { Share } = shareMod;

  const base64 = arrayBufferParaBase64(buffer);
  const escrito = await Filesystem.writeFile({
    path: nomeArquivo,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });

  try {
    await Share.share({
      title: "Checklist FM09",
      text: nomeArquivo,
      url: escrito.uri,
      dialogTitle: "Compartilhar checklist",
    });
  } catch {
    // Usuário cancelou o share — tudo bem, o arquivo já está salvo em Documents.
  }
}

function baixarBlobNoNavegador(buffer: ArrayBuffer, nomeArquivo: string): void {
  const blob = new Blob([buffer], { type: MIME_XLSX });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baixarBlob(buffer: ArrayBuffer, nomeArquivo: string): void {
  if (rodandoNoCapacitor()) {
    void salvarViaCapacitor(buffer, nomeArquivo);
    return;
  }
  baixarBlobNoNavegador(buffer, nomeArquivo);
}

function nomeArquivo(
  folha: FolhaChecklistDia,
  modo: "turno" | "dia" | "turno-verso" | "frente-verso-completo" | "verso-apenas",
): string {
  const data = folha.contexto.data;
  const equipe = sanitizarArquivo(folha.contexto.equipe);
  if (modo === "turno-verso") {
    const turno = sanitizarArquivo(folha.contexto.turno);
    return `FM09_TURNO_FRENTE_VERSO_L3_${data}_${turno}_${equipe}.xlsx`;
  }
  if (modo === "frente-verso-completo") {
    return `FM09_FRENTE_VERSO_COMPLETO_L3_${data}_${equipe}.xlsx`;
  }
  if (modo === "verso-apenas") {
    return `FM09_VERSO_PTP_LIMPEZA_L3_${data}_${equipe}.xlsx`;
  }
  const turno = modo === "turno" ? sanitizarArquivo(folha.contexto.turno) : "FOLHA-DIA";
  return `FM09_CHECKLIST_OPERACIONAL_L3_${data}_${turno}_${equipe}_EDITAVEL.xlsx`;
}

/** Exporta apenas o turno da folha (uma coluna preenchida). */
export async function exportarTurnoExcel(
  folha: FolhaChecklistDia,
  anomalias: Anomalia[],
): Promise<void> {
  const wb = await carregarTemplate();
  const ws = wb.getWorksheet(SHEET_NAME);
  if (!ws) throw new Error("Aba ENCHEDORA 3 não encontrada no template.");

  const rotulos = snapshotRotulosAssinatura(ws);
  preencherCabecalhoData(ws, folha.contexto.data);

  const turno = folha.contexto.turno;
  const mapa = mapaDoTurno(turno);
  const concluidos = checklistsConcluidos(folha);
  for (const c of concluidos) {
    preencherRespostasChecklist(ws, c, mapa);
  }

  const nomeOp = concluidos.map(nomeDoOperador).find((n) => n.length > 0) ?? "";
  preencherAssinaturaOperador(ws, mapa, nomeOp, rotulos[colunaDoTurno(turno)]);

  // Se houver checklist de Pós-setup com assinaturas digitais, embute imagens.
  const checklistAss = checklistComAssinaturas(concluidos);
  if (checklistAss) {
    preencherAssinaturasDigitais(wb, ws, mapa, checklistAss);
  }

  // Carrega verso (PTP + Limpeza) do dia para incluir obs do verso nas Observações.
  const verso = await carregarVersoDoDia(folha).catch(() => ({
    ptpJanelas: [],
    limpezaTurnos: [],
  }));
  const versoTurno = {
    ptpJanelas: verso.ptpJanelas,
    limpezaTurnos: verso.limpezaTurnos.filter((lt) => lt.turno === turno),
    observacoesVerso: (verso.observacoesVerso ?? []).filter(
      (o) => turnoBaseObservacao(turnoDaObservacaoEspelho(o)) === turnoBaseObservacao(turno),
    ),
  };
  const grupos = coletarObservacoesPorTurno(concluidos, anomalias, versoTurno);
  const segmentos = montarSegmentosObservacoes(grupos);
  preencherObservacoesSegmentadas(ws, segmentos);

  removerProtecoes(wb);
  const buf = await wb.xlsx.writeBuffer();
  baixarBlob(buf as ArrayBuffer, nomeArquivo(folha, "turno"));
}

/** Exporta a folha do dia consolidada (até 3 turnos preenchidos). */
export async function exportarFolhaDiaExcel(
  folhaAtual: FolhaChecklistDia,
  todasFolhasDoDia: FolhaChecklistDia[],
  anomalias: Anomalia[],
): Promise<void> {
  const wb = await carregarTemplate();
  const ws = wb.getWorksheet(SHEET_NAME);
  if (!ws) throw new Error("Aba ENCHEDORA 3 não encontrada no template.");

  const rotulos = snapshotRotulosAssinatura(ws);
  preencherCabecalhoData(ws, folhaAtual.contexto.data);

  // Filtra folhas da mesma data + linha + máquina
  const candidatas = todasFolhasDoDia.filter(
    (f) =>
      f.contexto.data === folhaAtual.contexto.data &&
      f.contexto.linha === folhaAtual.contexto.linha &&
      f.contexto.maquina === folhaAtual.contexto.maquina,
  );

  const turnosUsados = new Set<Turno>();
  const todosChecklistsConcluidos: Checklist[] = [];

  for (const f of candidatas) {
    if (turnosUsados.has(f.contexto.turno)) continue;
    turnosUsados.add(f.contexto.turno);
    const mapa = mapaDoTurno(f.contexto.turno);
    const concluidos = checklistsConcluidos(f);
    for (const c of concluidos) {
      preencherRespostasChecklist(ws, c, mapa);
    }
    const nomeOp = concluidos.map(nomeDoOperador).find((n) => n.length > 0) ?? "";
    preencherAssinaturaOperador(ws, mapa, nomeOp, rotulos[colunaDoTurno(f.contexto.turno)]);
    const checklistAss = checklistComAssinaturas(concluidos);
    if (checklistAss) {
      preencherAssinaturasDigitais(wb, ws, mapa, checklistAss);
    }
    todosChecklistsConcluidos.push(...concluidos);
  }

  const verso = await carregarVersoDoDia(folhaAtual).catch(() => ({
    ptpJanelas: [],
    limpezaTurnos: [],
  }));
  const grupos = coletarObservacoesPorTurno(
    todosChecklistsConcluidos,
    anomalias,
    verso,
  );
  const segmentos = montarSegmentosObservacoes(grupos);
  preencherObservacoesSegmentadas(ws, segmentos);

  removerProtecoes(wb);
  const buf = await wb.xlsx.writeBuffer();
  baixarBlob(buf as ArrayBuffer, nomeArquivo(folhaAtual, "dia"));
}

// ────────────────────────────────────────────────────────────────────
// Exports que incluem o VERSO (PTP + Limpeza) — Linha 3 / Enchedora 3
// ────────────────────────────────────────────────────────────────────

async function carregarVersoDoDia(folha: FolhaChecklistDia) {
  const folhaDiaKey = buildFolhaDiaKey(
    folha.contexto.data,
    folha.contexto.linha,
    folha.contexto.maquina,
  );
  const [ptpJanelas, limpezaTurnos, observacoesVerso] = await Promise.all([
    fetchPtpJanelas(folhaDiaKey),
    fetchLimpezaTurnos(folhaDiaKey),
    fetchObservacoesVerso(folhaDiaKey),
  ]);
  return { ptpJanelas, limpezaTurnos, observacoesVerso };
}

/** Exporta o turno atual: aba ENCHEDORA 3 (frente preenchida só do turno)
 *  + aba VERSO com PTP/Limpeza filtrados pelo mesmo turno. */
export async function exportarTurnoComVersoExcel(
  folha: FolhaChecklistDia,
  anomalias: Anomalia[],
): Promise<void> {
  const wb = await carregarTemplate();
  const ws = wb.getWorksheet(SHEET_NAME);
  if (!ws) throw new Error("Aba ENCHEDORA 3 não encontrada no template.");

  const rotulos = snapshotRotulosAssinatura(ws);
  preencherCabecalhoData(ws, folha.contexto.data);

  const turno = folha.contexto.turno;
  const mapa = mapaDoTurno(turno);
  const concluidos = checklistsConcluidos(folha);
  for (const c of concluidos) {
    preencherRespostasChecklist(ws, c, mapa);
  }
  const nomeOp = concluidos.map(nomeDoOperador).find((n) => n.length > 0) ?? "";
  preencherAssinaturaOperador(ws, mapa, nomeOp, rotulos[colunaDoTurno(turno)]);
  const checklistAss = checklistComAssinaturas(concluidos);
  if (checklistAss) preencherAssinaturasDigitais(wb, ws, mapa, checklistAss);

  // Carrega verso antes para reaproveitar nas Observações da frente.
  const { ptpJanelas, limpezaTurnos, observacoesVerso } = await carregarVersoDoDia(folha);
  const versoTurno = {
    ptpJanelas,
    limpezaTurnos: limpezaTurnos.filter((lt) => lt.turno === turno),
    observacoesVerso: observacoesVerso.filter(
      (o) => turnoBaseObservacao(turnoDaObservacaoEspelho(o)) === turnoBaseObservacao(turno),
    ),
  };
  const grupos = coletarObservacoesPorTurno(concluidos, anomalias, versoTurno);
  preencherObservacoesSegmentadas(ws, montarSegmentosObservacoes(grupos));

  // Aba VERSO (filtrada pelo turno)
  await gerarVersoWorksheet(wb, {
    dataOperacao: folha.contexto.data,
    ptpJanelas,
    limpezaTurnos,
    turnoFiltro: turno,
  });

  removerProtecoes(wb);
  const buf = await wb.xlsx.writeBuffer();
  baixarBlob(buf as ArrayBuffer, nomeArquivo(folha, "turno-verso"));
}

/** Exporta a folha do dia COMPLETA + a aba VERSO completa (3 turnos). */
export async function exportarFrenteVersoCompletoExcel(
  folhaAtual: FolhaChecklistDia,
  todasFolhasDoDia: FolhaChecklistDia[],
  anomalias: Anomalia[],
): Promise<void> {
  const wb = await carregarTemplate();
  const ws = wb.getWorksheet(SHEET_NAME);
  if (!ws) throw new Error("Aba ENCHEDORA 3 não encontrada no template.");

  const rotulos = snapshotRotulosAssinatura(ws);
  preencherCabecalhoData(ws, folhaAtual.contexto.data);

  const candidatas = todasFolhasDoDia.filter(
    (f) =>
      f.contexto.data === folhaAtual.contexto.data &&
      f.contexto.linha === folhaAtual.contexto.linha &&
      f.contexto.maquina === folhaAtual.contexto.maquina,
  );

  const turnosUsados = new Set<Turno>();
  const todosChecklistsConcluidos: Checklist[] = [];

  for (const f of candidatas) {
    if (turnosUsados.has(f.contexto.turno)) continue;
    turnosUsados.add(f.contexto.turno);
    const mapa = mapaDoTurno(f.contexto.turno);
    const concluidos = checklistsConcluidos(f);
    for (const c of concluidos) preencherRespostasChecklist(ws, c, mapa);
    const nomeOp = concluidos.map(nomeDoOperador).find((n) => n.length > 0) ?? "";
    preencherAssinaturaOperador(ws, mapa, nomeOp, rotulos[colunaDoTurno(f.contexto.turno)]);
    const checklistAss = checklistComAssinaturas(concluidos);
    if (checklistAss) preencherAssinaturasDigitais(wb, ws, mapa, checklistAss);
    todosChecklistsConcluidos.push(...concluidos);
  }

  // Carrega verso antes para reaproveitar nas Observações da frente.
  const { ptpJanelas, limpezaTurnos, observacoesVerso } = await carregarVersoDoDia(folhaAtual);
  const grupos = coletarObservacoesPorTurno(
    todosChecklistsConcluidos,
    anomalias,
    { ptpJanelas, limpezaTurnos, observacoesVerso },
  );
  preencherObservacoesSegmentadas(ws, montarSegmentosObservacoes(grupos));

  // Aba VERSO completa (sem filtro de turno)
  await gerarVersoWorksheet(wb, {
    dataOperacao: folhaAtual.contexto.data,
    ptpJanelas,
    limpezaTurnos,
  });

  removerProtecoes(wb);
  const buf = await wb.xlsx.writeBuffer();
  baixarBlob(buf as ArrayBuffer, nomeArquivo(folhaAtual, "frente-verso-completo"));
}

/** Exporta APENAS o verso (PTP + Limpeza) em um arquivo standalone — sem
 *  a aba ENCHEDORA 3 da frente. Usa um workbook novo, sem o template FM09. */
export async function exportarVersoApenasExcel(
  folha: FolhaChecklistDia,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const { ptpJanelas, limpezaTurnos } = await carregarVersoDoDia(folha);
  await gerarVersoWorksheet(wb, {
    dataOperacao: folha.contexto.data,
    ptpJanelas,
    limpezaTurnos,
  });
  removerProtecoes(wb);
  const buf = await wb.xlsx.writeBuffer();
  baixarBlob(buf as ArrayBuffer, nomeArquivo(folha, "verso-apenas"));
}
