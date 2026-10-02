import { useSyncExternalStore } from "react";
import type { AppSettings } from "./schema";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(LIGHT_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True se il sistema operativo è in tema chiaro. Si aggiorna da solo. */
export function useSystemPrefersLight(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(LIGHT_QUERY).matches,
    () => false
  );
}

/** "system" -> tema effettivo in base al sistema; gli altri passano invariati. */
export function resolveTheme(theme: AppSettings["theme"], systemPrefersLight: boolean): "dark" | "light" {
  if (theme === "system") return systemPrefersLight ? "light" : "dark";
  return theme;
}
