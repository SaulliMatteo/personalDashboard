import { createContext, useContext } from "react";
import type { Subject, SubjectMode, SubjectSettingsPatch, TimerPhase } from "../data/studyRepository";

/* Contesto e hook separati dal provider: così l'aggiornamento a caldo di Vite non crea
   un secondo contesto quando cambia il file del provider (o qualcosa che importa). */

/** "archived" = esiste già una materia ARCHIVIATA con questo nome (si ripristina, non si ricrea). */
export type AddSubjectResult = "ok" | "empty" | "duplicate" | "archived" | "error";

export interface TimerContextValue {
  /** True quando stato timer + materie sono stati caricati dal DB. */
  ready: boolean;
  phase: TimerPhase;
  subjectId: number | null;
  /**
   * Pomodoro: secondi rimanenti. Cronometro: secondi trascorsi.
   * Sempre aggiornato al secondo anche mentre il timer corre.
   */
  displaySeconds: number;
  /** Durata nominale della fase (0 per il cronometro). */
  phaseTotalSeconds: number;
  isRunning: boolean;
  /** True se la sessione corrente è un cronometro (conta in avanti, nessuna fase/pausa). */
  isStopwatch: boolean;
  /** Pomodori di lavoro completati dall'ultima pausa lunga. */
  cycleCount: number;
  subjects: Subject[];
  /** subjectId -> secondi studiati oggi. */
  todayBySubject: Record<number, number>;
  startWork: (subjectId: number) => Promise<void>;
  switchSubject: (subjectId: number) => Promise<void>;
  pause: () => void;
  resume: () => void;
  /** Ferma la sessione di studio (registra il tempo) oppure salta la pausa (nessun log). */
  stopOrSkip: () => Promise<void>;
  addSubject: (name: string, mode?: SubjectMode) => Promise<AddSubjectResult>;
  updateSubject: (id: number, patch: SubjectSettingsPatch) => Promise<void>;
  /** "duplicate" = nome già usato da un'altra materia attiva; "archived" = da una archiviata. Maiuscole ignorate. */
  renameSubject: (id: number, name: string) => Promise<AddSubjectResult>;
  /** Toglie la materia dal timer ma ne conserva lo storico nel report. */
  archiveSubject: (id: number) => Promise<void>;
  restoreSubject: (id: number) => Promise<void>;
}

export const TimerContext = createContext<TimerContextValue | undefined>(undefined);

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer deve essere usato dentro <TimerProvider>");
  return ctx;
}
