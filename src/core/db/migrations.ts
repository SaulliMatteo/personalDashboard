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
  {
    version: 3,
    description: "Materie: colore, modalità (pomodoro/cronometro) e durate proprie; indice sulle sessioni",
    statements: [
      // ALTER TABLE ADD COLUMN non è idempotente: se la colonna esiste già
      // (DB creato da versioni precedenti dell'app) il runner ignora l'errore
      // "duplicate column name" e prosegue (vedi core/db/index.ts).
      `ALTER TABLE subjects ADD COLUMN color TEXT`,
      `ALTER TABLE subjects ADD COLUMN mode TEXT NOT NULL DEFAULT 'pomodoro'`,
      `ALTER TABLE subjects ADD COLUMN work_minutes INTEGER NOT NULL DEFAULT 25`,
      `ALTER TABLE subjects ADD COLUMN short_break_minutes INTEGER NOT NULL DEFAULT 5`,
      `ALTER TABLE subjects ADD COLUMN long_break_minutes INTEGER NOT NULL DEFAULT 15`,
      `ALTER TABLE subjects ADD COLUMN cycles_before_long_break INTEGER NOT NULL DEFAULT 4`,
      // I report leggono le sessioni per intervallo di date: senza indice
      // la query scorrerebbe tutta la tabella (conta quando lo storico cresce).
      `CREATE INDEX IF NOT EXISTS idx_study_sessions_ended_at ON study_sessions(ended_at)`,
    ],
  },
  {
    version: 4,
    description: "Widget YouTube: cartelle ad albero, video salvati, note con timestamp",
    statements: [
      `CREATE TABLE IF NOT EXISTS video_folders (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         parent_id INTEGER,
         name TEXT NOT NULL,
         color TEXT,
         created_at INTEGER NOT NULL
       )`,
      // Nomi unici tra "fratelli". COALESCE perché in SQLite i NULL non
      // si considerano uguali tra loro nei vincoli UNIQUE (cartelle radice).
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_video_folders_sibling_name
         ON video_folders(COALESCE(parent_id, 0), name COLLATE NOCASE)`,
      `CREATE TABLE IF NOT EXISTS saved_videos (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         youtube_id TEXT NOT NULL UNIQUE,
         title TEXT NOT NULL,
         channel TEXT NOT NULL DEFAULT '',
         thumbnail_url TEXT,
         duration_seconds INTEGER,
         folder_id INTEGER,
         position INTEGER NOT NULL DEFAULT 0,
         watched INTEGER NOT NULL DEFAULT 0,
         position_seconds INTEGER NOT NULL DEFAULT 0,
         created_at INTEGER NOT NULL,
         last_watched_at INTEGER
       )`,
      `CREATE INDEX IF NOT EXISTS idx_saved_videos_folder ON saved_videos(folder_id, position)`,
      `CREATE TABLE IF NOT EXISTS video_notes (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         video_id INTEGER NOT NULL,
         timestamp_seconds INTEGER NOT NULL,
         text TEXT NOT NULL,
         created_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_video_notes_video ON video_notes(video_id, timestamp_seconds)`,
    ],
  },
  {
    version: 5,
    description: "Materie archiviabili: eliminare una materia non cancella più il suo storico di studio",
    statements: [
      // NULL = materia attiva; un timestamp (ms) = archiviata in quel momento.
      // Il runner tollera "duplicate column name" se la migrazione viene rieseguita.
      `ALTER TABLE subjects ADD COLUMN archived_at INTEGER`,
    ],
  },
  {
    version: 6,
    description: "YouTube: sessioni di visione (tempo realmente guardato) per il report",
    statements: [
      // Una riga per ogni intervallo in cui un video è stato in riproduzione. Niente
      // REFERENCES/CASCADE: eliminare un video NON cancella il tempo già guardato
      // (come per le materie archiviate, lo storico non si perde).
      `CREATE TABLE IF NOT EXISTS video_watch_sessions (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         video_id INTEGER NOT NULL,
         started_at INTEGER NOT NULL,
         ended_at INTEGER NOT NULL,
         duration_seconds INTEGER NOT NULL
       )`,
      // Il report legge le sessioni per intervallo di date, e le conta per video.
      `CREATE INDEX IF NOT EXISTS idx_video_watch_sessions_ended_at ON video_watch_sessions(ended_at)`,
      `CREATE INDEX IF NOT EXISTS idx_video_watch_sessions_video ON video_watch_sessions(video_id)`,
    ],
  },
  {
    version: 7,
    description: "Griglia 6 colonne con le nuove taglie: azzera i layout salvati",
    statements: [
      // Il passaggio alla griglia 6×4 (taglie S/W/T/M/STRIP/L/XL) rende non validi i
      // layout a 4 colonne: non c'è una conversione sensata, si riparte dal default.
      `DELETE FROM dashboard_layout`,
      // Senza questo flag il LayoutProvider userebbe il layout vuoto invece del default.
      `DELETE FROM meta WHERE key = 'layout_initialized'`,
    ],
  },
  {
    version: 8,
    description: "Quaderno: cartelle, note, pagine (testo + scrittura a mano)",
    statements: [
      // Cartelle ad albero (parent_id NULL = radice); color è scelto dall'utente.
      `CREATE TABLE IF NOT EXISTS note_folders (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         parent_id INTEGER,
         name TEXT NOT NULL,
         color TEXT,
         icon TEXT NOT NULL DEFAULT 'folder',
         created_at INTEGER NOT NULL
       )`,
      // tags è un array JSON; deleted_at non NULL = nota nel cestino.
      `CREATE TABLE IF NOT EXISTS notes (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         folder_id INTEGER,
         title TEXT NOT NULL DEFAULT '',
         tags TEXT NOT NULL DEFAULT '[]',
         starred INTEGER NOT NULL DEFAULT 0,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL,
         deleted_at INTEGER
       )`,
      // Una nota ha una o più pagine: content è HTML, ink sono i tratti a mano (JSON).
      `CREATE TABLE IF NOT EXISTS note_pages (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         note_id INTEGER NOT NULL,
         position INTEGER NOT NULL,
         content TEXT NOT NULL DEFAULT '',
         ink TEXT NOT NULL DEFAULT '[]'
       )`,
      `CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id)`,
      `CREATE INDEX IF NOT EXISTS idx_note_pages_note ON note_pages(note_id, position)`,
    ],
  },
  {
    version: 9,
    description: "Notes: sfondo pagina, copia su disco, allegati",
    statements: [
      `ALTER TABLE note_pages ADD COLUMN background TEXT NOT NULL DEFAULT 'none'`,
      `ALTER TABLE notes ADD COLUMN disk_path TEXT`,
      `ALTER TABLE notes ADD COLUMN synced_at INTEGER`,
      `CREATE TABLE IF NOT EXISTS note_attachments (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         note_id INTEGER NOT NULL,
         name TEXT NOT NULL,
         size INTEGER NOT NULL,
         created_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_note_attachments_note ON note_attachments(note_id)`,
    ],
  },
  {
    version: 10,
    description: "Riparazione: YouTube (cartelle, video, note), archived_at e sessioni di visione per DB già oltre la v4",
    statements: [
      `ALTER TABLE subjects ADD COLUMN archived_at INTEGER`,

      `CREATE TABLE IF NOT EXISTS video_folders (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         parent_id INTEGER,
         name TEXT NOT NULL,
         color TEXT,
         created_at INTEGER NOT NULL
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_video_folders_sibling_name
         ON video_folders(COALESCE(parent_id, 0), name COLLATE NOCASE)`,
      `CREATE TABLE IF NOT EXISTS saved_videos (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         youtube_id TEXT NOT NULL UNIQUE,
         title TEXT NOT NULL,
         channel TEXT NOT NULL DEFAULT '',
         thumbnail_url TEXT,
         duration_seconds INTEGER,
         folder_id INTEGER,
         position INTEGER NOT NULL DEFAULT 0,
         watched INTEGER NOT NULL DEFAULT 0,
         position_seconds INTEGER NOT NULL DEFAULT 0,
         created_at INTEGER NOT NULL,
         last_watched_at INTEGER
       )`,
      `CREATE INDEX IF NOT EXISTS idx_saved_videos_folder ON saved_videos(folder_id, position)`,
      `CREATE TABLE IF NOT EXISTS video_notes (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         video_id INTEGER NOT NULL,
         timestamp_seconds INTEGER NOT NULL,
         text TEXT NOT NULL,
         created_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_video_notes_video ON video_notes(video_id, timestamp_seconds)`,

      `CREATE TABLE IF NOT EXISTS video_watch_sessions (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         video_id INTEGER NOT NULL,
         started_at INTEGER NOT NULL,
         ended_at INTEGER NOT NULL,
         duration_seconds INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_video_watch_sessions_ended_at ON video_watch_sessions(ended_at)`,
      `CREATE INDEX IF NOT EXISTS idx_video_watch_sessions_video ON video_watch_sessions(video_id)`,
    ],
  },
    {
    version: 11,
    description: "Notes: colore della pagina scelto dall'utente",
    statements: [
      // NULL = colore del tema; altrimenti #rrggbb.
      `ALTER TABLE note_pages ADD COLUMN color TEXT`,
    ],
  },
  {
    version: 12,
    description: "Notes: font predefinito della nota",
    statements: [
      // NULL = font del tema; altrimenti una chiave di widgets/notes/lib/textStyle.ts (sans, serif…).
      `ALTER TABLE notes ADD COLUMN font TEXT`,
    ],
  },
];
