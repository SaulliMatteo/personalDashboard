import { createContext, useContext } from "react";

/* Contesto e hook separati dal provider (SyncContext.tsx), come per le impostazioni. */

export type SyncStatus =
  /** spento, o account dei Gruppi non pronto */
  | { kind: "off" }
  /** primo sync con dati già nel cloud: l'utente sceglie "Unisci" o "Usa i dati del cloud" */
  | { kind: "needsChoice" }
  | { kind: "syncing" }
  | { kind: "synced"; at: number }
  /** non riuscito: si riprova da soli a `retryAt` */
  | { kind: "failed"; reason: "unreachable" | "other"; retryAt: number };

export interface SyncContextValue {
  status: SyncStatus;
  /** Giro subito (pulsante "Sincronizza ora"). */
  syncNow: () => void;
  /** Risposta al primo sync. "replace" cancella materie e sessioni di questo dispositivo: prima va fatta la copia. */
  choose: (choice: "merge" | "replace") => Promise<void>;
}

export const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync deve essere usato dentro <SyncProvider>");
  return ctx;
}
