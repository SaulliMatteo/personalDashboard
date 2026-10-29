import { createContext, useContext } from "react";
import type { ChannelState } from "./presenceHub";
import type { StudyPresence } from "./payload";

/* Contesto e hook separati dal provider (StudyPresenceProvider.tsx), come per le impostazioni. */

export interface StudyPresenceValue {
  /** gruppo → utente → stato live. Chi non c'è è offline. Vuoto se l'account non è pronto. */
  members: Record<string, Record<string, StudyPresence>>;
  channels: Record<string, ChannelState>;
  /** Ora del server stimata adesso (ms): con questa si calcolano i timer degli altri. */
  serverNow: () => number;
  /** Sala scelta nella stanza comune per gruppo (assente = riempimento automatico). La vedono anche i compagni. */
  rooms: Record<string, number>;
  /** Posto scelto nella sala scelta, per gruppo (assente = posto automatico). */
  seats: Record<string, number>;
  /** Sceglie la sala (null = automatica) e torna al posto automatico. */
  setRoom: (groupId: string, room: number | null) => void;
  /** Sceglie sala e posto insieme. */
  setSeat: (groupId: string, room: number, seat: number) => void;
}

export const StudyPresenceContext = createContext<StudyPresenceValue | undefined>(undefined);

export function useStudyPresence() {
  const ctx = useContext(StudyPresenceContext);
  if (!ctx) throw new Error("useStudyPresence deve essere usato dentro <StudyPresenceProvider>");
  return ctx;
}
