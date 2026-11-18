/*
 * "Il calendario è cambiato": la pagina, le card e il mini rileggono i loro dati. Solo memoria.
 * Lo chiama chi scrive (occurrenceOps.ts e la pagina) dopo ogni modifica.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyCalendarChanged(): void {
  for (const l of [...listeners]) l();
}

export function onCalendarChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
