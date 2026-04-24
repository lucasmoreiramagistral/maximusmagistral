import ExcelJS from "exceljs";
import {
  LIMPEZA_ITENS_DEF,
  PTP_ITENS,
  PTP_JANELAS,
  janelasPtpDoTurno,
} from "./constants";
import type { LimpezaTurno, PtpJanela } from "./types";
import type { Turno } from "@/lib/checklist/types";
import { colunaPosicionalDoTurno } from "@/lib/operacao/escalas";

// ─────────────────────────────────────────────────────────────────────
// Layout fiel ao Excel oficial "PTP_s_e_CHECKLIST_SALA_DE_ENVASE"
// 1 aba única → PTP no topo + Limpeza embaixo, com assinaturas no final.
// As 3 colunas físicas oficiais do verso (N/O/P para limpeza, e
// G:L / M:R para o cabeçalho do PTP) são mapeadas pelos turnos via
// `colunaPosicionalDoTurno()` da fonte única em escalas.ts:
//   coluna 1 → 12x36 Dia · 1º Turno · Comercial
//   coluna 2 → 12x36 Noite · 2º Turno
//   coluna 3 → 3º Turno
// As janelas PTP (J01..J12) são mapeadas pelo HORÁRIO REAL da escala
// via `janelasPtpDoTurno()`, que aplica fallback de legado por nome.
// ─────────────────────────────────────────────────────────────────────

export const VERSO_SHEET_NAME = "PTP + LIMPEZA L3";

function rotuloTurnoCabecalho(turno: Turno): string {
  // Rótulo "ou" oficial por coluna posicional.
  const col = colunaPosicionalDoTurno(turno);
  if (col === 1) return "1° TURNO ou 12x36 Dia ou Comercial";
  if (col === 2) return "2° TURNO ou 12x36 Noite";
  return "3° TURNO";
}

