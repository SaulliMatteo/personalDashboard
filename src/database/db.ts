import Database from "@tauri-apps/plugin-sql";

// Bump quando una modifica allo schema/alle unità del layout rende i dati
// salvati non più validi. Salvato in PRAGMA user_version (dentro il file DB).
const CURRENT_LAYOUT_SCHEMA_VERSION = 1;

let dbPromise: Promise<Database> | null = null;

export function getDatabase() {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:dashboard.db");
  }
  return dbPromise;
}

// Anche l'inizializzazione è una promise condivisa: chiamarla più volte
// (Layout, Timer, ...) riusa la stessa esecuzione invece di rilanciarla.
let initPromise: Promise<void> | null = null;

export function initializeDatabase(): Promise<void> {
  if (!initPromise) {
    initPromise = runInitialization().catch((error) => {
      initPromise = null; // permette un nuovo tentativo dopo un errore
      throw error;
    });
  }
  return initPromise;
}

async function runInitialization() {
  const database = await getDatabase();

  await database.execute(`PRAGMA foreign_keys = ON`);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS dashboard_layout (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      widget_id TEXT NOT NULL UNIQUE,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      w INTEGER NOT NULL,
      h INTEGER NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS timer_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      phase TEXT NOT NULL,
      remaining_seconds INTEGER NOT NULL,
      phase_total_seconds INTEGER NOT NULL,
      running_since INTEGER,
      cycle_count INTEGER NOT NULL DEFAULT 0
    )
  `);

  await database.execute(`
    INSERT OR IGNORE INTO timer_state
      (id, subject_id, phase, remaining_seconds, phase_total_seconds, running_since, cycle_count)
    VALUES (1, NULL, 'idle', 0, 0, NULL, 0)
  `);

  const rows = await database.select<{ user_version: number }[]>(`PRAGMA user_version`);
  const currentVersion = rows[0]?.user_version ?? 0;
  if (currentVersion < CURRENT_LAYOUT_SCHEMA_VERSION) {
    await database.execute(`DELETE FROM dashboard_layout`);
    // PRAGMA non accetta parametri: il valore è una costante nostra, non input utente.
    await database.execute(`PRAGMA user_version = ${CURRENT_LAYOUT_SCHEMA_VERSION}`);
  }
}