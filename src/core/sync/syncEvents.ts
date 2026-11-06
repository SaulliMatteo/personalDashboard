import type { SyncKind } from "./tables";

/*
 * "Sono arrivati dati dagli altri dispositivi": chi tiene in memoria righe sincronizzate (impostazioni, timer dello
 * Studio, Note…) le rilegge dal DB. Solo memoria, come il bus delle attività.
 */

type Listener = (kinds: ReadonlySet<SyncKind>) => void;

const listeners = new Set<Listener>();

export function emitSyncApplied(kinds: ReadonlySet<SyncKind>): void {
  if (kinds.size === 0) return;
  for (const listener of listeners) listener(kinds);
}

/** Ascolta gli arrivi; restituisce la funzione per smettere. */
export function onSyncApplied(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
