import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { invocar } = vi.hoisted(() => ({ invocar: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: object) => ({ ...config, useSearch: () => ({
    token: "123e4567-e89b-42d3-a456-426614174000",
  }) }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invocar } },
}));
vi.mock("@/components/producao/empacotadora-verso-consulta", () => ({
  EmpacotadoraVersoConsulta: () => null,
}));

import { PainelHoraXHoraPublico } from "./hora-x-hora-publico";

describe("painel público do Hora x Hora", () => {
  afterEach(() => vi.restoreAllMocks());

  it("posiciona na hora do card só no carregamento inicial", async () => {
    const rolar = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: rolar,
    });
    invocar.mockResolvedValue({
      data: {
        dataOperacao: "2026-09-28",
        horaReferencia: "H12",
        consultadoEm: "2026-09-28T22:30:00.000Z",
        registros: [],
      },
      error: null,
    });

    render(<PainelHoraXHoraPublico />);
    await waitFor(() => expect(rolar).toHaveBeenCalledTimes(1));
    expect(rolar.mock.instances[0].textContent).toContain("Hora do card");
    expect(rolar.mock.instances[0].textContent).toContain("17:00");
    expect(screen.getAllByText("Não realizado")).toHaveLength(48);

    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    await waitFor(() => expect(invocar).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Carregando o Hora x Hora...")).toBeNull());
    expect(rolar).toHaveBeenCalledTimes(1);
  });
});
