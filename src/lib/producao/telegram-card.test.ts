import { describe, expect, it } from "vitest";
import { MOTIVOS_PARADA } from "./motivos-parada";
import {
  montarCard,
  periodoParaPublicar,
  temRotuloTelegram,
  urlPainel,
} from "../../../supabase/functions/hora-x-hora-telegram/cartao";

describe("card horário do Telegram", () => {
  it("fecha a hora anterior às :20 em Manaus", () => {
    expect(periodoParaPublicar(new Date("2026-09-23T14:19:00Z"))).toBeNull();
    expect(periodoParaPublicar(new Date("2026-09-23T14:20:00Z"))).toMatchObject({
      dataOperacao: "2026-09-23", dataCalendario: "2026-09-23",
      horaCodigo: "H04", inicio: "09:00", fim: "10:00",
    });
    expect(periodoParaPublicar(new Date("2026-09-23T10:20:00Z"))).toMatchObject({
      dataOperacao: "2026-09-22", dataCalendario: "2026-09-23",
      horaCodigo: "H24", inicio: "05:00", fim: "06:00",
    });
    expect(periodoParaPublicar(new Date("2026-09-23T04:20:00Z"))).toMatchObject({
      dataOperacao: "2026-09-22", dataCalendario: "2026-09-22",
      horaCodigo: "H18", inicio: "23:00", fim: "00:00",
    });
  });

  it("mostra ausências sem transformá-las em produção zero", () => {
    const periodo = periodoParaPublicar(new Date("2026-09-23T14:20:00Z"))!;
    const card = montarCard(periodo, [{
      maquina: "Enchedora 2", quantidade: 0, tempo_parada_min: 60,
      motivo_parada_codigo: "falta_energia", operador_nome: "João <L2>",
    }]);
    expect(card).toContain("Enchedora 2</b> · 0 garrafas");
    expect(card).toContain("Falta de energia");
    expect(card).toContain("João &lt;L2&gt;");
    expect(card.match(/Não realizado/g)).toHaveLength(3);
    expect(urlPainel(periodo, "https://maximusmagistral.digital/")).toContain("hora=H04");
  });

  it("tem rótulo legível para todos os códigos do formulário", () => {
    for (const motivo of MOTIVOS_PARADA) expect(temRotuloTelegram(motivo.codigo)).toBe(true);
  });
});
