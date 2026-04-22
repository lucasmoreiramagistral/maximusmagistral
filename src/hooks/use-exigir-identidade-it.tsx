// ============================================================
// Hook que centraliza o gate de identidade antes de abrir uma IT.
// Retorna { identidade, modal, pronto }:
//  - identidade: payload pronto pra telemetria (nomeCompleto, nomeCanonico, deviceId)
//  - modal: ReactNode pra renderizar (ou null)
//  - pronto: true quando pode prosseguir (renderizar Visualizador)
// Reutilizável em qualquer rota IT futura — evita gate esquecido.
// ============================================================

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useUsuario } from "@/hooks/use-storage";
import {
  decidirModoIdentidade,
  lerIdentidadeDevice,
  obterOuCriarDeviceId,
  salvarIdentidadeDevice,
  type IdentidadeConfirmada,
  type IdentidadeOperadorDevice,
  type ModoIdentidade,
} from "@/lib/it/identidade";
import {
  ItIdentificacaoDialog,
  type ResultadoIdentificacao,
} from "@/components/it-identificacao-dialog";

export interface UseExigirIdentidadeItResult {
  identidade: IdentidadeConfirmada | null;
  modal: ReactNode;
  pronto: boolean;
  /** Resultado bruto da última confirmação — útil pra eventos de auditoria */
  ultimoResultado: ResultadoIdentificacao | null;
  /** Força reabertura do modal (ex: troca manual) */
  reabrir: () => void;
}

export function useExigirIdentidadeIt(): UseExigirIdentidadeItResult {
  const usuario = useUsuario();

  const [identidadePersistida, setIdentidadePersistida] =
    useState<IdentidadeOperadorDevice | null>(null);
  const [modo, setModo] = useState<ModoIdentidade>("completo");
  const [open, setOpen] = useState(false);
  const [confirmada, setConfirmada] = useState<IdentidadeConfirmada | null>(
    null,
  );
  const [ultimoResultado, setUltimoResultado] =
    useState<ResultadoIdentificacao | null>(null);

  // Decide o modo na montagem / quando user muda
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ident = lerIdentidadeDevice();
    setIdentidadePersistida(ident);
    const novoModo = decidirModoIdentidade(ident, usuario?.userId ?? null);
    setModo(novoModo);

    if (novoModo === "nao") {
      // identidade ainda válida → reusa direto
      if (ident) {
        setConfirmada({
          nomeCompleto: ident.nomeCompleto,
          nomeCanonico: ident.nomeCanonico,
          deviceId: obterOuCriarDeviceId(),
        });
        setOpen(false);
      }
    } else {
      setConfirmada(null);
      setOpen(true);
    }
  }, [usuario?.userId]);

  const handleConfirmar = useCallback(
    (resultado: ResultadoIdentificacao) => {
      const deviceId = obterOuCriarDeviceId();
      const agora = new Date().toISOString();
      const nova: IdentidadeOperadorDevice = {
        userId: usuario?.userId ?? null,
        nomeCompleto: resultado.nomeCompleto,
        nomeCanonico: resultado.nomeCanonico,
        confirmadoEm: agora,
        ultimoUso: agora,
      };
      salvarIdentidadeDevice(nova);
      setIdentidadePersistida(nova);
      setUltimoResultado(resultado);
      setConfirmada({
        nomeCompleto: resultado.nomeCompleto,
        nomeCanonico: resultado.nomeCanonico,
        deviceId,
      });
      setOpen(false);
    },
    [usuario?.userId],
  );

  const reabrir = useCallback(() => {
    const ident = lerIdentidadeDevice();
    setIdentidadePersistida(ident);
    setModo(ident ? "leve" : "completo");
    setConfirmada(null);
    setOpen(true);
  }, []);

  const modal = useMemo(() => {
    if (!open) return null;
    return (
      <ItIdentificacaoDialog
        open={open}
        modo={modo === "completo" ? "completo" : "leve"}
        identidadeAnterior={identidadePersistida}
        onConfirmar={handleConfirmar}
      />
    );
  }, [open, modo, identidadePersistida, handleConfirmar]);

  return {
    identidade: confirmada,
    modal,
    pronto: confirmada != null,
    ultimoResultado,
    reabrir,
  };
}
