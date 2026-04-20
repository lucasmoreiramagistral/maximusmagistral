import ExcelJS from "exceljs";
import { ITENS_CHECKLIST } from "./itens";
import type {
  Anomalia,
  Checklist,
  FolhaChecklistDia,
  RespostaItem,
  Turno,
} from "./types";

const TEMPLATE_URL = "/templates/09%20FM%20CHECKLIST%20OPERACIONAL.xlsx";
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
}

const MAPA_TURNOS: Record<Turno, MapaTurno> = {
  "12x36 Dia":   { colValor: "D", colHora: "E", cellAssinatura: "D28" },
  "12x36 Noite": { colValor: "F", colHora: "G", cellAssinatura: "F28" },
  "3º Turno":    { colValor: "H", colHora: "I", cellAssinatura: "H28" },
};

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

async function carregarTemplate(): Promise<ExcelJS.Workbook> {
  const resp = await fetch(TEMPLATE_URL);
  if (!resp.ok) {
    throw new Error("Template oficial do Excel não encontrado.");
  }
  const buf = await resp.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
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

function nomeDoOperador(c: Checklist): string {
  return (
    c.operadorResponsavel?.trim() ||
    c.operador?.trim() ||
    c.operadorLogin?.trim() ||
    ""
  );
}

/** Snapshot dos rótulos originais das células de assinatura, antes de
 *  qualquer escrita, para que possamos reescrever sem duplicar. */
function snapshotRotulosAssinatura(ws: ExcelJS.Worksheet): Record<Turno, string> {
  return {
    "12x36 Dia": String(ws.getCell(MAPA_TURNOS["12x36 Dia"].cellAssinatura).value ?? ""),
    "12x36 Noite": String(ws.getCell(MAPA_TURNOS["12x36 Noite"].cellAssinatura).value ?? ""),
    "3º Turno": String(ws.getCell(MAPA_TURNOS["3º Turno"].cellAssinatura).value ?? ""),
  };
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
 *  USA APENAS os dados atuais da folha/checklist — nunca histórico de auditoria. */
function coletarObservacoesPorTurno(
  checklists: Checklist[],
  anomalias: Anomalia[],
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
    const grupo = getGrupo(c.contexto.turno);
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
    const grupo = getGrupo(a.turno);
    grupo.anomalias.push(textoAnomalia(a));
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

function baixarBlob(buffer: ArrayBuffer, nomeArquivo: string): void {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function nomeArquivo(folha: FolhaChecklistDia, modo: "turno" | "dia"): string {
  const data = folha.contexto.data;
  const turno = modo === "turno" ? sanitizarArquivo(folha.contexto.turno) : "FOLHA-DIA";
  const equipe = sanitizarArquivo(folha.contexto.equipe);
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
  const mapa = MAPA_TURNOS[turno];
  const concluidos = checklistsConcluidos(folha);
  for (const c of concluidos) {
    preencherRespostasChecklist(ws, c, mapa);
  }

  const nomeOp = concluidos.map(nomeDoOperador).find((n) => n.length > 0) ?? "";
  preencherAssinaturaOperador(ws, mapa, nomeOp, rotulos[turno]);

  const grupos = coletarObservacoesPorTurno(concluidos, anomalias);
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
    const mapa = MAPA_TURNOS[f.contexto.turno];
    const concluidos = checklistsConcluidos(f);
    for (const c of concluidos) {
      preencherRespostasChecklist(ws, c, mapa);
    }
    const nomeOp = concluidos.map(nomeDoOperador).find((n) => n.length > 0) ?? "";
    preencherAssinaturaOperador(ws, mapa, nomeOp, rotulos[f.contexto.turno]);
    todosChecklistsConcluidos.push(...concluidos);
  }

  const grupos = coletarObservacoesPorTurno(todosChecklistsConcluidos, anomalias);
  const segmentos = montarSegmentosObservacoes(grupos);
  preencherObservacoesSegmentadas(ws, segmentos);

  removerProtecoes(wb);
  const buf = await wb.xlsx.writeBuffer();
  baixarBlob(buf as ArrayBuffer, nomeArquivo(folhaAtual, "dia"));
}
