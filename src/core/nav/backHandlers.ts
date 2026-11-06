import { useEffect, useSyncExternalStore } from "react";
import { useLatestRef } from "../hooks/useLatestRef";

/**
 * Tasto (o gesto) "indietro" di Android: chi ha qualcosa da chiudere (il menu, la modifica della dashboard…)
 * si registra qui con useBackHandler; l'ultimo registrato vince. Senza nessuno, NavProvider torna alla
 * dashboard; dalla dashboard l'indietro va ad Android, che chiude l'app. Sul desktop non succede niente.
 */
type Handler = { current: () => void };

let stack: Handler[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Quanti hanno qualcosa da chiudere (per NavProvider: se è 0 e si è in dashboard, l'indietro va ad Android). */
export function useBackHandlerCount(): number {
  return useSyncExternalStore(subscribe, () => stack.length, () => 0);
}

/** Chiama l'ultimo registrato. False se non c'è nessuno. */
export function runBackHandler(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.current();
  return true;
}

/** Finché `active` è true, l'indietro chiama `handler` (es. chiude il menu) invece di cambiare vista. */
export function useBackHandler(active: boolean, handler: () => void) {
  const ref = useLatestRef(handler);
  useEffect(() => {
    if (!active) return;
    const entry: Handler = { current: () => ref.current() };
    stack = [...stack, entry];
    emit();
    return () => {
      stack = stack.filter((h) => h !== entry);
      emit();
    };
  }, [active, ref]);
}
