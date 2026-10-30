import type { BrainSnapshot } from "./engine/snapshot";

/*
 * Il MIO Pixy così com'è adesso, pubblicato dal Companion (widgets/companion/CompanionContext.tsx) per chi lo
 * deve mostrare fuori dal widget senza importarlo: la Stanza comune lo disegna al mio posto e, se lo attivo,
 * lo manda ai compagni. Solo memoria, come l'activityBus; tempi in ms dell'orologio LOCALE.
 * Cambia oggetto solo quando cambia qualcosa di visibile (il cervello lo tiene in cache).
 */

type Listener = () => void;

let current: BrainSnapshot | null = null;
const listeners = new Set<Listener>();

/** null = il Companion non è in uso (né in dashboard né condiviso): chi disegna usa una posa di ripiego. */
export function publishMyPixy(snapshot: BrainSnapshot | null): void {
  if (snapshot === current) return;
  current = snapshot;
  for (const listener of listeners) listener();
}

export function getMyPixy(): BrainSnapshot | null {
  return current;
}

export function subscribeMyPixy(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
