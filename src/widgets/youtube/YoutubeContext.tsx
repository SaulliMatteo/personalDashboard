import { useEffect, type ReactNode } from "react";
import { fillMissingDurations } from "./lib/durationFill";
import { invalidateSuggestion } from "./lib/suggestion";

/**
 * Sempre montato (come i provider degli altri widget), ma non offre un contesto: tiene solo in vita, ad app
 * aperta, il riempimento delle durate mancanti (lib/durationFill.ts). Il player vero resta nella pagina di
 * dettaglio e si ferma lasciandola.
 */
export function YoutubeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const controller = new AbortController();
    fillMissingDurations(controller.signal, invalidateSuggestion).catch((e: unknown) =>
      console.error("Riempimento delle durate interrotto:", e)
    );
    return () => controller.abort();
  }, []);

  return children;
}
