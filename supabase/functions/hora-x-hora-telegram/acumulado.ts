export interface HoraParaAcumulado {
  maquina: string;
  hora_codigo: string;
  quantidade: number | null;
  reinicia_acumulado?: boolean | null;
}

/** Mesma regra do formulário da Filial: turno de 12h e reinício por setup/CIP. */
export function acumuladosPorHora(horas: readonly HoraParaAcumulado[]): Map<string, number> {
  const unicas = new Map<string, HoraParaAcumulado>();
  for (const hora of horas) {
    if (!/^H(0[1-9]|1[0-9]|2[0-4])$/.test(hora.hora_codigo) ||
        typeof hora.quantidade !== "number" || !Number.isFinite(hora.quantidade) ||
        hora.quantidade < 0) continue;
    const chave = `${hora.maquina}:${hora.hora_codigo}`;
    if (!unicas.has(chave)) unicas.set(chave, hora);
  }

  const resultado = new Map<string, number>();
  const maquinas = new Set([...unicas.values()].map((hora) => hora.maquina));
  for (const maquina of maquinas) {
    let acumulado = 0;
    for (let indice = 1; indice <= 24; indice++) {
      const codigo = `H${String(indice).padStart(2, "0")}`;
      if (indice === 1 || indice === 13) acumulado = 0;
      const chave = `${maquina}:${codigo}`;
      const hora = unicas.get(chave);
      if (!hora) continue;
      if (hora.reinicia_acumulado) acumulado = 0;
      acumulado += hora.quantidade!;
      resultado.set(chave, acumulado);
    }
  }
  return resultado;
}
