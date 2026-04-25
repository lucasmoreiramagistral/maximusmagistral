import ExcelJS from "exceljs";
import {
  LIMPEZA_ITENS_DEF,
  PTP_ITENS,
  PTP_JANELAS,
  janelasPtpDoTurno,
} from "./constants";
import type { LimpezaTurno, PtpJanela } from "./types";
import type { Turno } from "@/lib/checklist/types";
import { PTP_LIMPEZA_TEMPLATE_BASE64 } from "@/assets/templates/ptp-limpeza-template";
import { colunaPosicionalDoTurno } from "@/lib/operacao/escalas";

// ─────────────────────────────────────────────────────────────────────
// Layout fiel ao template oficial v3 "PTP_s_e_CHECKLIST_SALA_DE_ENVASE"
// (aba "ENCHEDORA L3"). 1 aba única → PTP no topo + Limpeza embaixo.
//
// Mapa de colunas (B..S, 18 colunas físicas):
//   B–G: descrição/cabeçalhos (PTP) e LOCAL/ITEM/SEÇÃO/DESCRIÇÃO (limpeza)
//   H..S: 12 janelas PTP J01..J12
//      H–K = 1° TURNO ou 12x36 Dia (J01..J04)
//      L–O = 2° TURNO ou 12x36 Noite (J05..J08)
//      P–S = 3° TURNO (J09..J12)
//   Na limpeza:  O = 1°T, P = 2°T, Q = 3°T  ·  R:S = obs do líder
//
// Linhas-chave (PTP):
//   1   título    · 3 data + legendas    · 4-6 operadores 1/2/3
//   7   header turnos   · 8 rótulos das janelas
//   9..13 itens PTP (5)    · 14 ANÁLISE DE ÂNGULO    · 15 vistos
// Linhas-chave (Limpeza):
//   17 título   · 18 hdr   · 20..40 21 itens
//   41 assinaturas líder (3 turnos)   · 42 assin. operador (O/P/Q)
//
// Os horários nos rótulos das janelas usam a regra NOVA arredondada
// (12:00–14:00, 20:00–22:00, 22:00–00:00), sobrescrevendo o que o
// template Excel ainda mostra como 14:20/22:40 — decisão do usuário.
// ─────────────────────────────────────────────────────────────────────

export const VERSO_SHEET_NAME = "ENCHEDORA L3";

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function criarWorksheetVersoDoTemplate(wb: ExcelJS.Workbook): Promise<ExcelJS.Worksheet> {
  const existente = wb.getWorksheet(VERSO_SHEET_NAME);
  if (existente) wb.removeWorksheet(existente.id);

  const template = new ExcelJS.Workbook();
  await template.xlsx.load(base64ToArrayBuffer(PTP_LIMPEZA_TEMPLATE_BASE64));
  const origem = template.getWorksheet(VERSO_SHEET_NAME) ?? template.worksheets[0];
  if (!origem) throw new Error("Aba ENCHEDORA L3 não encontrada no template de PTP/Limpeza.");

  const ws = wb.addWorksheet(VERSO_SHEET_NAME);
  ws.model = { ...origem.model, id: ws.id, name: VERSO_SHEET_NAME };
  return ws;
}

function mergeCellsIfNeeded(ws: ExcelJS.Worksheet, range: string): void {
  try {
    ws.mergeCells(range);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already merged|Cannot merge/i.test(msg)) throw e;
  }
}

function rotuloTurnoCabecalho(turno: Turno): string {
  const col = colunaPosicionalDoTurno(turno);
  if (col === 1) return "1° TURNO ou 12x36 Dia ou Comercial";
  if (col === 2) return "2° TURNO ou 12x36 Noite";
  return "3° TURNO";
}

function rotuloTurnoCurto(turno: Turno): string {
  const col = colunaPosicionalDoTurno(turno);
  if (col === 1) return "1°T ou 12x36 D";
  if (col === 2) return "2°T ou 12x36 N";
  return "3°T";
}

