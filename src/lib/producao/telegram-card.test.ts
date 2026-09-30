import { describe, expect, it } from "vitest";
import { MOTIVOS_PARADA } from "./motivos-parada";
import { fimDaHoraEpoch } from "./horario";
import { acumuladosPorHora } from "../../../supabase/functions/hora-x-hora-telegram/acumulado";
import { idsDeOperadoresSemNome, preencherNomesOperadores } from "../../../supabase/functions/hora-x-hora-telegram/operadores";
import {
  montarCard,
  periodoDoCorte,
  periodoParaPublicar,
  proximoCortePendente,
  statusTelegramFalhou,
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

  it("usa a mesma data e faixa do app nas 24 publicações do dia operacional", () => {
    for (const dataOperacao of ["2026-09-23", "2026-12-31"]) {
      for (let indice = 1; indice <= 24; indice++) {
        const horaCodigo = `H${String(indice).padStart(2, "0")}`;
        const instanteCorte = fimDaHoraEpoch(dataOperacao, horaCodigo) + 20 * 60_000;
        const periodo = periodoParaPublicar(new Date(instanteCorte));
        expect(periodo, `${dataOperacao} ${horaCodigo}`).toMatchObject({
          dataOperacao,
          horaCodigo,
          corteEm: new Date(instanteCorte).toISOString(),
        });
        expect(periodoParaPublicar(new Date(instanteCorte - 1000))).toBeNull();
      }
    }
  });

  it("retoma cada corte perdido sem mudar o limite de confirmação", () => {
    const primeiro = new Date("2026-09-23T14:20:00Z");
    const ultimo = new Date("2026-09-23T15:20:00Z");
    expect(proximoCortePendente(new Date("2026-09-23T14:19:59Z"), primeiro, null)).toBeNull();
    expect(proximoCortePendente(new Date("2026-09-23T17:35:00Z"), primeiro, null))
      .toEqual(primeiro);
    const proximo = proximoCortePendente(new Date("2026-09-23T17:35:00Z"), primeiro, ultimo);
    expect(proximo?.toISOString()).toBe("2026-09-23T16:20:00.000Z");
    expect(periodoDoCorte(proximo!)).toMatchObject({
      dataOperacao: "2026-09-23", horaCodigo: "H06",
      inicio: "11:00", fim: "12:00", corteEm: "2026-09-23T16:20:00.000Z",
    });
    expect(proximoCortePendente(new Date("2026-09-23T17:19:59Z"), primeiro,
      new Date("2026-09-23T16:20:00Z"))).toBeNull();
  });

  it("aguarda o primeiro HH:20 depois da ativação", () => {
    // O agendamento SQL ativado às 10:30 grava 11:20 como primeiro corte.
    const primeiro = new Date("2026-09-23T11:20:00Z");
    expect(proximoCortePendente(new Date("2026-09-23T10:30:00Z"), primeiro, null))
      .toBeNull();
    expect(proximoCortePendente(new Date("2026-09-23T11:19:59Z"), primeiro, null))
      .toBeNull();
    expect(proximoCortePendente(new Date("2026-09-23T11:20:00Z"), primeiro, null))
      .toEqual(primeiro);
  });

  it("só permite nova tentativa quando a API confirmou que não enviou", () => {
    expect(statusTelegramFalhou(400, false)).toBe(true);
    expect(statusTelegramFalhou(429, false)).toBe(true);
    expect(statusTelegramFalhou(500, false)).toBe(false);
    expect(statusTelegramFalhou(502, undefined)).toBe(false);
    expect(statusTelegramFalhou(200, true)).toBe(false);
  });

  it("mostra ausências sem transformá-las em produção zero", () => {
    const periodo = periodoParaPublicar(new Date("2026-09-23T14:20:00Z"))!;
    const card = montarCard(periodo, [{
      maquina: "Enchedora 2", quantidade: 0, tempo_parada_min: 60,
      motivo_parada_codigo: "falta_energia", operador_nome: "João <L2>",
      acumulado: 12300,
      produto_sabor: "Guaraná <Zero>", produto_tamanho: "2 L",
    }]);
    expect(card).toContain("Enchedora 2</b> · 0 garrafas");
    expect(card).toContain("Produto: Guaraná &lt;Zero&gt; · 2 L");
    expect(card).toContain("Falta de energia");
    expect(card).toContain("Motivo da parada: Falta de energia");
    expect(card).toContain("Acumulado: 12.300 garrafas");
    expect(card).toContain("João &lt;L2&gt;");
    expect(card.match(/Não realizado/g)).toHaveLength(3);
    expect(urlPainel("123e4567-e89b-42d3-a456-426614174000", "https://maximusmagistral.digital/"))
      .toBe("https://maximusmagistral.digital/hora-x-hora-publico?token=123e4567-e89b-42d3-a456-426614174000");
  });

  it("tem rótulo legível para todos os códigos do formulário", () => {
    for (const motivo of MOTIVOS_PARADA) expect(temRotuloTelegram(motivo.codigo)).toBe(true);
  });

  it("soma as horas confirmadas do turno e reinicia em setup ou virada", () => {
    const acumulados = acumuladosPorHora([
      { maquina: "Enchedora 3", hora_codigo: "H15", quantidade: 400 },
      { maquina: "Enchedora 3", hora_codigo: "H01", quantidade: 100 },
      { maquina: "Enchedora 3", hora_codigo: "H02", quantidade: 200 },
      { maquina: "Enchedora 3", hora_codigo: "H03", quantidade: 50, reinicia_acumulado: true },
      { maquina: "Enchedora 3", hora_codigo: "H04", quantidade: 300 },
      { maquina: "Enchedora 3", hora_codigo: "H12", quantidade: 400 },
      { maquina: "Enchedora 3", hora_codigo: "H13", quantidade: 500 },
      { maquina: "Enchedora 3", hora_codigo: "H14", quantidade: 100 },
      { maquina: "Enchedora 3", hora_codigo: "H14", quantidade: 999 },
      { maquina: "Empacotadora 3", hora_codigo: "H04", quantidade: 42 },
    ]);
    expect(acumulados.get("Enchedora 3:H02")).toBe(300);
    expect(acumulados.get("Enchedora 3:H03")).toBe(50);
    expect(acumulados.get("Enchedora 3:H04")).toBe(350);
    expect(acumulados.get("Enchedora 3:H13")).toBe(500);
    expect(acumulados.get("Enchedora 3:H15")).toBe(1000);
    expect(acumulados.get("Empacotadora 3:H04")).toBe(42);
  });

  it("recupera o nome pelo login antigo sem sobrescrever nome já confirmado", () => {
    const horas = [
      { operador_user_id: "id-1", operador_nome: null },
      { operador_user_id: "id-2", operador_nome: "Nome da hora" },
    ];
    expect(idsDeOperadoresSemNome(horas)).toEqual(["id-1"]);
    expect(preencherNomesOperadores(horas, [
      { id: "id-1", nome: "João" }, { id: "id-2", nome: "Nome novo" },
    ]).map((hora) => hora.operador_nome)).toEqual(["João", "Nome da hora"]);
  });
});
