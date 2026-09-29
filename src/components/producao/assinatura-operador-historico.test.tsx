import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { calcularDataOperacional, dataOperacionalAnterior } from "@/lib/operacao/data-operacional";
import { MAQUINAS } from "@/lib/maquinas/catalogo";
import { AssinaturaOperadorHistorico } from "./assinatura-operador-historico";

const busca = vi.hoisted(() => vi.fn());
vi.mock("@/lib/producao/supabase-storage", () => ({ fetchProducaoHoras: busca }));
vi.mock("./assinatura-operador-turno", () => ({ AssinaturaOperadorTurno: () => null }));

describe("acesso à assinatura do turno noturno após a virada da folha", () => {
  beforeEach(() => {
    busca.mockReset().mockResolvedValue([]);
  });

  it("aponta para a folha H24 encerrada ontem às 06:21 em Manaus", () => {
    const agora = new Date("2026-09-28T10:21:00Z");
    const folhaAtual = calcularDataOperacional("Valderlan", "12x36 Noite", agora);
    expect(folhaAtual).toBe("2026-09-28");
    expect(dataOperacionalAnterior(folhaAtual)).toBe("2026-09-27");
  });

  it("também permite selecionar datas mais antigas sem reabrir a produção", () => {
    expect(dataOperacionalAnterior("2026-10-01")).toBe("2026-09-30");
  });

  it("consulta o H24 do operador na data anterior mesmo depois das 06:20", async () => {
    const agora = new Date("2026-09-28T10:21:00Z");
    const dataAtual = calcularDataOperacional("Valderlan", "12x36 Noite", agora);
    const uid = "d8d866e0-67ca-45bd-987d-0a344dcaa467";
    busca.mockResolvedValue([
      {
        id: "hora-24",
        horaCodigo: "H24",
        horaInicio: "05:00",
        horaFim: "06:00",
        turno: "12x36 Noite",
        finalizadoEm: "2026-09-28T10:03:00Z",
        operadorUserId: uid,
      },
    ]);

    render(
      <AssinaturaOperadorHistorico
        dataAtual={dataAtual}
        maquina={MAQUINAS["empacotadora-2"]}
        operadorUserId={uid}
      />,
    );

    await waitFor(() =>
      expect(busca).toHaveBeenCalledWith("2026-09-27__Linha 2__Empacotadora 2", uid),
    );
    expect(await screen.findByText(/H24 · 05:00 às 06:00/)).toBeTruthy();
  });
});
