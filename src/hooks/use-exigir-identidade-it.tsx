// ============================================================
// Hook que centraliza o gate de identidade antes de abrir uma IT.
//
// Fluxo:
//  1. Usuário precisa confirmar identidade (modo leve ou completo)
//  2. Após confirmar, valida se há ATA DE TREINAMENTO cadastrada
//     no banco para o documento (it002/it005). Se não houver,
//     bloqueia com tela "Sem treinamento" e redireciona p/ cadastro.
//
// Retorna { identidade, modal, pronto, semTreinamento }.
// ============================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuthLoading, useUsuario } from "@/hooks/use-storage";
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
import { temAtaCadastrada, type AtaDocumento } from "@/lib/it/atas";

export interface UseExigirIdentidadeItResult {
  identidade: IdentidadeConfirmada | null;
  modal: ReactNode;
  pronto: boolean;
  ultimoResultado: ResultadoIdentificacao | null;
  reabrir: () => void;
  /** True quando identidade foi confirmada mas o operador NÃO tem ata cadastrada para o documento. */
  semTreinamento: boolean;
  /** Carregando a verificação de ata no banco. */
  verificandoAta: boolean;
}

export function useExigirIdentidadeIt(
  documento?: AtaDocumento,
): UseExigirIdentidadeItResult {
  const usuario = useUsuario();
  const authLoading = useAuthLoading();

  const [identidadePersistida, setIdentidadePersistida] =
    useState<IdentidadeOperadorDevice | null>(null);
  const [modo, setModo] = useState<ModoIdentidade>("completo");
  const [open, setOpen] = useState(false);
  const [confirmada, setConfirmada] = useState<IdentidadeConfirmada | null>(
    null,
  );
  const [ultimoResultado, setUltimoResultado] =
    useState<ResultadoIdentificacao | null>(null);
  const [semTreinamento, setSemTreinamento] = useState(false);
  const [verificandoAta, setVerificandoAta] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (authLoading) return;
    if (!usuario) {
      setOpen(false);
      setConfirmada(null);
      return;
    }

    const ident = lerIdentidadeDevice();
    setIdentidadePersistida(ident);
    const novoModo = decidirModoIdentidade(ident, usuario.userId ?? null);
    setModo(novoModo);

    if (novoModo === "nao") {
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
  }, [authLoading, usuario]);

  // Sempre que tem identidade confirmada + documento, valida ata no banco
  useEffect(() => {
    if (!confirmada || !documento) {
      setSemTreinamento(false);
      return;
    }
    let cancelado = false;
    setVerificandoAta(true);
    void temAtaCadastrada({
      operadorNomeCanonico: confirmada.nomeCanonico,
      documento,
    })
      .then((tem) => {
        if (cancelado) return;
        setSemTreinamento(!tem);
      })
      .catch(() => {
        if (cancelado) return;
        // Em caso de erro de rede, libera (não punir)
        setSemTreinamento(false);
      })
      .finally(() => {
        if (!cancelado) setVerificandoAta(false);
      });
    return () => {
      cancelado = true;
    };
  }, [confirmada, documento]);

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
    setSemTreinamento(false);
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
    pronto: confirmada != null && !semTreinamento && !verificandoAta,
    ultimoResultado,
    reabrir,
    semTreinamento,
    verificandoAta,
  };
}
