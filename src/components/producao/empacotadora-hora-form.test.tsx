import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmpacotadoraHoraForm } from "./empacotadora-hora-form";

describe("lançamento Hora x Hora da empacotadora", () => {
  it("mostra a conta, pede confirmação e fecha a hora depois do save", async () => {
    const onSalvar = vi.fn().mockResolvedValue(undefined);
    render(
      <EmpacotadoraHoraForm
        horaRotulo="08:00 às 09:00"
        maquina="Empacotadora 2"
        onSalvar={onSalvar}
      />,
    );

    fireEvent.change(screen.getByLabelText("Tamanho do produto"), { target: { value: "2L" } });
    fireEvent.change(screen.getByLabelText("Sabor produzido"), { target: { value: "Uva" } });
    fireEvent.change(screen.getByLabelText("Paletes completos"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Quebra: pacotes do palete incompleto"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByLabelText("Minutos parados nesta hora"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("Meta da hora (pacotes, opcional)"), {
      target: { value: "110" },
    });

    expect(screen.getByText("103 pacotes produzidos")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revisar hora" }));
    expect(onSalvar).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Depois de confirmar, o operador não poderá alterar/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar e salvar hora" }));
    await waitFor(() =>
      expect(onSalvar).toHaveBeenCalledWith({
        tamanhoProduto: "2L",
        sabor: "Uva",
        paletesCompletos: 2,
        quebraPacotes: 7,
        pacotesPorPalete: 48,
        quantidade: 103,
        meta: 110,
        tempoParadaMin: 0,
        motivoParada: null,
        tipoSetup: null,
      }),
    );
    expect(await screen.findByText(/Registro salvo. Esta hora está fechada/)).toBeInTheDocument();
    expect(screen.getByText("110")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revisar hora" })).not.toBeInTheDocument();
  });

  it("exige motivo para uma hora sem produção e permite registrar zero", () => {
    const onSalvar = vi.fn();
    render(
      <EmpacotadoraHoraForm
        horaRotulo="09:00 às 10:00"
        maquina="Empacotadora 3"
        onSalvar={onSalvar}
      />,
    );
    fireEvent.change(screen.getByLabelText("Minutos parados nesta hora"), {
      target: { value: "60" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Revisar hora" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/motivo da parada/);
    expect(onSalvar).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Motivo da parada ou observação/), {
      target: { value: "Sem programação" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Revisar hora" }));
    expect(screen.getByText("0 pacotes produzidos")).toBeInTheDocument();
  });
});