function rotuloTurnoCurto(turno: Turno): string {
  const col = colunaPosicionalDoTurno(turno);
  if (col === 1) return "1°T ou 12x36 D ou Comerc.";
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

function dataUrlParaArrayBuffer(dataUrl: string): ArrayBuffer | null {
  try {
    const base64 = dataUrl.split(",")[1];
    if (!base64) return null;
    const bin = atob(base64);
    const buf = new ArrayBuffer(bin.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
    return buf;
  } catch {
    return null;
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

/** Coluna no PTP para uma janela específica (J01..J12 → colunas G..R). */
function colunaPtpJanela(codigo: string): number {
  const idx = PTP_JANELAS.findIndex((j) => j.codigo === codigo);
  return 7 + idx; // G=7
}

/** Coluna no Limpeza para um turno específico via coluna posicional:
 *  coluna 1 → N (14)  ·  coluna 2 → O (15)  ·  coluna 3 → P (16). */
function colunaLimpezaTurno(turno: Turno): number {
  const col = colunaPosicionalDoTurno(turno) ?? 1;
  return 13 + col; // N=14, O=15, P=16
}

function inserirImagem(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  rangeAddress: string,
  dataUrl: string,
  opts: { centralizar?: boolean; larguraFracao?: number; alturaFracao?: number } = {},
): void {
  const buf = dataUrlParaArrayBuffer(dataUrl);
  if (!buf) return;
  const id = wb.addImage({ buffer: buf, extension: "png" });
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

  if (opts.centralizar) {
    // Calcula um sub-range centralizado dentro do range fornecido,
    // ocupando "larguraFracao" do bloco horizontal e "alturaFracao" do vertical.
    const lf = opts.larguraFracao ?? 0.6;
    const af = opts.alturaFracao ?? 0.85;
    const padX = (1 - lf) / 2;
    const padY = (1 - af) / 2;
    const tlCol = c1 - 1 + totalCols * padX;
    const brCol = c1 - 1 + totalCols * (padX + lf);
    const tlRow = r1 - 1 + totalRows * padY;
    const brRow = r1 - 1 + totalRows * (padY + af);
    ws.addImage(id, {
      tl: { col: tlCol, row: tlRow },
      br: { col: brCol, row: brRow },
      editAs: "oneCell",
    } as unknown as Parameters<typeof ws.addImage>[1]);
    return;
  }

  ws.addImage(id, {
    tl: { col: c1 - 1 + 0.1, row: r1 - 1 + 0.15 },
    br: { col: c2 - 1 + (c2 - c1 + 1) - 0.1, row: r2 - 1 + (r2 - r1 + 1) - 0.1 },
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

/** Adiciona uma worksheet "VERSO" ao workbook e a preenche fielmente
 *  ao layout oficial. Retorna a worksheet criada. */
export function gerarVersoWorksheet(
  wb: ExcelJS.Workbook,
  opts: GerarVersoOpts,
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(VERSO_SHEET_NAME, {
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true },
  });

  // Larguras de coluna (A..R = 18 colunas)
  const widths = [
    14, 4, 6, 18, 6, 6, // A..F (PTP item descrição/cabeçalhos)
    9, 9, 9, 9, 9, 9, // G..L (J01..J06)
    9, 9, 9, 9, 9, 9, // M..R (J07..J12) — também N/O/P usadas pela limpeza
  ];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  // ─── Cabeçalho geral ───────────────────────────────────────────────
  ws.mergeCells("A1:R1");
  const tit = ws.getCell("A1");
  tit.value = "PLANILHA DE PTP — ENCHEDORA LINHA 3";
  tit.font = { bold: true, size: 14 };
  tit.alignment = { horizontal: "center", vertical: "middle" };
  tit.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE3F2FD" },
  };
  ws.getRow(1).height = 24;

  ws.mergeCells("A3:F3");
  ws.getCell("A3").value = `DATA: ${formatarDataBR(opts.dataOperacao)}`;
  ws.getCell("A3").font = { bold: true };

  ws.mergeCells("G3:L3");
  ws.getCell("G3").value = "n° = quantidade real de ocorrências";
  ws.getCell("G3").alignment = { horizontal: "center" };
  ws.mergeCells("M3:R3");
  ws.getCell("M3").value = "NR = NÃO RODOU   |   ✓ = verificação realizada";
  ws.getCell("M3").alignment = { horizontal: "center" };

  // Operadores por COLUNA POSICIONAL (1/2/3) — extrai por turno do PTP
  // (primeiro nome encontrado nas janelas reais daquela coluna).
  // Se múltiplas escalas caem na mesma coluna (ex: 12x36 Dia + 1º Turno +
  // Comercial → coluna 1), o operador é o primeiro encontrado em qualquer
  // janela coberta por qualquer escala daquela coluna.
  const operadorPorColuna = (col: 1 | 2 | 3): string => {
    // Reúne todos os códigos de janela de qualquer turno cuja coluna
    // posicional bata com `col`.
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
  ws.mergeCells("A4:R4");
  ws.getCell("A4").value = `OPERADOR 1: ${op1}`;
  ws.mergeCells("A5:R5");
  ws.getCell("A5").value = `OPERADOR 2: ${op2}`;
  ws.mergeCells("A6:R6");
  ws.getCell("A6").value = `OPERADOR 3: ${op3}`;

  // ─── PTP — cabeçalhos das janelas ─────────────────────────────────
  // Linha 8: títulos dos turnos
  ws.mergeCells("A8:F9");
  const cabPtp = ws.getCell("A8");
  cabPtp.value =
    "ITEM DE VERIFICAÇÃO NAS GARRAFAS\n(Informe a quantidade quando houver ocorrência)";
  cabPtp.alignment = { wrapText: true, horizontal: "center", vertical: "middle" };
  cabPtp.font = { bold: true, size: 9 };
  cabPtp.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };

  ws.mergeCells("G8:L8");
  ws.getCell("G8").value = rotuloTurnoCabecalho("12x36 Dia");
  ws.mergeCells("M8:R8");
  ws.getCell("M8").value = rotuloTurnoCabecalho("12x36 Noite");
  ["G8", "M8"].forEach((c) => {
    const cell = ws.getCell(c);
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8F5E9" },
    };
  });

  // Linha 9: rótulo de cada janela
  PTP_JANELAS.forEach((j, idx) => {
    const col = colNumParaLetra(7 + idx);
    const cell = ws.getCell(`${col}9`);
    cell.value = j.rotulo;
    cell.font = { size: 8 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF5F5F5" },
    };
  });
  ws.getRow(9).height = 28;

  // ─── PTP — 5 itens × 12 janelas ───────────────────────────────────
  const PTP_LINHA_INI = 10;
  PTP_ITENS.forEach((itemDef, iIdx) => {
    const linha = PTP_LINHA_INI + iIdx;
    ws.mergeCells(`A${linha}:F${linha}`);
    const cellNome = ws.getCell(`A${linha}`);
    cellNome.value = itemDef.nome;
    cellNome.font = { bold: true, size: 10 };
    cellNome.alignment = { vertical: "middle", horizontal: "left", wrapText: true };

    PTP_JANELAS.forEach((j) => {
      const colNum = colunaPtpJanela(j.codigo);
      const cell = ws.getCell(linha, colNum);
      cell.alignment = { horizontal: "center", vertical: "middle" };

      const janela = opts.ptpJanelas.find(
        (x) => x.janelaCodigo === j.codigo,
      );
      // Filtro de turno: se setado, só preenche janelas daquele turno
      // (mapeadas por horário real via fonte única).
      const codigosTurno = opts.turnoFiltro
        ? janelasPtpDoTurno(opts.turnoFiltro, null as never)
        : null;
      if (codigosTurno && !codigosTurno.includes(j.codigo)) return;

      if (!janela || janela.statusJanela === "pendente" || janela.statusJanela === "rascunho") {
        return;
      }
      if (janela.statusJanela === "nao_rodou") {
        cell.value = "NR";
        cell.font = { italic: true, color: { argb: "FF777777" } };
        return;
      }
      if (janela.statusJanela === "sem_ocorrencia") {
        cell.value = "X";
        cell.font = { bold: true, color: { argb: "FF2E7D32" } };
        return;
      }
      // houve_ocorrencia: pega quantidade do item
      const it = janela.itens.find((x) => x.codigo === itemDef.codigo);
      if (it && it.status === "houve_ocorrencia" && it.quantidade > 0) {
        cell.value = it.quantidade;
        cell.font = { bold: true, color: { argb: "FFC62828" } };
      } else {
        cell.value = "X";
        cell.font = { bold: true, color: { argb: "FF2E7D32" } };
      }
    });
  });

  // ─── PTP — linha "Visto" por janela ───────────────────────────────
  const LINHA_VISTO = PTP_LINHA_INI + PTP_ITENS.length; // 15
  ws.mergeCells(`A${LINHA_VISTO}:F${LINHA_VISTO}`);
  const cellVisto = ws.getCell(`A${LINHA_VISTO}`);
  cellVisto.value =
    "Operador(a), assinar a cada preenchimento e anotar observações no verso quando necessário.";
  cellVisto.font = { italic: true, size: 8 };
  cellVisto.alignment = { wrapText: true, vertical: "middle" };
  PTP_JANELAS.forEach((j) => {
    const colNum = colunaPtpJanela(j.codigo);
    const cell = ws.getCell(LINHA_VISTO, colNum);
    const janela = opts.ptpJanelas.find((x) => x.janelaCodigo === j.codigo);
    const codigosTurno = opts.turnoFiltro
      ? janelasPtpDoTurno(opts.turnoFiltro, null as never)
      : null;
    if (codigosTurno && !codigosTurno.includes(j.codigo)) {
      cell.value = "Visto:";
      return;
    }
    const nome = (janela?.operadorNome || janela?.operadorLogin || "").trim();
    cell.value = nome ? `Visto: ${nome}` : "Visto:";
    cell.font = { size: 7 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    if (janela?.assinaturaOperador?.dataUrl) {
      const colLetra = colNumParaLetra(colNum);
      inserirImagem(wb, ws, `${colLetra}${LINHA_VISTO}:${colLetra}${LINHA_VISTO}`, janela.assinaturaOperador.dataUrl, {
        centralizar: true,
        larguraFracao: 0.85,
        alturaFracao: 0.7,
      });
    }
  });
  ws.getRow(LINHA_VISTO).height = 36;

  aplicarBordas(ws, `A8:R${LINHA_VISTO}`);

  // ─── Limpeza — cabeçalho ──────────────────────────────────────────
  const LIMPEZA_INI = LINHA_VISTO + 2; // gap
  ws.mergeCells(`A${LIMPEZA_INI}:M${LIMPEZA_INI}`);
  const cabL = ws.getCell(`A${LIMPEZA_INI}`);
  cabL.value = "CHECKLIST OPERACIONAL DE LIMPEZA DA SALA DE ENVASE L3";
  cabL.font = { bold: true, size: 12 };
  cabL.alignment = { horizontal: "center", vertical: "middle" };
  cabL.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
  ws.mergeCells(`N${LIMPEZA_INI}:P${LIMPEZA_INI}`);
  ws.getCell(`N${LIMPEZA_INI}`).value = "✓ = Realizado / NA   |   ✗ = Não realizado";
  ws.getCell(`N${LIMPEZA_INI}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`N${LIMPEZA_INI}`).font = { size: 8 };
  ws.mergeCells(`Q${LIMPEZA_INI}:R${LIMPEZA_INI}`);
  ws.getCell(`Q${LIMPEZA_INI}`).value =
    "Código Doc.: FM28 PSGQ07\nRev.: 00";
  ws.getCell(`Q${LIMPEZA_INI}`).alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  ws.getCell(`Q${LIMPEZA_INI}`).font = { size: 8 };

  // Cabeçalho da tabela de limpeza
  const LIMPEZA_HDR = LIMPEZA_INI + 1;
  ws.getCell(`A${LIMPEZA_HDR}`).value = "LOCAL";
  ws.getCell(`B${LIMPEZA_HDR}`).value = "ITEM";
  ws.mergeCells(`C${LIMPEZA_HDR}:D${LIMPEZA_HDR}`);
  ws.getCell(`C${LIMPEZA_HDR}`).value = "SEÇÃO";
  ws.mergeCells(`E${LIMPEZA_HDR}:M${LIMPEZA_HDR}`);
  ws.getCell(`E${LIMPEZA_HDR}`).value = "DESCRIÇÃO";
  ws.getCell(`N${LIMPEZA_HDR}`).value = rotuloTurnoCurto("12x36 Dia");
  ws.getCell(`O${LIMPEZA_HDR}`).value = rotuloTurnoCurto("12x36 Noite");
  ws.getCell(`P${LIMPEZA_HDR}`).value = rotuloTurnoCurto("3º Turno");
  ws.mergeCells(`Q${LIMPEZA_HDR}:R${LIMPEZA_HDR}`);
  ws.getCell(`Q${LIMPEZA_HDR}`).value = "Observações do líder";
  ["A", "B", "C", "E", "N", "O", "P", "Q"].forEach((c) => {
    const cell = ws.getCell(`${c}${LIMPEZA_HDR}`);
    cell.font = { bold: true, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
  });

  // Itens da limpeza
  const LIMPEZA_LINHA_INI = LIMPEZA_HDR + 1;
  LIMPEZA_ITENS_DEF.forEach((it, idx) => {
    const linha = LIMPEZA_LINHA_INI + idx;
    ws.getCell(`A${linha}`).value = it.grupo;
    ws.getCell(`B${linha}`).value = it.codigo;
    ws.mergeCells(`C${linha}:D${linha}`);
    ws.getCell(`C${linha}`).value = it.secao;
    ws.mergeCells(`E${linha}:M${linha}`);
    ws.getCell(`E${linha}`).value = it.descricao;

    ["A", "B", "C", "E"].forEach((c) => {
      const cell = ws.getCell(`${c}${linha}`);
      cell.alignment = { vertical: "middle", wrapText: true, horizontal: c === "E" ? "left" : "center" };
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
        cell.font = { bold: true, color: { argb: "FF2E7D32" } };
      } else {
        cell.value = "✗";
        cell.font = { bold: true, color: { argb: "FFC62828" } };
      }
    }
  });

  const LIMPEZA_FIM = LIMPEZA_LINHA_INI + LIMPEZA_ITENS_DEF.length - 1;
  aplicarBordas(ws, `A${LIMPEZA_HDR}:R${LIMPEZA_FIM}`);

  // ─── Assinaturas líder × operador por turno ───────────────────────
  const ASSIN_INI = LIMPEZA_FIM + 2;
  ws.getRow(ASSIN_INI).height = 14;
  ws.getRow(ASSIN_INI + 1).height = 60;
  ws.getRow(ASSIN_INI + 2).height = 14;

  const blocos: { turno: Turno; range: string; rangeAssOp: string }[] = [
    { turno: "12x36 Dia", range: `A${ASSIN_INI}:F${ASSIN_INI + 2}`, rangeAssOp: `N${ASSIN_INI + 1}:N${ASSIN_INI + 1}` },
    { turno: "12x36 Noite", range: `G${ASSIN_INI}:L${ASSIN_INI + 2}`, rangeAssOp: `O${ASSIN_INI + 1}:O${ASSIN_INI + 1}` },
    { turno: "3º Turno", range: `M${ASSIN_INI}:R${ASSIN_INI + 2}`, rangeAssOp: `P${ASSIN_INI + 1}:P${ASSIN_INI + 1}` },
  ];

  blocos.forEach(({ turno, range }) => {
    const [a, b] = range.split(":");
    const m1 = /^([A-Z]+)(\d+)$/.exec(a)!;
    const m2 = /^([A-Z]+)(\d+)$/.exec(b)!;
    const colA = m1[1];
    const rowTopo = +m1[2];
    const colB = m2[1];
    // Topo: rótulo do turno
    ws.mergeCells(`${colA}${rowTopo}:${colB}${rowTopo}`);
    ws.getCell(`${colA}${rowTopo}`).value = rotuloTurnoCurto(turno);
    ws.getCell(`${colA}${rowTopo}`).font = { bold: true, size: 9 };
    ws.getCell(`${colA}${rowTopo}`).alignment = { horizontal: "center", vertical: "middle" };
    // Meio: assinatura do líder (área para imagem) + nome
    ws.mergeCells(`${colA}${rowTopo + 1}:${colB}${rowTopo + 1}`);
    const lt = opts.limpezaTurnos.find((x) => x.turno === turno);
    const cellMeio = ws.getCell(`${colA}${rowTopo + 1}`);
    cellMeio.alignment = { horizontal: "center", vertical: "bottom", wrapText: true };
    cellMeio.font = { size: 9 };
    if (lt?.liderNome) {
      cellMeio.value = `_____________________________\n${lt.liderNome}`;
    } else {
      cellMeio.value = "_____________________________";
    }
    if (lt?.assinaturaLider?.dataUrl) {
      inserirImagem(wb, ws, `${colA}${rowTopo + 1}:${colB}${rowTopo + 1}`, lt.assinaturaLider.dataUrl, {
        centralizar: true,
        larguraFracao: 0.55,
        alturaFracao: 0.7,
      });
    }
    // Base: legenda
    ws.mergeCells(`${colA}${rowTopo + 2}:${colB}${rowTopo + 2}`);
    ws.getCell(`${colA}${rowTopo + 2}`).value = "↑ Assinatura do líder ↑";
    ws.getCell(`${colA}${rowTopo + 2}`).font = { italic: true, size: 8 };
    ws.getCell(`${colA}${rowTopo + 2}`).alignment = { horizontal: "center" };
  });

  // Linha extra: assinaturas do operador POR TURNO COM DADO (modelo lazy).
  const ASSIN_OP_LINHA = ASSIN_INI + 4;
  ws.getRow(ASSIN_OP_LINHA).height = 50;
  for (const lt of opts.limpezaTurnos) {
    if (opts.turnoFiltro && opts.turnoFiltro !== lt.turno) continue;
    const colNum = colunaLimpezaTurno(lt.turno);
    const colLetra = colNumParaLetra(colNum);
    const cell = ws.getCell(`${colLetra}${ASSIN_OP_LINHA}`);
    const nome = (lt.operadorNome || lt.operadorLogin || "").trim();
    cell.value = nome ? `Assin. Oper. → ${nome}` : "Assin. Oper. →";
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.font = { size: 8 };
    if (lt.assinaturaOperador?.dataUrl) {
      inserirImagem(
        wb,
        ws,
        `${colLetra}${ASSIN_OP_LINHA}:${colLetra}${ASSIN_OP_LINHA}`,
        lt.assinaturaOperador.dataUrl,
        { centralizar: true, larguraFracao: 0.85, alturaFracao: 0.85 },
      );
    }
  }

  // Observações livres do verso (PTP + Limpeza), agrupadas por turno
  const OBS_INI = ASSIN_OP_LINHA + 2;
  ws.mergeCells(`A${OBS_INI}:R${OBS_INI}`);
  const cabO = ws.getCell(`A${OBS_INI}`);
  cabO.value = "OBSERVAÇÕES DO VERSO (PTP + LIMPEZA)";
  cabO.font = { bold: true, size: 11 };
  cabO.alignment = { horizontal: "center", vertical: "middle" };
  cabO.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8E1" } };

  const linhasObs: string[] = [];
  for (const j of opts.ptpJanelas) {
    if (j.observacao && j.observacao.trim()) {
      linhasObs.push(`[PTP ${j.janelaCodigo} ${j.janelaInicio}-${j.janelaFim}] ${j.observacao.trim()}`);
    }
  }
  for (const t of opts.limpezaTurnos) {
    if (t.observacao && t.observacao.trim()) {
      linhasObs.push(`[Limpeza ${rotuloTurnoCurto(t.turno)}] ${t.observacao.trim()}`);
    }
  }
  if (linhasObs.length === 0) linhasObs.push("(sem observações registradas)");
  linhasObs.forEach((txt, i) => {
    const linha = OBS_INI + 1 + i;
    ws.mergeCells(`A${linha}:R${linha}`);
    const cell = ws.getCell(`A${linha}`);
    cell.value = txt;
    cell.alignment = { wrapText: true, vertical: "middle" };
    cell.font = { size: 9 };
  });

  return ws;
}
