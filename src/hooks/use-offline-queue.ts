// Re-export para manter a estrutura de arquivos pedida (use-offline-queue.ts).
// A fila e o status de conexão compartilham o mesmo singleton em use-connection-status.ts
// para evitar listeners e intervalos duplicados.
export { useOfflineQueue } from "./use-connection-status";
export type { FilaItem, FilaItemTipo } from "./use-connection-status";
