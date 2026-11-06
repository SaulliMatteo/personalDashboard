/*
 * "Note o Raccolte cambiate da un altro dispositivo" (dopo che NotesSyncProvider ha riallineato segni e copia su
 * disco): la pagina Notes, la card e il mini si ricaricano. Solo memoria.
 */

export interface RemoteNotesChange {
  /** Note con righe arrivate (la nota o le sue pagine): se una è aperta, l'editor la rilegge. */
  noteIds: ReadonlySet<number>;
}

type Listener = (change: RemoteNotesChange) => void;

const listeners = new Set<Listener>();

export function emitRemoteNotesChange(change: RemoteNotesChange): void {
  for (const listener of listeners) listener(change);
}

export function onRemoteNotesChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
