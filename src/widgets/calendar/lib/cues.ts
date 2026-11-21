import { MINUTE } from "./dates";
import { STUDY_MARGIN_MS, isComplete } from "./studyProgress";
import type { Occurrence } from "./types";

/*
 * I momenti del calendario a cui reagisce il Companion (pure): un impegno che sta per iniziare, una sessione
 * pianificata non iniziata, una sessione pianificata completata. Il provider li manda sul bus una volta sola per
 * occorrenza (la chiave).
 */

/** "Sta per iniziare": l'impegno parte entro così. */
export const SOON_MS = 5 * MINUTE;

/**
 * Una sessione pianificata è "non iniziata" se dopo così dall'inizio non c'è studio. Lo si dice fino a STUDY_MARGIN_MS
 * dopo la fine: anche una sessione appena passata (o inserita a cose fatte) senza studio va fatta notare.
 */
export const MISSED_AFTER_MS = 10 * MINUTE;

export type CalendarCue =
  | { type: "calendarSoon"; key: string; title: string; minutes: number }
  | { type: "plannedStudyMissed"; key: string; title: string }
  | { type: "plannedStudyDone"; key: string; title: string; minutes: number };

export interface CueInput {
  occurrences: readonly Occurrence[];
  /** Secondi di studio fatti per ogni sessione pianificata (chiave dell'occorrenza). */
  doneSeconds: ReadonlyMap<string, number>;
  /** Materia del timer di Studio in fase di lavoro adesso (null = fermo, in pausa pranzo o senza materia). */
  liveSubjectId: number | null;
  /** Il nome da dire (materia per le sessioni, titolo per gli eventi). */
  label: (o: Occurrence) => string;
  now: number;
}

export function calendarCues({ occurrences, doneSeconds, liveSubjectId, label, now }: CueInput): CalendarCue[] {
  const cues: CalendarCue[] = [];
  for (const o of occurrences) {
    const e = o.event;
    if (e.allDay || e.kind === "reminder") continue;
    if (e.kind === "event") {
      const ahead = o.start - now;
      if (ahead > 0 && ahead <= SOON_MS) cues.push({ type: "calendarSoon", key: `soon:${o.key}`, title: label(o), minutes: Math.max(1, Math.round(ahead / MINUTE)) });
      continue;
    }
    if (e.subjectId === null) continue;
    const done = doneSeconds.get(o.key) ?? 0;
    const missedFrom = Math.min(o.start + MISSED_AFTER_MS, o.end);
    if (now >= missedFrom && now < o.end + STUDY_MARGIN_MS && done < 60 && liveSubjectId !== e.subjectId) {
      cues.push({ type: "plannedStudyMissed", key: `missed:${o.key}`, title: label(o) });
    }
    // completata: si festeggia finché si è ancora vicini alla sua fascia, non per quelle di giorni fa
    if (isComplete(o, done) && now >= o.start && now < o.end + STUDY_MARGIN_MS) {
      cues.push({ type: "plannedStudyDone", key: `done:${o.key}`, title: label(o), minutes: Math.round(done / 60) });
    }
  }
  return cues;
}
