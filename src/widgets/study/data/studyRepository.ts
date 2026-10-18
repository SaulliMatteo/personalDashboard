import { getDatabase } from "../../../core/db";

export type SubjectMode = "pomodoro" | "stopwatch";

export interface Subject {
  id: number;
  name: string;
  createdAt: number;
  /** Colore scelto dall'utente (hex); null = colore di palette automatico. */
  color: string | null;
  /** "pomodoro" = countdown con pause e cicli; "stopwatch" = cronometro che conta in avanti, senza automatismi. */
  mode: SubjectMode;
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  /** null = materia attiva; altrimenti quando è stata archiviata (ms). Le archiviate restano nel report. */
  archivedAt: number | null;
}

/** Valori con cui nasce una materia (derivati dalle impostazioni dell'app). */
export type NewSubjectInput = Pick<
  Subject,
  "name" | "color" | "mode" | "workMinutes" | "shortBreakMinutes" | "longBreakMinutes" | "cyclesBeforeLongBreak"
>;

/** Campi modificabili di una materia già esistente (tutti tranne id/nome/data). */
export type SubjectSettingsPatch = Partial<Omit<NewSubjectInput, "name">>;

interface SubjectRow {
  id: number;
  name: string;
  created_at: number;
  color: string | null;
  mode: string;
  work_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  cycles_before_long_break: number;
  archived_at: number | null;
}

const SUBJECT_COLUMNS = `id, name, created_at, color, mode, work_minutes, short_break_minutes,
  long_break_minutes, cycles_before_long_break, archived_at`;

function mapSubjectRow(r: SubjectRow): Subject {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    color: r.color,
    mode: r.mode === "stopwatch" ? "stopwatch" : "pomodoro",
    workMinutes: r.work_minutes,
    shortBreakMinutes: r.short_break_minutes,
    longBreakMinutes: r.long_break_minutes,
    cyclesBeforeLongBreak: r.cycles_before_long_break,
    archivedAt: r.archived_at,
  };
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
  /** Cicli di lavoro completati, per decidere il prossimo tipo di pausa. */
  cycleCount: number;
}

// ---------------------------------------------------------------------
// Materie
// ---------------------------------------------------------------------

/** Le materie ATTIVE: quelle che compaiono nel timer, nel widget e nell'elenco. */
export async function listSubjects(): Promise<Subject[]> {
  const db = await getDatabase();
  const rows = await db.select<SubjectRow[]>(
    `SELECT ${SUBJECT_COLUMNS} FROM subjects WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE`
  );
  return rows.map(mapSubjectRow);
}

export async function listArchivedSubjects(): Promise<Subject[]> {
  const db = await getDatabase();
  const rows = await db.select<SubjectRow[]>(
    `SELECT ${SUBJECT_COLUMNS} FROM subjects WHERE archived_at IS NOT NULL ORDER BY name COLLATE NOCASE`
  );
  return rows.map(mapSubjectRow);
}

/** Attive + archiviate: serve al report per dare nome e colore anche alle materie archiviate. */
export async function listAllSubjects(): Promise<Subject[]> {
  const db = await getDatabase();
  const rows = await db.select<SubjectRow[]>(`SELECT ${SUBJECT_COLUMNS} FROM subjects ORDER BY name COLLATE NOCASE`);
  return rows.map(mapSubjectRow);
}

export async function addSubject(input: NewSubjectInput): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO subjects (name, created_at, color, mode, work_minutes, short_break_minutes,
                           long_break_minutes, cycles_before_long_break)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      Date.now(),
      input.color,
      input.mode,
      input.workMinutes,
      input.shortBreakMinutes,
      input.longBreakMinutes,
      input.cyclesBeforeLongBreak,
    ]
  );
}

// Whitelist esplicita chiave -> colonna: i nomi di colonna finiscono nella
// stringa SQL, quindi non vengono mai presi da input esterno.
const PATCH_COLUMNS: Record<keyof SubjectSettingsPatch, string> = {
  color: "color",
  mode: "mode",
  workMinutes: "work_minutes",
  shortBreakMinutes: "short_break_minutes",
  longBreakMinutes: "long_break_minutes",
  cyclesBeforeLongBreak: "cycles_before_long_break",
};

export async function updateSubject(id: number, patch: SubjectSettingsPatch): Promise<void> {
  const keys = (Object.keys(patch) as (keyof SubjectSettingsPatch)[]).filter((k) => k in PATCH_COLUMNS);
  if (keys.length === 0) return;
  const db = await getDatabase();
  const assignments = keys.map((k) => `${PATCH_COLUMNS[k]} = ?`).join(", ");
  await db.execute(`UPDATE subjects SET ${assignments} WHERE id = ?`, [...keys.map((k) => patch[k] ?? null), id]);
}

/** Cambia il nome di una materia. Lancia un errore UNIQUE se il nome è già preso (il controllo "gentile" sta in TimerContext). */
export async function renameSubject(id: number, name: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE subjects SET name = ? WHERE id = ?`, [name.trim(), id]);
}

/**
 * Archivia una materia: sparisce dal timer ma le sue sessioni restano nel
 * report. Non esiste più una cancellazione definitiva (era il modo in cui
 * si perdeva lo storico). `effectiveColor` fissa il colore mostrato finora
 * se la materia non ne aveva uno scelto, così nel report non cambia quando
 * le altre materie cambiano posizione nell'elenco.
 */
export async function archiveSubject(id: number, effectiveColor: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE subjects SET archived_at = ?, color = COALESCE(color, ?) WHERE id = ?`, [
    Date.now(),
    effectiveColor,
    id,
  ]);
  await db.execute(`UPDATE timer_state SET subject_id = NULL WHERE subject_id = ?`, [id]);
}

export async function restoreSubject(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE subjects SET archived_at = NULL WHERE id = ?`, [id]);
}

// ---------------------------------------------------------------------
// Sessioni di studio (scritte solo per fasi "work" completate o interrotte)
// ---------------------------------------------------------------------

export async function logSession(subjectId: number, endedAt: number, durationSeconds: number): Promise<void> {
  const db = await getDatabase();
  const startedAt = endedAt - durationSeconds * 1000;
  await db.execute(
    `INSERT INTO study_sessions (subject_id, started_at, ended_at, duration_seconds) VALUES (?, ?, ?, ?)`,
    [subjectId, startedAt, endedAt, durationSeconds]
  );
}

/** Istante (ms) della sessione più vecchia, o null se non ce ne sono: il report lo usa per non farti tornare indietro nel vuoto. */
export async function getFirstSessionTime(): Promise<number | null> {
  const db = await getDatabase();
  const rows = await db.select<{ first: number | null }[]>(`SELECT MIN(ended_at) AS first FROM study_sessions`);
  return rows[0]?.first ?? null;
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
    [state.subjectId, state.phase, state.remainingSeconds, state.phaseTotalSeconds, state.runningSince, state.cycleCount]
  );
}
