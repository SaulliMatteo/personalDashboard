import { getDatabase } from "../db";
import { colorForSubject } from "./subjectColors";

/*
 * Lettura delle tabelle dello Studio per chi non è lo Studio (il Calendario): solo SELECT, mai scritture.
 * Un widget non importa un altro widget, quindi le query che servono fuori stanno qui (come
 * social/modules/study/data/subjectLinksRepository.ts per i Gruppi).
 */

/** Una materia attiva, con il colore che le dà lo Studio (scelto, oppure di palette per posizione). */
export interface SubjectRef {
  id: number;
  name: string;
  color: string;
}

/** Le materie attive nell'ordine dello Studio (nome, senza maiuscole): l'indice decide il colore di palette. */
export async function listActiveSubjects(): Promise<SubjectRef[]> {
  const db = await getDatabase();
  const rows = await db.select<{ id: number; name: string; color: string | null }[]>(
    `SELECT id, name, color FROM subjects WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE`
  );
  return rows.map((r, i) => ({ id: r.id, name: r.name, color: colorForSubject(r, i) }));
}

/** Una sessione di studio finita: [startedAt, endedAt] in ms. */
export interface StudySpan {
  subjectId: number;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
}

/**
 * Le sessioni che si sovrappongono a [startMs, endMs), di tutti i dispositivi (il Calendario confronta il
 * pianificato con lo studio fatto, ovunque sia stato fatto).
 */
export async function getStudySpansBetween(startMs: number, endMs: number): Promise<StudySpan[]> {
  const db = await getDatabase();
  const rows = await db.select<{ subject_id: number; started_at: number; ended_at: number; duration_seconds: number }[]>(
    `SELECT subject_id, started_at, ended_at, duration_seconds FROM study_sessions
     WHERE ended_at > ? AND started_at < ? ORDER BY started_at`,
    [startMs, endMs]
  );
  return rows.map((r) => ({
    subjectId: r.subject_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSeconds: r.duration_seconds,
  }));
}
