import type { Row } from "./engine/records";
import type { LocalId } from "./syncRepository";
import type { SyncKind } from "./tables";

/*
 * "Sono arrivati dati dagli altri dispositivi": chi tiene in memoria righe sincronizzate (impostazioni, timer dello
 * Studio, Note…) le rilegge dal DB. Solo memoria, come il bus delle attività.
 */

export interface SyncApplied {
  /** Tipi con righe cambiate (scritte o cancellate). */
  kinds: ReadonlySet<SyncKind>;
  /** Id locali delle righe scritte (nuove o cambiate), per tipo. */
  written: ReadonlyMap<SyncKind, readonly LocalId[]>;
  /** Righe cancellate, con chiave e `localColumns` (tables.ts) lette prima di cancellarle, per tipo. */
  deleted: ReadonlyMap<SyncKind, readonly Row[]>;
}

type Listener = (applied: SyncApplied) => void;

const listeners = new Set<Listener>();

export function emitSyncApplied(applied: SyncApplied): void {
  if (applied.kinds.size === 0) return;
  for (const listener of listeners) {
    try {
      listener(applied);
    } catch (error) {
      console.error("Errore dopo l'arrivo dei dati sincronizzati:", error);
    }
  }
}

/** Ascolta gli arrivi; restituisce la funzione per smettere. */
export function onSyncApplied(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
