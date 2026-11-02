import { useEffect, useState } from "react";
import { EMPTY_SUGGESTION, getSuggestion, subscribeSuggestion, type Suggestion } from "../lib/suggestion";

/**
 * Il video consigliato (vedi lib/suggestion.ts). undefined = in caricamento. Si rilegge al montaggio, dopo un
 * rinvio/scarto/annulla e quando cambia `dataKey` (es. l'elenco dei video della pagina dopo un reload()).
 */
export function useSuggestion(dataKey?: unknown): Suggestion | undefined {
  const [suggestion, setSuggestion] = useState<Suggestion | undefined>(undefined);
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeSuggestion(() => setTick((t) => t + 1)), []);

  useEffect(() => {
    let cancelled = false;
    getSuggestion()
      .then((result) => {
        if (!cancelled) setSuggestion(result);
      })
      .catch((error: unknown) => {
        console.error("Errore nel calcolo del video consigliato:", error);
        if (!cancelled) setSuggestion(EMPTY_SUGGESTION);
      });
    return () => {
      cancelled = true;
    };
  }, [tick, dataKey]);

  return suggestion;
}
