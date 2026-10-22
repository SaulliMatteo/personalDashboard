import { useSyncExternalStore } from "react";

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

/**
 * True se il sistema operativo è in modalità scura. Si aggiorna da solo quando
 * il sistema cambia, con l'app aperta: serve alla variante "auto" dei temi.
 */
export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
