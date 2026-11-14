import { createContext, useContext } from "react";
import type { Progression } from "../lib/progression";

/* Contesto e hook separati dal provider, come timer/useTimer.ts (aggiornamento a caldo di Vite). */

export const ProgressionContext = createContext<Progression | null>(null);

/** La progressione dello Studio (ProgressionProvider); null finché le sessioni non sono caricate. */
export function useProgression(): Progression | null {
  return useContext(ProgressionContext);
}
