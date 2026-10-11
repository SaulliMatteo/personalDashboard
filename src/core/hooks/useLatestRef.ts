import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Ref che contiene sempre l'ULTIMO valore, aggiornato dopo ogni render.
 * Serve nelle callback di lunga durata (setInterval, listener, funzioni
 * async) che altrimenti leggerebbero un valore "vecchio" catturato alla
 * creazione. Scrivere `ref.current` durante il render è sconsigliato da
 * React: qui avviene nel layout effect, quindi prima di qualsiasi evento.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
