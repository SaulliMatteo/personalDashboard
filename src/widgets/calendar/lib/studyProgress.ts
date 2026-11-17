import type { StudyTimerSnapshot } from "../../../core/activity/activityBus";
import { MINUTE } from "./dates";

/*
 * Sessioni di studio pianificate contro lo studio fatto davvero (le sessioni dello Studio): pure.
 * Lo studio conta per una pianificata se è della stessa materia e cade nella sua fascia allargata di MARGIN
 * prima e dopo; conta il tempo dentro quella fascia. Ogni sessione vera va a UNA sola pianificata: quella con cui
 * si sovrappone di più (a parità, la più vicina).
 */

export const STUDY_MARGIN_MS = 30 * MINUTE;

export interface PlannedStudy {
  key: string;
  subjectId: number;
  start: number;
  end: number;
}

export interface DoneSpan {
  subjectId: number;
  startedAt: number;
  endedAt: number;
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Secondi fatti per ogni pianificata (chiave → secondi; quelle senza studio valgono 0). */
export function matchStudy(planned: readonly PlannedStudy[], spans: readonly DoneSpan[], margin = STUDY_MARGIN_MS): Map<string, number> {
  const done = new Map<string, number>(planned.map((p) => [p.key, 0]));
  for (const span of spans) {
    let best: { key: string; ms: number; distance: number } | null = null;
    for (const p of planned) {
      if (p.subjectId !== span.subjectId) continue;
      const ms = overlap(span.startedAt, span.endedAt, p.start - margin, p.end + margin);
      if (ms <= 0) continue;
      const distance = Math.abs(span.startedAt - p.start);
      if (!best || ms > best.ms || (ms === best.ms && distance < best.distance)) best = { key: p.key, ms, distance };
    }
    if (best) done.set(best.key, (done.get(best.key) ?? 0) + best.ms / 1000);
  }
  return done;
}

/**
 * Lo studio in corso adesso come sessione (dall'inizio stimato a ora), per contarlo prima che finisca.
 * null se il timer non è in una fase di lavoro o non ha materia.
 */
export function liveSpan(timer: StudyTimerSnapshot | null, subjectId: number | null, now: number): DoneSpan | null {
  if (!timer || timer.phase !== "work" || subjectId === null) return null;
  const elapsed = timer.accumulatedSeconds * 1000 + (timer.runningSince === null ? 0 : Math.max(0, now - timer.runningSince));
  if (elapsed <= 0) return null;
  return { subjectId, startedAt: now - elapsed, endedAt: now };
}

/**
 * planned = in programma (cerchio vuoto); running = il timer sta andando su questa materia nella sua fascia;
 * done = c'è studio (cerchio pieno, anche se meno del previsto); missed = la fascia è passata senza studio.
 */
export type StudyState = "planned" | "running" | "done" | "missed";

export function studyState(
  p: Pick<PlannedStudy, "subjectId" | "start" | "end">,
  doneSeconds: number,
  now: number,
  liveSubjectId: number | null,
  margin = STUDY_MARGIN_MS
): StudyState {
  if (liveSubjectId === p.subjectId && now >= p.start - margin && now < p.end + margin) return "running";
  if (doneSeconds >= 60) return "done";
  return now >= p.end ? "missed" : "planned";
}

/** Fatto almeno quanto pianificato (per festeggiare). */
export function isComplete(p: Pick<PlannedStudy, "start" | "end">, doneSeconds: number): boolean {
  return p.end > p.start && doneSeconds * 1000 >= p.end - p.start;
}
