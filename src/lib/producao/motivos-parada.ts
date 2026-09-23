/**
 * Motivos principais vistos nos relatórios horários da enchedora e da
 * empacotadora. O código é estável para análise histórica; o rótulo pode
 * melhorar sem reclassificar os lançamentos já confirmados.
 */
export const MOTIVOS_PARADA = [
  { codigo: "parada_sopradora", rotulo: "Sopradora / Óptima", grupo: "Outra máquina da linha", tipo: "todas" },
  { codigo: "sopradora_engate_saida", rotulo: "Sopradora: engate na saída", grupo: "Outra máquina da linha", tipo: "todas" },
  { codigo: "sopradora_forno_preforma", rotulo: "Sopradora: forno / pré-forma", grupo: "Outra máquina da linha", tipo: "todas" },
  { codigo: "sopradora_eixo_servo", rotulo: "Sopradora: eixo / servo", grupo: "Outra máquina da linha", tipo: "todas" },
  { codigo: "parada_enchedora", rotulo: "Enchedora", grupo: "Outra máquina da linha", tipo: "empacotadora" },
  { codigo: "parada_rotuladora", rotulo: "Rotuladora", grupo: "Outra máquina da linha", tipo: "todas" },
  { codigo: "rotuladora_marca_corte", rotulo: "Rotuladora: marca de corte / rótulo", grupo: "Outra máquina da linha", tipo: "todas" },
  { codigo: "falha_codificacao", rotulo: "Codificador / datador", grupo: "Outra máquina da linha", tipo: "todas" },
  { codigo: "transporte_aereo", rotulo: "Transporte aéreo / TPA", grupo: "Outra máquina da linha", tipo: "todas" },
  { codigo: "parada_empacotadora", rotulo: "Empacotadora", grupo: "Outra máquina da linha", tipo: "enchedora" },
  { codigo: "ajuste_enchedora", rotulo: "Ajuste operacional da enchedora", grupo: "Própria máquina", tipo: "enchedora" },
  { codigo: "falha_enchedora", rotulo: "Falha da enchedora", grupo: "Própria máquina", tipo: "enchedora" },
  { codigo: "falha_carbonatacao", rotulo: "CO₂ / carbonatação", grupo: "Própria máquina", tipo: "enchedora" },
  { codigo: "ajuste_empacotadora", rotulo: "Ajuste operacional da empacotadora", grupo: "Própria máquina", tipo: "empacotadora" },
  { codigo: "falha_empacotadora", rotulo: "Falha da empacotadora", grupo: "Própria máquina", tipo: "empacotadora" },
  { codigo: "troca_bobina_filme", rotulo: "Troca de bobina de filme", grupo: "Própria máquina", tipo: "empacotadora" },
  { codigo: "filme_selagem", rotulo: "Filme / selagem", grupo: "Própria máquina", tipo: "empacotadora" },
  { codigo: "esteira_transporte", rotulo: "Esteira / transporte de pacotes", grupo: "Própria máquina", tipo: "empacotadora" },
  { codigo: "paletizacao", rotulo: "Paletização", grupo: "Própria máquina", tipo: "empacotadora" },
  { codigo: "troca_sabor", rotulo: "Troca de sabor", grupo: "Setup e rotina", tipo: "todas" },
  { codigo: "troca_tamanho", rotulo: "Troca de tamanho", grupo: "Setup e rotina", tipo: "todas" },
  { codigo: "cip_assepsia", rotulo: "CIP / assepsia", grupo: "Setup e rotina", tipo: "enchedora" },
  { codigo: "limpeza", rotulo: "Limpeza", grupo: "Setup e rotina", tipo: "todas" },
  { codigo: "refeicao", rotulo: "Refeição", grupo: "Setup e rotina", tipo: "todas" },
  { codigo: "inventario", rotulo: "Inventário", grupo: "Setup e rotina", tipo: "todas" },
  { codigo: "troca_turno", rotulo: "Troca de turno", grupo: "Setup e rotina", tipo: "todas" },
  { codigo: "falta_garrafas", rotulo: "Falta de garrafas", grupo: "Insumos e externas", tipo: "enchedora" },
  { codigo: "falta_tampas", rotulo: "Falta de tampas", grupo: "Insumos e externas", tipo: "enchedora" },
  { codigo: "falta_xarope", rotulo: "Falta de xarope / produto", grupo: "Insumos e externas", tipo: "enchedora" },
  { codigo: "falta_filme", rotulo: "Falta de filme", grupo: "Insumos e externas", tipo: "empacotadora" },
  { codigo: "falta_efetivo", rotulo: "Falta de efetivo", grupo: "Insumos e externas", tipo: "todas" },
  { codigo: "falta_energia", rotulo: "Falta de energia", grupo: "Insumos e externas", tipo: "todas" },
  { codigo: "baixa_pressao_ar", rotulo: "Baixa pressão de ar", grupo: "Insumos e externas", tipo: "todas" },
  { codigo: "aguardando_qualidade", rotulo: "Aguardando Qualidade", grupo: "Insumos e externas", tipo: "todas" },
  { codigo: "sem_programacao", rotulo: "Sem programação de produção", grupo: "Insumos e externas", tipo: "todas" },
  { codigo: "manutencao_planejada", rotulo: "Manutenção programada", grupo: "Insumos e externas", tipo: "todas" },
  { codigo: "nao_identificado", rotulo: "Causa ainda não identificada", grupo: "A esclarecer", tipo: "todas" },
  { codigo: "outro_nao_listado", rotulo: "Outro motivo não listado", grupo: "A esclarecer", tipo: "todas" },
] as const;

export type MotivoParadaCodigo = (typeof MOTIVOS_PARADA)[number]["codigo"];
export type TipoMaquinaParada = "enchedora" | "empacotadora";

export function motivosParaMaquina(tipo: TipoMaquinaParada) {
  return MOTIVOS_PARADA.filter((motivo) => motivo.tipo === "todas" || motivo.tipo === tipo);
}

export function motivoParadaValido(codigo: string, tipo: TipoMaquinaParada): codigo is MotivoParadaCodigo {
  return motivosParaMaquina(tipo).some((motivo) => motivo.codigo === codigo);
}

export function rotuloMotivoParada(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  return MOTIVOS_PARADA.find((motivo) => motivo.codigo === codigo)?.rotulo ?? codigo;
}