function formatarDataBR(iso: string): string {
  try {
    const d = iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function normalizarDataUrlImagem(dataUrl: string): string | null {
  try {
    const valor = dataUrl.trim();
    if (!valor) return null;
    return valor.startsWith("data:image/") ? valor : `data:image/png;base64,${valor}`;
  } catch {
    return null;
  }
}

function dataUrlParaBase64Limpo(dataUrl: string): string | null {
  const normalizada = normalizarDataUrlImagem(dataUrl);
  if (!normalizada) return null;
  const partes = normalizada.split(",");
  return (partes.length > 1 ? partes[1] : normalizada).trim() || null;
}

/** Converte base64 em Uint8Array — mais confiável que passar base64 direto p/ o ExcelJS. */
function base64ParaArrayBuffer(base64: string): ArrayBuffer | null {
  try {
    const limpo = base64.replace(/\s/g, "");
    const bin = atob(limpo);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  } catch (e) {
    console.error("[verso/excel] base64ParaArrayBuffer falhou:", e);
    return null;
  }
}

async function recortarAssinaturaParaExcel(dataUrl: string): Promise<string> {
  const normalizada = normalizarDataUrlImagem(dataUrl);
  if (!normalizada || typeof document === "undefined" || typeof Image === "undefined") {
    return normalizada ?? dataUrl;
  }

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = normalizada;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || canvas.width === 0 || canvas.height === 0) return normalizada;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const alpha = data[i + 3];
        const escuro = data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245;
        if (alpha > 12 && escuro) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX < minX || maxY < minY) return normalizada;

    const pad = Math.max(8, Math.round(Math.max(maxX - minX, maxY - minY) * 0.12));
    const sx = Math.max(0, minX - pad);
    const sy = Math.max(0, minY - pad);
    const sw = Math.min(width - sx, maxX - minX + 1 + pad * 2);
    const sh = Math.min(height - sy, maxY - minY + 1 + pad * 2);
    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    const outCtx = out.getContext("2d");
    if (!outCtx) return normalizada;
    outCtx.fillStyle = "#ffffff";
    outCtx.fillRect(0, 0, sw, sh);
    outCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return out.toDataURL("image/png");
  } catch {
    return normalizada;
  }
}

const BORDA_FINA: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF888888" } },
  bottom: { style: "thin", color: { argb: "FF888888" } },
  left: { style: "thin", color: { argb: "FF888888" } },
  right: { style: "thin", color: { argb: "FF888888" } },
};

function aplicarBordas(ws: ExcelJS.Worksheet, range: string): void {
  const [a, b] = range.split(":");
  const m1 = /^([A-Z]+)(\d+)$/.exec(a);
  const m2 = /^([A-Z]+)(\d+)$/.exec(b ?? a);
  if (!m1 || !m2) return;
  const col1 = colLetraParaNum(m1[1]);
  const col2 = colLetraParaNum(m2[1]);
  const r1 = +m1[2];
  const r2 = +m2[2];
  for (let r = r1; r <= r2; r++) {
    for (let c = col1; c <= col2; c++) {
      ws.getCell(r, c).border = BORDA_FINA;
    }
  }
}

function colLetraParaNum(letras: string): number {
  let n = 0;
  for (let i = 0; i < letras.length; i++)
    n = n * 26 + (letras.charCodeAt(i) - 64);
  return n;
}

function colNumParaLetra(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Coluna no PTP para uma janela específica (J01..J12 → colunas H..S). */
function colunaPtpJanela(codigo: string): number {
  const idx = PTP_JANELAS.findIndex((j) => j.codigo === codigo);
  return 8 + idx; // H=8
}

/** Coluna na limpeza por turno: 1→O(15), 2→P(16), 3→Q(17). */
function colunaLimpezaTurno(turno: Turno): number {
  const col = colunaPosicionalDoTurno(turno) ?? 1;
  return 14 + col; // O=15, P=16, Q=17
}

interface InserirImagemOpts {
  centralizar?: boolean;
  larguraFracao?: number;
  alturaFracao?: number;
  inicioXFracao?: number;
  inicioYFracao?: number;
}

async function inserirImagem(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  rangeAddress: string,
  dataUrl: string,
  opts: InserirImagemOpts = {},
): Promise<void> {
  const recortada = await recortarAssinaturaParaExcel(dataUrl);
  const base64 = dataUrlParaBase64Limpo(recortada);
  if (!base64) {
    console.warn("[verso/excel] assinatura sem base64 válido — pulando.");
    return;
  }
  const buffer = base64ParaArrayBuffer(base64);
  if (!buffer) return;
  // ArrayBuffer evita o bug em que o ExcelJS recebia Uint8Array e gerava um
  // desenho vazio/sem a assinatura em alguns navegadores.
  const id = wb.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension: "png" });
  const [a, b = a] = rangeAddress.split(":");
  const m1 = /^([A-Z]+)(\d+)$/.exec(a);
  const m2 = /^([A-Z]+)(\d+)$/.exec(b);
  if (!m1 || !m2) return;
  const c1 = colLetraParaNum(m1[1]);
  const r1 = +m1[2];
  const c2 = colLetraParaNum(m2[1]);
  const r2 = +m2[2];
  const totalCols = c2 - c1 + 1;
  const totalRows = r2 - r1 + 1;

  const lf = opts.larguraFracao ?? 0.9;
  const af = opts.alturaFracao ?? 0.9;
  const padX = opts.inicioXFracao ?? (1 - lf) / 2;
  const padY = opts.inicioYFracao ?? (1 - af) / 2;
  const tlCol = c1 - 1 + totalCols * padX;
  const brCol = c1 - 1 + totalCols * Math.min(padX + lf, 1);
  const tlRow = r1 - 1 + totalRows * padY;
  const brRow = r1 - 1 + totalRows * Math.min(padY + af, 1);
  ws.addImage(id, {
    tl: { col: tlCol, row: tlRow },
    br: { col: brCol, row: brRow },
    editAs: "oneCell",
  } as unknown as Parameters<typeof ws.addImage>[1]);
}

