/**
 * Migrazioni versionate. La versione corrente del DB vive in
 * PRAGMA user_version (dentro il file SQLite, quindi non può mai
 * "disallinearsi" da un file esterno).
 *
 * REGOLE per aggiungerne una nuova:
 *  - aggiungi un elemento in fondo con version = ultima + 1;
 *  - non modificare MAI una migrazione già rilasciata;
 *  - scrivi statement idempotenti (IF NOT EXISTS, INSERT OR IGNORE):
 *    con il pool di plugin-sql non c'è una transazione affidabile, quindi
 *    se l'app si chiude a metà la migrazione deve poter essere rieseguita.
 */
export interface Migration {
  version: number;
  description: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "Tabelle base: layout, materie, sessioni di studio, stato timer",
    statements: [
      `CREATE TABLE IF NOT EXISTS dashboard_layout (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         widget_id TEXT NOT NULL UNIQUE,
         x INTEGER NOT NULL,
         y INTEGER NOT NULL,
         w INTEGER NOT NULL,
         h INTEGER NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS subjects (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL UNIQUE,
         created_at INTEGER NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS study_sessions (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
         started_at INTEGER NOT NULL,
         ended_at INTEGER NOT NULL,
         duration_seconds INTEGER NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS timer_state (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
         phase TEXT NOT NULL,
         remaining_seconds INTEGER NOT NULL,
         phase_total_seconds INTEGER NOT NULL,
         running_since INTEGER,
         cycle_count INTEGER NOT NULL DEFAULT 0
       )`,
      `INSERT OR IGNORE INTO timer_state
         (id, subject_id, phase, remaining_seconds, phase_total_seconds, running_since, cycle_count)
       VALUES (1, NULL, 'idle', 0, 0, NULL, 0)`,
      // Il passaggio alla griglia 4 colonne ha reso non validi i layout salvati prima.
      `DELETE FROM dashboard_layout`,
    ],
  },
  {
    version: 2,
    description: "Impostazioni (chiave/valore) e metadati dell'app",
    statements: [
      `CREATE TABLE IF NOT EXISTS settings (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS meta (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL
       )`,
    ],
  },
];
