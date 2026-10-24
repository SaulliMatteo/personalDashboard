import { createContext, useContext } from "react";
import type { PixyPresence } from "./payload";

/* Contesto e hook separati dal provider (PixyPresenceProvider.tsx), come per le impostazioni. */

export interface PixyPresenceValue {
  /** gruppo → utente → Pixy ricevuto (aspetto, e il cervello se lo condivide). Vuoto senza account pronto. */
  members: Record<string, Record<string, PixyPresence>>;
  /** Ora del server − ora locale (ms): riporta all'orologio locale gli istanti ricevuti. */
  offsetMs: number;
}

export const PixyPresenceContext = createContext<PixyPresenceValue | undefined>(undefined);

export function usePixyPresence() {
  const ctx = useContext(PixyPresenceContext);
  if (!ctx) throw new Error("usePixyPresence deve essere usato dentro <PixyPresenceProvider>");
  return ctx;
}
