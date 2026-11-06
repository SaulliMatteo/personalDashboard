import { useSyncExternalStore } from "react";

/**
 * Layout compatto (telefono, docs/design/mobile/viste.html): quando il lato corto della finestra è sotto
 * i 600 dp, la soglia dei telefoni su Android (i tablet partono da 600). Vale in verticale e in orizzontale;
 * tablet e finestre desktop (minimo 1200×620) restano nel layout desktop. È l'unica definizione: il CSS
 * usa `:root[data-compact]`, che imposta AppShell da questo hook.
 */
export const COMPACT_QUERY = "(max-width: 599.98px), (max-height: 599.98px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(COMPACT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const snapshot = () => window.matchMedia(COMPACT_QUERY).matches;

export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** Telefono in orizzontale: le pagine 2×4 si ridispongono 4×2 (vedi mobileLayout.ts). */
const LANDSCAPE_QUERY = "(orientation: landscape)";

function subscribeLandscape(onChange: () => void) {
  const query = window.matchMedia(LANDSCAPE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useLandscape(): boolean {
  return useSyncExternalStore(subscribeLandscape, () => window.matchMedia(LANDSCAPE_QUERY).matches, () => false);
}

/**
 * Solo dita, niente mouse né trackpad (telefoni e tablet senza tastiera): niente suggerimenti di scorciatoie.
 * Nei CSS la stessa condizione è `@media (hover: none) and (pointer: coarse)`.
 */
const TOUCH_ONLY_QUERY = "(hover: none) and (pointer: coarse)";

function subscribeTouchOnly(onChange: () => void) {
  const query = window.matchMedia(TOUCH_ONLY_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useTouchOnly(): boolean {
  return useSyncExternalStore(subscribeTouchOnly, () => window.matchMedia(TOUCH_ONLY_QUERY).matches, () => false);
}
