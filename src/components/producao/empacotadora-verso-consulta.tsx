/** Campos operacionais exibidos no verso de leitura do Hora x Hora. */
export interface BobinaConsulta {
  maquina: string;
  turno: string;
  ordem: number;
  dataOperacao: string;
  produto: string | null;
  especificacaoFilme: string | null;
  fabricante: string | null;
  numeroLote: string | null;
  pesoLiquidoInicialKg: number | null;
  pesoBrutoFinalKg: number | null;
  horaInicio: string | null;
  horaTermino: string | null;
  dataTerminoOperacao: string | null;
}

export interface ConsolidacaoConsulta {
  maquina: string;
  turno: string;
  ordem: number;
  sabor: string | null;
  tamanho: string | null;
  horaInicio: string | null;
  horaFinal: string | null;
  quantidadePaletes: number | null;
  quebraPacotes: number | null;
  pacotesPorPalete: number | null;
  totalPacotes: number | null;
}

export interface VersoEmpacotadoraConsulta {
  bobinas: BobinaConsulta[];
  consolidacoes: ConsolidacaoConsulta[];
}

function texto(valor: string | number | null | undefined): string {
  return valor === null || valor === undefined || valor === "" ? "—" : String(valor);
}

function numero(valor: number | null): string {
  return valor === null ? "—" : valor.toLocaleString("pt-BR");
}

/** Somente consulta: não inclui controles de edição nem campos de identidade. */
export function EmpacotadoraVersoConsulta({
  dados,
  titulo = "Verso · bobinas e fechamento por produto",
}: {
  dados: VersoEmpacotadoraConsulta;
  titulo?: string;
}) {
  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
      <div>
        <h2 className="text-lg font-bold">{titulo}</h2>
        <p className="text-xs text-muted-foreground">Registros da folha operacional; linhas abertas ainda podem ser completadas pelo operador.</p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold">Bobinas de filme ({dados.bobinas.length})</h3>
        {dados.bobinas.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">Nenhuma bobina registrada.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-2">Nº / turno</th><th className="p-2">Produto</th>
                  <th className="p-2">Filme</th><th className="p-2">Fabricante</th>
                  <th className="p-2">Lote</th><th className="p-2">Peso inicial (kg)</th>
                  <th className="p-2">Peso final (kg)</th><th className="p-2">Início</th>
                  <th className="p-2">Término</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dados.bobinas.map((bobina, indice) => (
                  <tr key={`${bobina.maquina}:${bobina.dataOperacao}:${bobina.ordem}:${indice}`}>
                    <td className="p-2">{bobina.ordem} · {bobina.turno}</td>
                    <td className="p-2">{texto(bobina.produto)}</td>
                    <td className="p-2">{texto(bobina.especificacaoFilme)}</td>
                    <td className="p-2">{texto(bobina.fabricante)}</td>
                    <td className="p-2">{texto(bobina.numeroLote)}</td>
                    <td className="p-2">{numero(bobina.pesoLiquidoInicialKg)}</td>
                    <td className="p-2">{numero(bobina.pesoBrutoFinalKg)}</td>
                    <td className="p-2">{bobina.dataOperacao} {texto(bobina.horaInicio)}</td>
                    <td className="p-2">{bobina.dataTerminoOperacao ? `${bobina.dataTerminoOperacao} ${texto(bobina.horaTermino)}` : "Em uso"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold">Fechamento por produto ({dados.consolidacoes.length})</h3>
        {dados.consolidacoes.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">Nenhum fechamento registrado.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-2">Nº / turno</th><th className="p-2">Sabor / tamanho</th>
                  <th className="p-2">Início</th><th className="p-2">Fim</th>
                  <th className="p-2">Paletes</th><th className="p-2">Pacotes/palete</th>
                  <th className="p-2">Quebra (pacotes)</th><th className="p-2">Total (pacotes)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dados.consolidacoes.map((linha, indice) => (
                  <tr key={`${linha.maquina}:${linha.ordem}:${indice}`}>
                    <td className="p-2">{linha.ordem} · {linha.turno}</td>
                    <td className="p-2">{[linha.sabor, linha.tamanho].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="p-2">{texto(linha.horaInicio)}</td>
                    <td className="p-2">{texto(linha.horaFinal)}</td>
                    <td className="p-2">{numero(linha.quantidadePaletes)}</td>
                    <td className="p-2">{numero(linha.pacotesPorPalete)}</td>
                    <td className="p-2">{numero(linha.quebraPacotes)}</td>
                    <td className="p-2 font-semibold">{numero(linha.totalPacotes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
