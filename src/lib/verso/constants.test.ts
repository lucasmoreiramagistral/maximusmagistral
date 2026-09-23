import { describe, expect, it } from "vitest";
import {
  criarItensLimpezaVazios,
  criarItensPtpVazios,
  itensLimpezaDaMaquina,
  itensPtpDaMaquina,
  janelasPtpDaMaquina,
  janelasPtpDaEscalaMaquina,
} from "./constants";
import { ESCALAS } from "@/lib/operacao/escalas";

describe("catálogos PTP e limpeza por máquina", () => {
  it("mantém o PTP histórico da Enchedora 3 e aplica o mesmo catálogo à Enchedora 2", () => {
    expect(criarItensPtpVazios()).toEqual(criarItensPtpVazios("Enchedora 3"));
    expect(criarItensPtpVazios("Enchedora 2")).toEqual(criarItensPtpVazios());
    expect(itensPtpDaMaquina("Enchedora 2")).toHaveLength(5);
  });

  it("usa sete anomalias de pacotes em ambas as empacotadoras", () => {
    const l2 = criarItensPtpVazios("Empacotadora 2");
    const l3 = criarItensPtpVazios("Empacotadora 3");

    expect(l2).toEqual(l3);
    expect(l2).toHaveLength(7);
    expect(new Set(l2.map((item) => item.codigo)).size).toBe(7);
    expect(l2.every((item) => item.quantidade === 0 && item.status === "sem_ocorrencia")).toBe(true);
    expect(l2.map((item) => item.codigo)).not.toContain("TAMPA_ALTA");
  });

  it("disponibiliza 21 itens de limpeza na sala de envase e exclui empacotadoras", () => {
    expect(criarItensLimpezaVazios()).toEqual(criarItensLimpezaVazios("Enchedora 3"));
    expect(criarItensLimpezaVazios("Enchedora 2")).toEqual(criarItensLimpezaVazios());
    expect(criarItensLimpezaVazios("Enchedora 2")).toHaveLength(21);
    expect(itensLimpezaDaMaquina("Empacotadora 2")).toBeNull();
    expect(itensLimpezaDaMaquina("Empacotadora 3")).toBeNull();
    expect(() => criarItensLimpezaVazios("Empacotadora 2")).toThrow("não se aplica");
  });

  it("respeita os limites impressos de 14:20 e 22:40 nas máquinas novas", () => {
    const e2 = janelasPtpDaMaquina("Enchedora 2");
    expect(e2).toHaveLength(12);
    expect(e2.map((janela) => janela.codigo)).toEqual(
      Array.from({ length: 12 }, (_, indice) => `J${String(indice + 1).padStart(2, "0")}`),
    );
    expect(e2[3]).toMatchObject({ inicio: "12:00", fim: "14:20" });
    expect(e2[4]).toMatchObject({ inicio: "14:20", fim: "16:00" });
    expect(e2[7]).toMatchObject({ inicio: "20:00", fim: "22:40" });
    expect(e2[8]).toMatchObject({ inicio: "22:40", fim: "00:00" });
    expect(janelasPtpDaMaquina("Empacotadora 2")).toEqual(e2);
    expect(janelasPtpDaMaquina("Empacotadora 3")).toEqual(e2);

    const e3 = janelasPtpDaMaquina("Enchedora 3");
    expect(e3[3]).toMatchObject({ inicio: "12:00", fim: "14:00" });
    expect(e3[7]).toMatchObject({ inicio: "20:00", fim: "22:00" });
  });

  it("atribui a janela da troca de turno apenas ao turno que realmente a cobre", () => {
    const primeiro = ESCALAS.find((escala) => escala.id === "primeiro_turno");
    const segundo = ESCALAS.find((escala) => escala.id === "segundo_turno");
    const terceiro = ESCALAS.find((escala) => escala.id === "terceiro_turno");
    expect(janelasPtpDaEscalaMaquina(primeiro, "Empacotadora 2")).toEqual([
      "J01", "J02", "J03", "J04",
    ]);
    expect(janelasPtpDaEscalaMaquina(segundo, "Empacotadora 2")).toEqual([
      "J05", "J06", "J07", "J08",
    ]);
    expect(janelasPtpDaEscalaMaquina(terceiro, "Empacotadora 2")).toEqual([
      "J09", "J10", "J11", "J12",
    ]);
    expect(janelasPtpDaEscalaMaquina(primeiro, "Enchedora 3")).toContain("J05");
  });
});
