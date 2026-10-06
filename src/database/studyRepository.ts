import { getDatabase } from "./db";

export interface Subject {
  id: number;
  name: string;
  createdAt: number;
}

export interface StudySession {
  id: number;
  subjectId: number;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
}

export type TimerPhase = "idle" | "work" | "short_break" | "long_break";

/** Confini (ms) della giornata locale corrente: [inizio, fine). */
export function todayRangeMs(): { start: number; end: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

export interface TimerState {
  subjectId: number | null;
  phase: TimerPhase;
  /** Snapshot valido SOLO quando runningSince è null (timer in pausa o idle). */
  remainingSeconds: number;
  /** Durata nominale della fase corrente, congelata all'avvio della fase. */
  phaseTotalSeconds: number;
  /** Timestamp (ms) di quando il timer è stato avviato/ripreso l'ultima volta. Null se in pausa/idle. */
  runningSince: number | null;
  /** Cicli di lavoro completati dall'ultima pausa lunga, per decidere il prossimo tipo di pausa. */
  cycleCount: number;
}

// ---------------------------------------------------------------------
// Materie
// ---------------------------------------------------------------------

export async function listSubjects(): Promise<Subject[]> {
  const db = await getDatabase();
  const rows = await db.select<{ id: number; name: string; created_at: number }[]>(
    `SELECT id, name, created_at FROM subjects ORDER BY name COLLATE NOCASE`
  );
  return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
}

export async function addSubject(name: string): Promise<Subject> {
  const db = await getDatabase();
  const createdAt = Date.now();
  await db.execute(`INSERT INTO subjects (name, created_at) VALUES (?, ?)`, [name, createdAt]);
  const rows = await db.select<{ id: number }[]>(`SELECT id FROM subjects WHERE name = ?`, [name]);
  return { id: rows[0].id, name, createdAt };
}

export async function deleteSubject(id: number): Promise<void> {
  const db = await getDatabase();
  // Cancella anche lo storico sessioni della materia (ON DELETE CASCADE):
  // eliminare una materia elimina anche i suoi dati di studio passati,
  // non solo lei dall'elenco.
  await db.execute(`DELETE FROM subjects WHERE id = ?`, [id]);
}

// ---------------------------------------------------------------------
// Sessioni di studio (scritte solo per fasi "work" completate o interrotte,
// mai per le pause)
// ---------------------------------------------------------------------

export async function logSession(
  subjectId: number,
  endedAt: number,
  durationSeconds: number
): Promise<void> {
  const db = await getDatabase();
  const startedAt = endedAt - durationSeconds * 1000;
  await db.execute(
    `INSERT INTO study_sessions (subject_id, started_at, ended_at, duration_seconds) VALUES (?, ?, ?, ?)`,
    [subjectId, startedAt, endedAt, durationSeconds]
  );
}

export async function getSessionsBetween(startMs: number, endMs: number): Promise<StudySession[]> {
  const db = await getDatabase();
  const rows = await db.select<
    { id: number; subject_id: number; started_at: number; ended_at: number; duration_seconds: number }[]
  >(
    `SELECT id, subject_id, started_at, ended_at, duration_seconds
     FROM study_sessions
     WHERE ended_at >= ? AND ended_at < ?
     ORDER BY ended_at ASC`,
    [startMs, endMs]
  );
  return rows.map((r) => ({
    id: r.id,
    subjectId: r.subject_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSeconds: r.duration_seconds,
  }));
}

// ---------------------------------------------------------------------
// Stato del timer (riga singola, id = 1)
// ---------------------------------------------------------------------

export async function loadTimerState(): Promise<TimerState> {
  const db = await getDatabase();
  const rows = await db.select<
    {
      subject_id: number | null;
      phase: TimerPhase;
      remaining_seconds: number;
      phase_total_seconds: number;
      running_since: number | null;
      cycle_count: number;
    }[]
  >(
    `SELECT subject_id, phase, remaining_seconds, phase_total_seconds, running_since, cycle_count
     FROM timer_state WHERE id = 1`
  );
  const row = rows[0];
  return {
    subjectId: row.subject_id,
    phase: row.phase,
    remainingSeconds: row.remaining_seconds,
    phaseTotalSeconds: row.phase_total_seconds,
    runningSince: row.running_since,
    cycleCount: row.cycle_count,
  };
}

export async function saveTimerState(state: TimerState): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE timer_state SET
       subject_id = ?, phase = ?, remaining_seconds = ?, phase_total_seconds = ?,
       running_since = ?, cycle_count = ?
     WHERE id = 1`,
    [
      state.subjectId,
      state.phase,
      state.remainingSeconds,
      state.phaseTotalSeconds,
      state.runningSince,
      state.cycleCount,
    ]
  );
}