interface GerarVersoOpts {
  /** Se preenchido, só destaca/preenche dados do turno. Outros turnos ficam em branco. */
  turnoFiltro?: Turno;
  dataOperacao: string;
  ptpJanelas: PtpJanela[];
  limpezaTurnos: LimpezaTurno[];
}

/** Adiciona uma worksheet "ENCHEDORA L3" ao workbook e a preenche fielmente
 *  ao layout oficial v3. Retorna a worksheet criada. */
export async function gerarVersoWorksheet(
  wb: ExcelJS.Workbook,
  opts: GerarVersoOpts,
): Promise<ExcelJS.Worksheet> {
  const ws = await criarWorksheetVersoDoTemplate(wb);
  ws.pageSetup = { ...ws.pageSetup, orientation: "landscape", paperSize: 9, fitToPage: true };

  // Larguras de coluna (A vazia + B..S = 18 colunas úteis)
  ws.getColumn(1).width = 2; // A — espaço lateral, espelha o template
  const widthsBS = [
    8, 6, 6, 18, 6, 6, // B..G — descrições
    11, 11, 11, 11,    // H..K — janelas 1°T (J01..J04)
    11, 11, 11, 13,    // L..O — janelas 2°T (J05..J08) + assinatura limpeza O
    13, 13, 11, 11,    // P..S — janelas 3°T (J09..J12) + assinatura limpeza P/Q
  ];
  widthsBS.forEach((w, i) => {
    ws.getColumn(i + 2).width = w;
  });

  // ─── Linha 1 — Título geral ───────────────────────────────────────
  mergeCellsIfNeeded(ws, "B1:S1");
  const tit = ws.getCell("B1");
  tit.value = "PLANILHA DE PTP - ENCHEDORA LINHA 3";
  tit.font = { bold: true, size: 14 };
  tit.alignment = { horizontal: "center", vertical: "middle" };
  tit.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE3F2FD" },
  };
  ws.getRow(1).height = 24;

  // ─── Linha 3 — Data + legendas ───────────────────────────────────
  mergeCellsIfNeeded(ws, "B3:I3");
  ws.getCell("B3").value = `DATA: ${formatarDataBR(opts.dataOperacao)}`;
  ws.getCell("B3").font = { bold: true };
  ws.getCell("B3").alignment = { vertical: "middle" };

  mergeCellsIfNeeded(ws, "J3:M3");
  ws.getCell("J3").value = "n° = QUANTIDADE REAL DE OCORRÊNCIAS";
  ws.getCell("J3").alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("J3").font = { bold: true, size: 9 };
  ws.getCell("J3").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF59D" },
  };

  mergeCellsIfNeeded(ws, "N3:P3");
  ws.getCell("N3").value = "✓ = ANÁLISE DE ÂNGULO REALIZADA";
  ws.getCell("N3").alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("N3").font = { bold: true, size: 9 };
  ws.getCell("N3").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFC8E6C9" },
  };

  mergeCellsIfNeeded(ws, "Q3:S3");
  ws.getCell("Q3").value = "NR = NÃO RODOU";
  ws.getCell("Q3").alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("Q3").font = { bold: true, size: 9 };
  ws.getCell("Q3").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFCDD2" },
  };

  // ─── Linhas 4-6 — Operadores 1/2/3 ───────────────────────────────
  // Operador por COLUNA POSICIONAL — pega o primeiro nome de qualquer
  // janela coberta por qualquer turno daquela coluna.
  const operadorPorColuna = (col: 1 | 2 | 3): string => {
    const turnosDaColuna: Turno[] = (
      ["12x36 Dia", "12x36 Noite", "Comercial", "1º Turno", "2º Turno", "3º Turno"] as Turno[]
    ).filter((t) => colunaPosicionalDoTurno(t) === col);
    const codigos = new Set<string>();
    for (const t of turnosDaColuna) {
      for (const c of janelasPtpDoTurno(t, null as never)) codigos.add(c);
    }
    const nomes = opts.ptpJanelas
      .filter((j) => codigos.has(j.janelaCodigo))
      .map((j) => (j.operadorNome || j.operadorLogin || "").trim())
      .filter((n) => n.length > 0);
    return nomes[0] ?? "";
  };

  const op1 = operadorPorColuna(1);
  const op2 = operadorPorColuna(2);
  const op3 = operadorPorColuna(3);
  mergeCellsIfNeeded(ws, "B4:S4");
  ws.getCell("B4").value = `OPERADOR 1: ${op1}`;
  ws.getCell("B4").font = { bold: true };
  mergeCellsIfNeeded(ws, "B5:S5");
  ws.getCell("B5").value = `OPERADOR 2: ${op2}`;
  ws.getCell("B5").font = { bold: true };
  mergeCellsIfNeeded(ws, "B6:S6");
  ws.getCell("B6").value = `OPERADOR 3: ${op3}`;
  ws.getCell("B6").font = { bold: true };

  // ─── Linha 7 — Header turnos do PTP ──────────────────────────────
  mergeCellsIfNeeded(ws, "B7:G8");
  const cabPtp = ws.getCell("B7");
  cabPtp.value =
    "ITEM DE VERIFICAÇÃO NAS GARRAFAS\n(Informe a quantidade quando houver ocorrência)";
  cabPtp.alignment = { wrapText: true, horizontal: "center", vertical: "middle" };
  cabPtp.font = { bold: true, size: 9 };
  cabPtp.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };

  mergeCellsIfNeeded(ws, "H7:K7");
  ws.getCell("H7").value = rotuloTurnoCabecalho("12x36 Dia");
  mergeCellsIfNeeded(ws, "L7:O7");
  ws.getCell("L7").value = rotuloTurnoCabecalho("12x36 Noite");
  mergeCellsIfNeeded(ws, "P7:S7");
  ws.getCell("P7").value = rotuloTurnoCabecalho("3º Turno");
  ["H7", "L7", "P7"].forEach((c) => {
    const cell = ws.getCell(c);
    cell.font = { bold: true, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8F5E9" },
    };
  });

  // ─── Linha 8 — Rótulos das 12 janelas ────────────────────────────
  PTP_JANELAS.forEach((j, idx) => {
    const col = colNumParaLetra(8 + idx); // H..S
    const cell = ws.getCell(`${col}8`);
    cell.value = j.rotulo;
    cell.font = { size: 8, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF5F5F5" },
    };
  });
  ws.getRow(7).height = 30;
  ws.getRow(8).height = 28;

  // ─── Linhas 9..13 — 5 itens PTP × 12 janelas ─────────────────────
  const PTP_LINHA_INI = 9;
  PTP_ITENS.forEach((itemDef, iIdx) => {
    const linha = PTP_LINHA_INI + iIdx;
    mergeCellsIfNeeded(ws, `B${linha}:G${linha}`);
    const cellNome = ws.getCell(`B${linha}`);
    cellNome.value = itemDef.nome;
    cellNome.font = { bold: true, size: 10 };
    cellNome.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };

    PTP_JANELAS.forEach((j) => {
      const colNum = colunaPtpJanela(j.codigo);
      const cell = ws.getCell(linha, colNum);
      cell.alignment = { horizontal: "center", vertical: "middle" };

      const janela = opts.ptpJanelas.find(
        (x) => x.janelaCodigo === j.codigo,
      );
      const codigosTurno = opts.turnoFiltro
        ? janelasPtpDoTurno(opts.turnoFiltro, null as never)
        : null;
      if (codigosTurno && !codigosTurno.includes(j.codigo)) return;

      if (!janela || janela.statusJanela === "pendente" || janela.statusJanela === "rascunho") {
        return;
      }
      if (janela.statusJanela === "nao_rodou") {
        cell.value = "NR";
        cell.font = { italic: true, color: { argb: "FF777777" }, bold: true };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFEBEE" },
        };
        return;
      }
      // Defeitos: exibe quantidade real acumulada (>0). Se 0/sem ocorrência,
      // célula vazia (não usar "X" e não multiplicar por 2).
      const it = janela.itens.find((x) => x.codigo === itemDef.codigo);
      const qtd = it?.quantidade ?? 0;
      if (qtd > 0) {
        cell.value = qtd;
        cell.font = { bold: true, color: { argb: "FFC62828" }, size: 11 };
      }
    });
  });

  // ─── Linha 14 — ANÁLISE DE ÂNGULO ────────────────────────────────
  // Aderência (não defeito): por janela, mostra ✓ (1 verif.), ✓✓ (2),
  // vazio (nenhuma) ou NR (não rodou).
  const LINHA_ANGULO = 14;
  mergeCellsIfNeeded(ws, `B${LINHA_ANGULO}:G${LINHA_ANGULO}`);
  const cellAng = ws.getCell(`B${LINHA_ANGULO}`);
  cellAng.value = "ANÁLISE DE ÂNGULO (2 verificações de 30 min)";
  cellAng.font = { bold: true, size: 9, italic: true };
  cellAng.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  cellAng.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF8E1" },
  };
  for (const j of PTP_JANELAS) {
    const colNum = colunaPtpJanela(j.codigo);
    const cell = ws.getCell(LINHA_ANGULO, colNum);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFF8E1" },
    };

    const janela = opts.ptpJanelas.find((x) => x.janelaCodigo === j.codigo);
    const codigosTurno = opts.turnoFiltro
      ? janelasPtpDoTurno(opts.turnoFiltro, null as never)
      : null;
    if (codigosTurno && !codigosTurno.includes(j.codigo)) continue;
    if (!janela) continue;
    if (janela.statusJanela === "nao_rodou") {
      cell.value = "NR";
      cell.font = { italic: true, color: { argb: "FF777777" }, bold: true };
      continue;
    }
    const ang = janela.analiseAngulo;
    if (!ang) continue;
    const v1 = ang.v1Realizada ? 1 : 0;
    const v2 = ang.v2Realizada ? 1 : 0;
    const total = v1 + v2;
    if (total === 0) continue;
    cell.value = total === 2 ? "✓✓" : "✓";
    cell.font = { bold: true, color: { argb: "FF1565C0" }, size: 11 };
  }

  // ─── Linha 15 — Vistos por janela ────────────────────────────────
  const LINHA_VISTO = 15;
  ws.getRow(LINHA_VISTO).height = 118;
  mergeCellsIfNeeded(ws, `B${LINHA_VISTO}:G${LINHA_VISTO}`);
  const cellVisto = ws.getCell(`B${LINHA_VISTO}`);
  cellVisto.value =
    "Operador(a), assinar a cada preenchimento e anotar observações no verso quando necessário.";
  cellVisto.font = { italic: true, size: 8 };
  cellVisto.alignment = { wrapText: true, vertical: "middle", indent: 1 };
  for (const j of PTP_JANELAS) {
    const colNum = colunaPtpJanela(j.codigo);
    const cell = ws.getCell(LINHA_VISTO, colNum);
    const janela = opts.ptpJanelas.find((x) => x.janelaCodigo === j.codigo);
    const codigosTurno = opts.turnoFiltro
      ? janelasPtpDoTurno(opts.turnoFiltro, null as never)
      : null;
    if (codigosTurno && !codigosTurno.includes(j.codigo)) {
      cell.value = "Visto:";
      cell.font = { size: 7 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      continue;
    }
    const nome = (janela?.assinaturaOperador?.nome || janela?.operadorNome || janela?.operadorLogin || "").trim();
    if (janela?.assinaturaOperador?.dataUrl) {
      cell.value = nome ? `Visto..:\n${nome}` : "Visto..:";
      cell.font = { size: 6, color: { argb: "FF333333" } };
      cell.alignment = { horizontal: "center", vertical: "bottom", wrapText: true };
      const colLetra = colNumParaLetra(colNum);
      await inserirImagem(
        wb,
        ws,
        `${colLetra}${LINHA_VISTO}:${colLetra}${LINHA_VISTO}`,
        janela.assinaturaOperador.dataUrl,
        { larguraFracao: 0.98, alturaFracao: 0.68, inicioYFracao: 0.12 },
      );
    } else {
      cell.value = nome ? `Visto..: ${nome}` : "Visto..:";
      cell.font = { size: 7, bold: !!nome };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
  }

  aplicarBordas(ws, `B7:S${LINHA_VISTO}`);

  // ─── Linha 17 — Cabeçalho LIMPEZA ────────────────────────────────
  const LIMPEZA_INI = 17;
  mergeCellsIfNeeded(ws, `B${LIMPEZA_INI}:K${LIMPEZA_INI}`);
  const cabL = ws.getCell(`B${LIMPEZA_INI}`);
  cabL.value = "CHECKLIST OPERACIONAL DE LIMPEZA DA SALA DE ENVASE L3";
  cabL.font = { bold: true, size: 12 };
  cabL.alignment = { horizontal: "center", vertical: "middle" };
  cabL.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };

  mergeCellsIfNeeded(ws, `L${LIMPEZA_INI}:N${LIMPEZA_INI}`);
  ws.getCell(`L${LIMPEZA_INI}`).value = "✓ = Realizado / NA";
  ws.getCell(`L${LIMPEZA_INI}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`L${LIMPEZA_INI}`).font = { size: 9, bold: true };
  ws.getCell(`L${LIMPEZA_INI}`).fill = {
    type: "pattern", pattern: "solid", fgColor: { argb: "FFC8E6C9" },
  };

  mergeCellsIfNeeded(ws, `O${LIMPEZA_INI}:Q${LIMPEZA_INI}`);
  ws.getCell(`O${LIMPEZA_INI}`).value = "✗ = Não realizado";
  ws.getCell(`O${LIMPEZA_INI}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`O${LIMPEZA_INI}`).font = { size: 9, bold: true };
  ws.getCell(`O${LIMPEZA_INI}`).fill = {
    type: "pattern", pattern: "solid", fgColor: { argb: "FFFFCDD2" },
  };

  mergeCellsIfNeeded(ws, `R${LIMPEZA_INI}:S${LIMPEZA_INI}`);
  ws.getCell(`R${LIMPEZA_INI}`).value =
    "Código Doc.: FM28 PSGQ07\nRev.: 00";
  ws.getCell(`R${LIMPEZA_INI}`).alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  ws.getCell(`R${LIMPEZA_INI}`).font = { size: 8 };

  // ─── Linha 18 — Header da tabela limpeza ─────────────────────────
  const LIMPEZA_HDR = 18;
  mergeCellsIfNeeded(ws, `B${LIMPEZA_HDR}:B19`);
  ws.getCell(`B${LIMPEZA_HDR}`).value = "LOCAL";
  mergeCellsIfNeeded(ws, `C${LIMPEZA_HDR}:C19`);
  ws.getCell(`C${LIMPEZA_HDR}`).value = "ITEM";
  mergeCellsIfNeeded(ws, `D${LIMPEZA_HDR}:E19`);
  ws.getCell(`D${LIMPEZA_HDR}`).value = "SEÇÃO";
  mergeCellsIfNeeded(ws, `F${LIMPEZA_HDR}:N19`);
  ws.getCell(`F${LIMPEZA_HDR}`).value = "DESCRIÇÃO";
  mergeCellsIfNeeded(ws, `O${LIMPEZA_HDR}:O19`);
  ws.getCell(`O${LIMPEZA_HDR}`).value = rotuloTurnoCurto("12x36 Dia");
  mergeCellsIfNeeded(ws, `P${LIMPEZA_HDR}:P19`);
  ws.getCell(`P${LIMPEZA_HDR}`).value = rotuloTurnoCurto("12x36 Noite");
  mergeCellsIfNeeded(ws, `Q${LIMPEZA_HDR}:Q19`);
  ws.getCell(`Q${LIMPEZA_HDR}`).value = rotuloTurnoCurto("3º Turno");
  mergeCellsIfNeeded(ws, `R${LIMPEZA_HDR}:S19`);
  ws.getCell(`R${LIMPEZA_HDR}`).value = "Observações do líder";
  ["B", "C", "D", "F", "O", "P", "Q", "R"].forEach((c) => {
    const cell = ws.getCell(`${c}${LIMPEZA_HDR}`);
    cell.font = { bold: true, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
  });

  // ─── Linhas 20..40 — 21 itens limpeza ────────────────────────────
  const LIMPEZA_LINHA_INI = 20;
  LIMPEZA_ITENS_DEF.forEach((it, idx) => {
    const linha = LIMPEZA_LINHA_INI + idx;
    ws.getCell(`B${linha}`).value = it.grupo;
    ws.getCell(`C${linha}`).value = it.codigo;
    mergeCellsIfNeeded(ws, `D${linha}:E${linha}`);
    ws.getCell(`D${linha}`).value = it.secao;
    mergeCellsIfNeeded(ws, `F${linha}:N${linha}`);
    ws.getCell(`F${linha}`).value = it.descricao;

    ["B", "C", "D", "F"].forEach((c) => {
      const cell = ws.getCell(`${c}${linha}`);
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: c === "F" ? "left" : "center",
        indent: c === "F" ? 1 : 0,
      };
      cell.font = { size: 9 };
    });

    // Marca os turnos COM DADO REGISTRADO (modelo lazy — não pré-cria).
    for (const lt of opts.limpezaTurnos) {
      if (opts.turnoFiltro && opts.turnoFiltro !== lt.turno) continue;
      const colNum = colunaLimpezaTurno(lt.turno);
      const cell = ws.getCell(linha, colNum);
      cell.alignment = { horizontal: "center", vertical: "middle" };
      if (lt.status === "pendente" || lt.status === "rascunho") continue;
      const respItem = lt.itens.find((x) => x.codigo === it.codigo);
      if (!respItem || !respItem.status) continue;
      if (respItem.status === "realizado" || respItem.status === "nao_aplicavel") {
        cell.value = "✓";
        cell.font = { bold: true, color: { argb: "FF2E7D32" }, size: 12 };
      } else {
        cell.value = "✗";
        cell.font = { bold: true, color: { argb: "FFC62828" }, size: 12 };
      }
    }
  });

  const LIMPEZA_FIM = LIMPEZA_LINHA_INI + LIMPEZA_ITENS_DEF.length - 1; // 40
  aplicarBordas(ws, `B${LIMPEZA_HDR}:Q${LIMPEZA_FIM}`);

  // Bloco de observações livres do líder em R20:S40 — concatena obs PTP + Limpeza.
  mergeCellsIfNeeded(ws, `R${LIMPEZA_LINHA_INI}:S${LIMPEZA_FIM}`);
  const cellObs = ws.getCell(`R${LIMPEZA_LINHA_INI}`);
  const linhasObs: string[] = [];
  for (const j of opts.ptpJanelas) {
    if (opts.turnoFiltro) {
      const codigos = janelasPtpDoTurno(opts.turnoFiltro, null as never);
      if (!codigos.includes(j.janelaCodigo)) continue;
    }
    if (j.observacao && j.observacao.trim()) {
      linhasObs.push(`[PTP ${j.janelaCodigo} ${j.janelaInicio}-${j.janelaFim}] ${j.observacao.trim()}`);
    }
  }
  for (const t of opts.limpezaTurnos) {
    if (opts.turnoFiltro && opts.turnoFiltro !== t.turno) continue;
    if (t.observacao && t.observacao.trim()) {
      linhasObs.push(`[Limpeza ${rotuloTurnoCurto(t.turno)}] ${t.observacao.trim()}`);
    }
    for (const item of t.itens) {
      if (item.status !== "nao_realizado") continue;
      const texto = (item.observacao ?? "").trim();
      if (!texto) continue;
      linhasObs.push(
        `[Limpeza ${rotuloTurnoCurto(t.turno)} item ${item.codigo} NR] ${texto}`,
      );
    }
  }
  cellObs.value = linhasObs.length
    ? linhasObs.join("\n\n")
    : "Operador, realize este checklist diariamente uma vez no turno. Qualquer dificuldade ou impedimento, registrar nesta área.";
  cellObs.alignment = { wrapText: true, vertical: "top", horizontal: "left", indent: 1 };
  cellObs.font = { size: 9 };
  aplicarBordas(ws, `R${LIMPEZA_LINHA_INI}:S${LIMPEZA_FIM}`);

  // ─── Linha 41 — Assinaturas dos LÍDERES (3 turnos) ──────────────
  const LINHA_ASSIN_LIDER = LIMPEZA_FIM + 1; // 41
  ws.getRow(LINHA_ASSIN_LIDER).height = 50;

  const blocosLider: { turno: Turno; range: string }[] = [
    { turno: "12x36 Dia", range: `C${LINHA_ASSIN_LIDER}:F${LINHA_ASSIN_LIDER}` },
    { turno: "12x36 Noite", range: `G${LINHA_ASSIN_LIDER}:J${LINHA_ASSIN_LIDER}` },
    { turno: "3º Turno", range: `K${LINHA_ASSIN_LIDER}:N${LINHA_ASSIN_LIDER}` },
  ];

  // Rótulo da linha (B41)
  ws.getCell(`B${LINHA_ASSIN_LIDER}`).value = "Líder:";
  ws.getCell(`B${LINHA_ASSIN_LIDER}`).font = { bold: true, size: 9 };
  ws.getCell(`B${LINHA_ASSIN_LIDER}`).alignment = { horizontal: "right", vertical: "middle" };

  for (const { turno, range } of blocosLider) {
    const [a, b] = range.split(":");
    const m1 = /^([A-Z]+)(\d+)$/.exec(a)!;
    const m2 = /^([A-Z]+)(\d+)$/.exec(b)!;
    const colA = m1[1];
    const row = +m1[2];
    const colB = m2[1];
    mergeCellsIfNeeded(ws, `${colA}${row}:${colB}${row}`);
    const cell = ws.getCell(`${colA}${row}`);
    const lt = opts.limpezaTurnos.find((x) => x.turno === turno);
    const nome = lt?.liderNome ?? "";
    const temAssinaturaLider = !!lt?.assinaturaLider?.dataUrl;
    if (temAssinaturaLider) {
      cell.value = `${rotuloTurnoCurto(turno)} — ${nome}`;
      cell.alignment = { horizontal: "center", vertical: "bottom", wrapText: true };
      cell.font = { size: 7, color: { argb: "FF444444" } };
    } else {
      cell.value = `${rotuloTurnoCurto(turno)}    ____________________________\n${nome}`;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.font = { size: 9 };
    }
    cell.border = BORDA_FINA;
    if (lt?.assinaturaLider?.dataUrl) {
      await inserirImagem(wb, ws, `${colA}${row}:${colB}${row}`, lt.assinaturaLider.dataUrl, {
        larguraFracao: 0.85,
        alturaFracao: 0.78,
        inicioYFracao: 0.02,
      });
    }
  }

  // ─── Linha 42 — Assin. Operador (O/P/Q) ─────────────────────────
  const LINHA_ASSIN_OP = LINHA_ASSIN_LIDER + 1; // 42
  ws.getRow(LINHA_ASSIN_OP).height = 92;

  mergeCellsIfNeeded(ws, `B${LINHA_ASSIN_OP}:N${LINHA_ASSIN_OP}`);
  const cellLeg = ws.getCell(`B${LINHA_ASSIN_OP}`);
  cellLeg.value = "↑ Assinatura dos líderes para validação ↑";
  cellLeg.font = { italic: true, size: 9, bold: true };
  cellLeg.alignment = { horizontal: "center", vertical: "middle" };

  for (const lt of opts.limpezaTurnos) {
    if (opts.turnoFiltro && opts.turnoFiltro !== lt.turno) continue;
    const colNum = colunaLimpezaTurno(lt.turno);
    const colLetra = colNumParaLetra(colNum);
    const cell = ws.getCell(`${colLetra}${LINHA_ASSIN_OP}`);
    const nome = (lt.operadorNome || lt.operadorLogin || "").trim();
    const temAssinatura = !!lt.assinaturaOperador?.dataUrl;
    if (temAssinatura) {
      // Texto fica só com o nome embaixo; imagem ocupa a parte superior.
      cell.value = nome ? `Assin. Oper. →\n${nome}` : "Assin. Oper. →";
      cell.alignment = { horizontal: "center", vertical: "bottom", wrapText: true };
      cell.font = { size: 6, color: { argb: "FF444444" } };
      await inserirImagem(
        wb,
        ws,
        `${colLetra}${LINHA_ASSIN_OP}:${colLetra}${LINHA_ASSIN_OP}`,
        lt.assinaturaOperador!.dataUrl,
        { larguraFracao: 0.98, alturaFracao: 0.7, inicioYFracao: 0.04 },
      );
    } else {
      cell.value = nome ? `Assin. Oper. →\n${nome}` : "Assin. Oper. →";
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.font = { size: 8 };
    }
    cell.border = BORDA_FINA;
  }
  // Garante borda nas células O/P/Q da linha 42 mesmo sem dado
  ["O", "P", "Q"].forEach((c) => {
    const cell = ws.getCell(`${c}${LINHA_ASSIN_OP}`);
    if (!cell.value) {
      cell.value = "Assin. Oper. →";
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.font = { size: 8 };
    }
    cell.border = BORDA_FINA;
  });

  return ws;
}
