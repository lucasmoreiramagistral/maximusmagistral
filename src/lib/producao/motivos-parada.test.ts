import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MOTIVOS_PARADA,
  motivoParadaValido,
  motivosParaMaquina,
  rotuloMotivoParada,
} from "./motivos-parada";

describe("catálogo de motivos de parada", () => {
  it("tem códigos estáveis e não oferece causa da própria empacotadora à enchedora", () => {
    const codigos = MOTIVOS_PARADA.map((motivo) => motivo.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(motivoParadaValido("ajuste_empacotadora", "enchedora")).toBe(false);
    expect(motivoParadaValido("parada_empacotadora", "enchedora")).toBe(true);
    expect(motivoParadaValido("parada_enchedora", "empacotadora")).toBe(true);
    expect(motivosParaMaquina("empacotadora").some((motivo) => motivo.codigo === "falta_filme")).toBe(true);
  });

  it("separa ausência de causa de categoria fora do catálogo", () => {
    expect(rotuloMotivoParada("nao_identificado")).toBe("Causa ainda não identificada");
    expect(rotuloMotivoParada("outro_nao_listado")).toBe("Outro motivo não listado");
    expect(rotuloMotivoParada(null)).toBeNull();
  });

  it("mantém os códigos oferecidos pelo app na migration do banco", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260922100000_maquinas_hora_x_hora.sql"),
      "utf8",
    );
    for (const motivo of MOTIVOS_PARADA) {
      expect(sql).toContain(`'${motivo.codigo}'`);
    }
  });
});
