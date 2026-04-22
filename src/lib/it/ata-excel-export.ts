// ============================================================
// Exportação Excel da Ata de Treinamento na Função.
// Preenche o template oficial FM 01 PSGQ 05 (linhas 8-29) com:
// Nº | Nome completo | Turno | Data | Assinatura do instrutor
// ============================================================

import ExcelJS from "exceljs";
import type { AtaTreinamento, AtaDocumento } from "./atas";
import templateIt002Url from "@/assets/templates/ata-it002.xlsx?url";
import templateIt005Url from "@/assets/templates/ata-it005.xlsx?url";

const TEMPLATE_URL: Record<AtaDocumento, string> = {
  it002: templateIt002Url,
  it005: templateIt005Url,
};

const NOME_ARQUIVO: Record<AtaDocumento, string> = {
  it002: "Ata_Treinamento_IT002_Operacao_Enchedora_L3",
  it005: "Ata_Treinamento_IT005_Limpeza_Enchedora_L3",
};

function formatarDataBr(iso: string): string {
  // iso = YYYY-MM-DD
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function dataUrlParaBuffer(dataUrl: string): { buffer: ArrayBuffer; ext: "png" | "jpeg" } {
  const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error("Assinatura em formato inválido");
  const ext = m[1].toLowerCase() === "png" ? "png" : "jpeg";
  const bin = atob(m[2]);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return { buffer: buf.buffer, ext };
}

/**
 * Gera e dispara o download do .xlsx da ata de um documento.
 * Carrega o template, preenche linhas 8 em diante, salva.
 */
export async function exportarAtaExcel(
  documento: AtaDocumento,
  atas: AtaTreinamento[],
): Promise<void> {
  const url = TEMPLATE_URL[documento];
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Falha ao carregar template (${resp.status})`);
  const arrayBuffer = await resp.arrayBuffer();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const ws = wb.getWorksheet("TREINAMENTO NA FUNÇÃO") ?? wb.worksheets[0];
  if (!ws) throw new Error("Planilha não encontrada no template");

  // O template tem G8:I29 mergeado (uma assinatura única). Vamos desmergear
  // para colocar uma assinatura por linha.
  try {
    ws.unMergeCells("G8:I29");
  } catch {
    /* já desmergeado */
  }

  // Preencher 22 linhas (8..29). Cada ata ocupa uma linha.
  const MAX_LINHAS = 22;
  const ordenadas = [...atas]
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
    .slice(0, MAX_LINHAS);

  for (let i = 0; i < ordenadas.length; i++) {
    const ata = ordenadas[i];
    const rowIdx = 8 + i;
    const row = ws.getRow(rowIdx);
    row.height = 36;

    // B (mergeado B:D) — Nome
    ws.getCell(`B${rowIdx}`).value = ata.operadorNome;
    ws.getCell(`B${rowIdx}`).alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: true,
      indent: 1,
    };
    ws.getCell(`B${rowIdx}`).font = { name: "Arial", size: 10 };

    // E — Turno
    ws.getCell(`E${rowIdx}`).value = ata.turno;
    ws.getCell(`E${rowIdx}`).alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    ws.getCell(`E${rowIdx}`).font = { name: "Arial", size: 10 };

    // F — Data
    ws.getCell(`F${rowIdx}`).value = formatarDataBr(ata.dataTreinamento);
    ws.getCell(`F${rowIdx}`).alignment = {
      vertical: "middle",
      horizontal: "center",
    };
    ws.getCell(`F${rowIdx}`).font = { name: "Arial", size: 10 };

    // G..I — Assinatura (imagem)
    try {
      const { buffer, ext } = dataUrlParaBuffer(ata.instrutorAssinatura);
      const imgId = wb.addImage({ buffer: buffer as ArrayBuffer, extension: ext });
      // Posiciona a imagem dentro do "retângulo" G(rowIdx) até I(rowIdx)
      // ExcelJS usa coordenadas zero-based: col G = 6, row N = N-1
      ws.addImage(imgId, {
        tl: { col: 6.05, row: rowIdx - 1 + 0.05 } as any,
        br: { col: 9 - 0.05, row: rowIdx - 0.05 } as any,
        editAs: "oneCell",
      });
    } catch (e) {
      console.error("[ata-excel] erro ao inserir assinatura", e);
    }
  }

  const out = await wb.xlsx.writeBuffer();
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const link = document.createElement("a");
  const dataStr = new Date().toISOString().slice(0, 10);
  link.href = URL.createObjectURL(blob);
  link.download = `${NOME_ARQUIVO[documento]}_${dataStr}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
