/**
 * Cronologia di annulla/ripeti di una nota. Logica pura: orologio iniettato, nessun DOM,
 * così si prova con uno script .mts lanciato con node.
 *
 * Ogni voce è lo stato di UNA pagina PRIMA di una modifica (snapshot: html, inchiostro,
 * colore, sfondo, cursore). Annulla rimette quello stato e mette in "ripeti" lo stato attuale
 * della stessa pagina; ripeti fa il contrario. La digitazione continua nello stesso blocco
 * diventa una voce sola finché non c'è una pausa più lunga di `mergeMs`.
 */

export interface HistoryOptions {
  now: () => number;
  /** Voci massime in "annulla" (le più vecchie si perdono). */
  max?: number;
  /** Pausa oltre la quale la digitazione apre una voce nuova. */
  mergeMs?: number;
}

export type ChangeKind = "typing" | "other";

export interface RecordMeta {
  kind: ChangeKind;
  /** Blocco in cui si scrive: cambiarlo apre una voce nuova. */
  blockKey?: string;
}

interface Entry<T> {
  snapshot: T;
  kind: ChangeKind;
  blockKey: string | undefined;
  /** Ultima modifica unita a questa voce. */
  at: number;
}

export interface History<T extends { pageId: number }> {
  /** Da chiamare PRIMA di applicare una modifica, con lo stato che la pagina aveva. */
  record(before: T, meta: RecordMeta): void;
  /**
   * Toglie l'ultima voce e la restituisce da applicare. `current` dà lo stato attuale di una
   * pagina (va in "ripeti"); se restituisce null la pagina non c'è più e la voce si salta.
   */
  undo(current: (pageId: number) => T | null): T | null;
  redo(current: (pageId: number) => T | null): T | null;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
  /** Dopo un annulla/ripeti la prossima digitazione non si unisce alla voce precedente. */
  breakMerge(): void;
}

export function createHistory<T extends { pageId: number }>({ now, max = 200, mergeMs = 800 }: HistoryOptions): History<T> {
  const past: Entry<T>[] = [];
  let future: Entry<T>[] = [];
  let mergeOpen = false;

  function step(from: Entry<T>[], to: Entry<T>[], current: (pageId: number) => T | null): T | null {
    while (from.length > 0) {
      const entry = from.pop()!;
      const state = current(entry.snapshot.pageId);
      if (state === null) continue; // pagina eliminata: la voce non serve più
      to.push({ snapshot: state, kind: "other", blockKey: undefined, at: now() });
      mergeOpen = false;
      return entry.snapshot;
    }
    return null;
  }

  return {
    record(before, meta) {
      const t = now();
      const last = past[past.length - 1];
      const merge =
        mergeOpen &&
        meta.kind === "typing" &&
        last !== undefined &&
        last.kind === "typing" &&
        last.snapshot.pageId === before.pageId &&
        last.blockKey === meta.blockKey &&
        t - last.at <= mergeMs;
      future = [];
      if (merge) {
        last.at = t; // la voce tiene lo stato di PRIMA della prima battuta
        return;
      }
      past.push({ snapshot: before, kind: meta.kind, blockKey: meta.blockKey, at: t });
      if (past.length > max) past.splice(0, past.length - max);
      mergeOpen = meta.kind === "typing";
    },
    undo(current) {
      return step(past, future, current);
    },
    redo(current) {
      return step(future, past, current);
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    clear() {
      past.length = 0;
      future = [];
      mergeOpen = false;
    },
    breakMerge() {
      mergeOpen = false;
    },
  };
}
