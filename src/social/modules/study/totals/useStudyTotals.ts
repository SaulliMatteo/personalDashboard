import { createContext, useContext } from "react";

/* Contesto e hook separati dal provider (StudyTotalsProvider.tsx), come per le impostazioni. */

export interface StudyTotalsValue {
  /** utente → secondi salvati oggi (giorno locale di questo computer). I miei vengono dal database locale. */
  today: Record<string, number>;
  /** utente → secondi salvati da lunedì a oggi. */
  week: Record<string, number>;
  /** L'ultima lettura dal server è fallita: i totali degli altri sono quelli di `loadedAt`. */
  stale: boolean;
  loadedAt: number | null;
}

export const StudyTotalsContext = createContext<StudyTotalsValue | undefined>(undefined);

export function useStudyTotals() {
  const ctx = useContext(StudyTotalsContext);
  if (!ctx) throw new Error("useStudyTotals deve essere usato dentro <StudyTotalsProvider>");
  return ctx;
}
