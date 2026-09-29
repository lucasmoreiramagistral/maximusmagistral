import { useEffect, useMemo, useState } from "react";
import {
  formatarDataBR,
  buildFolhaDiaKey,
  dataOperacionalAnterior,
} from "@/lib/operacao/data-operacional";
import type { MaquinaOperacional } from "@/lib/maquinas/catalogo";
import { assinarHoraOperador } from "@/lib/producao/assinatura-operador";
import { fetchProducaoHoras } from "@/lib/producao/supabase-storage";
import type { ProducaoHora } from "@/lib/producao/types";
import { AssinaturaOperadorTurno } from "./assinatura-operador-turno";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  dataAtual: string;
  maquina: MaquinaOperacional;
  operadorUserId: string | null | undefined;
}

/** Permite assinar H12/H24 depois da troca automática da data operacional. */
export function AssinaturaOperadorHistorico({ dataAtual, maquina, operadorUserId }: Props) {
  const [dataSelecionada, setDataSelecionada] = useState(() => dataOperacionalAnterior(dataAtual));
  const [horas, setHoras] = useState<ProducaoHora[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    setDataSelecionada(dataOperacionalAnterior(dataAtual));
  }, [dataAtual]);
  const chave = useMemo(
    () => buildFolhaDiaKey(dataSelecionada, maquina.linha, maquina.nome),
    [dataSelecionada, maquina.linha, maquina.nome],
  );

  useEffect(() => {
    let atual = true;
    if (!operadorUserId || !/^\d{4}-\d{2}-\d{2}$/.test(dataSelecionada)) {
      setHoras([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);
    setHoras([]);
    void fetchProducaoHoras(chave, operadorUserId)
      .then((linhas) => {
        if (atual)
          setHoras(
            linhas.filter(
              (hora) =>
                (hora.horaCodigo === "H12" || hora.horaCodigo === "H24") &&
                !!hora.finalizadoEm &&
                hora.operadorUserId === operadorUserId,
            ),
          );
      })
      .catch((e) => {
        if (atual) setErro(e instanceof Error ? e.message : "Não foi possível consultar o turno.");
      })
      .finally(() => {
        if (atual) setLoading(false);
      });
    return () => {
      atual = false;
    };
  }, [chave, dataSelecionada, operadorUserId]);

  async function assinar(hora: ProducaoHora, desenho: string) {
    const salva = await assinarHoraOperador(hora, desenho);
    setHoras((anteriores) => anteriores.map((item) => (item.id === salva.id ? salva : item)));
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-4 md:p-6">
      <h2 className="text-base font-bold text-foreground">Assinar um turno anterior</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Se a folha mudou após o fim do turno, selecione a data em que ele começou. Só a última hora
        que você salvou pode receber sua assinatura; os valores continuam fechados.
      </p>
      <div className="mt-3 max-w-xs">
        <Label htmlFor="data-assinatura-turno">Data operacional do turno</Label>
        <Input
          id="data-assinatura-turno"
          type="date"
          value={dataSelecionada}
          max={dataAtual}
          onChange={(e) => setDataSelecionada(e.target.value)}
          className="mt-1 h-12"
        />
      </div>
      {loading && <p className="mt-3 text-sm text-muted-foreground">Consultando o Supabase...</p>}
      {erro && <p className="mt-3 text-sm text-destructive">{erro}</p>}
      {!loading && !erro && horas.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Nenhuma última hora confirmada por você em {formatarDataBR(dataSelecionada)}.
        </p>
      )}
      {!loading &&
        !erro &&
        horas.map((hora) => (
          <div key={hora.id} className="mt-4">
            <p className="mb-2 text-sm font-semibold text-foreground">
              {hora.horaCodigo} · {hora.horaInicio} às {hora.horaFim} · {hora.turno}
            </p>
            <AssinaturaOperadorTurno
              hora={hora}
              operadorUserId={operadorUserId}
              onAssinar={(desenho) => assinar(hora, desenho)}
            />
          </div>
        ))}
    </section>
  );
}
