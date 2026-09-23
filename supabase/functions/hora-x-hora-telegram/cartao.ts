export const MAQUINAS_CARD = [
  { nome: "Enchedora 2", unidade: "garrafas", linha: "L2" },
  { nome: "Empacotadora 2", unidade: "pacotes", linha: "L2" },
  { nome: "Enchedora 3", unidade: "garrafas", linha: "L3" },
  { nome: "Empacotadora 3", unidade: "pacotes", linha: "L3" },
] as const;

export interface PeriodoCard {
  dataOperacao: string;
  dataCalendario: string;
  horaCodigo: string;
  inicio: string;
  fim: string;
  corteEm: string;
}

export interface RegistroCard {
  maquina: string;
  quantidade: number;
  tempo_parada_min: number | null;
  motivo_parada_codigo: string | null;
  operador_nome: string | null;
}

function partesManaus(agora: Date) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Manaus", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(agora);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((item) => item.type === tipo)?.value ?? "";
  return { data: `${parte("year")}-${parte("month")}-${parte("day")}`,
    hora: Number(parte("hour")), minuto: Number(parte("minute")) };
}

/** HH:20 fecha a hora anterior; 06:20 fecha H24 do dia operacional anterior. */
export function periodoParaPublicar(agora: Date): PeriodoCard | null {
  const local = partesManaus(agora);
  if (local.minuto < 20 || local.minuto > 29) return null;
  const inicioHora = (local.hora + 23) % 24;
  const indice = ((inicioHora - 6 + 24) % 24) + 1;
  const data = new Date(`${local.data}T12:00:00Z`);
  if (local.hora <= 6) data.setUTCDate(data.getUTCDate() - 1);
  const calendario = new Date(`${local.data}T12:00:00Z`);
  if (local.hora === 0) calendario.setUTCDate(calendario.getUTCDate() - 1);
  const corte = new Date(agora);
  corte.setUTCMinutes(20, 0, 0);
  return {
    dataOperacao: data.toISOString().slice(0, 10),
    dataCalendario: calendario.toISOString().slice(0, 10),
    horaCodigo: `H${String(indice).padStart(2, "0")}`,
    inicio: `${String(inicioHora).padStart(2, "0")}:00`,
    fim: `${String(local.hora).padStart(2, "0")}:00`,
    corteEm: corte.toISOString(),
  };
}

const ROTULOS_MOTIVOS: Record<string, string> = {
  parada_sopradora: "Sopradora / Óptima", parada_enchedora: "Enchedora",
  sopradora_engate_saida: "Sopradora: engate na saída",
  sopradora_forno_preforma: "Sopradora: forno / pré-forma",
  sopradora_eixo_servo: "Sopradora: eixo / servo",
  parada_rotuladora: "Rotuladora", rotuladora_marca_corte: "Rotuladora: marca de corte / rótulo",
  falha_codificacao: "Codificador / datador", transporte_aereo: "Transporte aéreo / TPA",
  parada_empacotadora: "Empacotadora",
  ajuste_enchedora: "Ajuste da enchedora", falha_enchedora: "Falha da enchedora",
  ajuste_empacotadora: "Ajuste da empacotadora", falha_empacotadora: "Falha da empacotadora",
  falha_carbonatacao: "CO₂ / carbonatação", baixa_pressao_ar: "Baixa pressão de ar",
  troca_bobina_filme: "Troca de bobina", filme_selagem: "Filme / selagem",
  esteira_transporte: "Esteira / transporte", paletizacao: "Paletização",
  troca_sabor: "Troca de sabor", troca_tamanho: "Troca de tamanho",
  cip_assepsia: "CIP / assepsia", limpeza: "Limpeza", refeicao: "Refeição",
  inventario: "Inventário", troca_turno: "Troca de turno",
  falta_garrafas: "Falta de garrafas", falta_tampas: "Falta de tampas",
  falta_xarope: "Falta de xarope / produto", falta_filme: "Falta de filme",
  falta_efetivo: "Falta de efetivo", falta_energia: "Falta de energia",
  aguardando_qualidade: "Aguardando Qualidade", sem_programacao: "Sem programação",
  manutencao_planejada: "Manutenção programada", nao_identificado: "Causa não identificada",
  outro_nao_listado: "Outro motivo não listado",
};

export function temRotuloTelegram(codigo: string): boolean {
  return codigo in ROTULOS_MOTIVOS;
}

function html(valor: string): string {
  return valor.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function montarCard(periodo: PeriodoCard, registros: readonly RegistroCard[]): string {
  const [ano, mes, dia] = periodo.dataCalendario.split("-");
  const [anoOperacao, mesOperacao, diaOperacao] = periodo.dataOperacao.split("-");
  const porMaquina = new Map(registros.map((item) => [item.maquina, item]));
  const linhas = [
    "<b>PRODUÇÃO · HORA FECHADA</b>",
    `<code>${periodo.inicio.slice(0, 2)}h–${periodo.fim.slice(0, 2)}h | ${dia}/${mes}/${ano}</code>`,
  ];
  for (const linha of ["L2", "L3"] as const) {
    linhas.push("", `<b>LINHA ${linha.slice(1)}</b>`);
    for (const maquina of MAQUINAS_CARD.filter((item) => item.linha === linha)) {
      const registro = porMaquina.get(maquina.nome);
      if (!registro) {
        linhas.push(`<b>${maquina.nome}</b> · Não realizado`);
        continue;
      }
      const parada = registro.tempo_parada_min;
      const motivo = registro.motivo_parada_codigo
        ? (ROTULOS_MOTIVOS[registro.motivo_parada_codigo] ?? "Código não reconhecido")
        : parada === null ? "Cadência não informada" : parada > 0 ? "Não informado" : "Sem perda pela cadência";
      linhas.push(
        `<b>${maquina.nome}</b> · ${registro.quantidade.toLocaleString("pt-BR")} ${maquina.unidade}`,
        `Perda equivalente: ${parada === null ? "—" : `${parada} min`} · ${html(motivo)}`,
        `Operador: ${html(registro.operador_nome ?? "Não informado")}`,
      );
    }
  }
  linhas.push("", `<i>Dia operacional ${diaOperacao}/${mesOperacao}/${anoOperacao} · corte às :20. Minutos pela cadência, não parada cronometrada.</i>`);
  return linhas.join("\n");
}

export function urlPainel(periodo: PeriodoCard, baseUrl: string): string {
  const url = new URL("/gestao/hora-x-hora", baseUrl);
  url.searchParams.set("data", periodo.dataOperacao);
  url.searchParams.set("hora", periodo.horaCodigo);
  return url.toString();
}
