/*
 * "La libreria è cambiata da fuori della pagina" (un video salvato da una scheda della chat degli amici): la card e
 * la pagina rileggono. Solo memoria.
 */

const listeners = new Set<() => void>();

export function emitLibraryChanged(): void {
  for (const listener of listeners) listener();
}

export function onLibraryChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
