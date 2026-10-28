import { createContext, useContext } from "react";

/* Contesto e hook separati dal provider (StudySyncProvider.tsx), come per le impostazioni. */

export interface StudySyncValue {
  /** Chiede un invio tra `delayMs` (es. dopo aver cambiato un abbinamento del report per materie). */
  requestSync: (delayMs?: number) => void;
}

export const StudySyncContext = createContext<StudySyncValue | undefined>(undefined);

export function useStudySync() {
  const ctx = useContext(StudySyncContext);
  if (!ctx) throw new Error("useStudySync deve essere usato dentro <StudySyncProvider>");
  return ctx;
}
