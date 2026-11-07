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

// ---------------------------------------------------------------------------
// Sync tra dispositivi (migrazione 23, core/sync/). Usati SOLO dalla 23: una migrazione rilasciata non si tocca,
// quindi per cambiare i trigger se ne aggiunge una nuova (DROP TRIGGER + CREATE), senza modificare questi.
// ---------------------------------------------------------------------------

/** Uuid v4 casuale calcolato da SQLite (una volta per riga, anche dentro un SELECT). */
const SQL_UUID =
  "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || " +
  "substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))";
/** Adesso in millisecondi (come Date.now()), calcolato da SQLite. */
const SQL_NOW_MS = "CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER)";
/** Falso mentre il sync applica le modifiche arrivate dal cloud: quelle non vanno rimandate indietro. */
const SYNC_QUIET = "(SELECT value FROM sync_state WHERE key = 'applying') = 0";

/**
 * Trigger che segnano in sync_outbox ogni riga cambiata di `table` (una riga per elemento: le modifiche successive
 * la sovrascrivono) e danno a ogni riga un id globale in sync_map, più gli id per le righe che ci sono già.
 * `columns` sono le colonne sincronizzate: un UPDATE che tocca solo le altre (es. notes.synced_at) non conta.
 * `uidFromKey`: l'id globale è la chiave stessa (settings: la stessa impostazione su due dispositivi è un elemento solo).
 * Niente `INSERT OR IGNORE`/`OR REPLACE` nei trigger: se il trigger parte da un UPSERT (es. il salvataggio delle
 * impostazioni) SQLite non li rispetta e l'istruzione fallisce; si usano `WHERE NOT EXISTS` e `ON CONFLICT DO UPDATE`.
 */
function syncTracking(table: string, key: string, columns: string[], uidFromKey = false): string[] {
  const newUid = uidFromKey ? `NEW.${key}` : SQL_UUID;
  const changed = columns.map((c) => `OLD.${c} IS NOT NEW.${c}`).join(" OR ");
  const touch = (row: "NEW" | "OLD", deleted: 0 | 1) =>
    `INSERT INTO sync_outbox (tbl, local_id, changed_at, deleted) VALUES ('${table}', ${row}.${key}, ${SQL_NOW_MS}, ${deleted})
       ON CONFLICT (tbl, local_id) DO UPDATE SET changed_at = excluded.changed_at, deleted = excluded.deleted;`;
  const mapRow = `INSERT INTO sync_map (tbl, local_id, uid) SELECT '${table}', NEW.${key}, ${newUid}
       WHERE NOT EXISTS (SELECT 1 FROM sync_map WHERE tbl = '${table}' AND local_id = NEW.${key});`;
  return [
    `CREATE TRIGGER IF NOT EXISTS sync_${table}_ins AFTER INSERT ON ${table} WHEN ${SYNC_QUIET} BEGIN
       ${mapRow}
       ${touch("NEW", 0)}
     END`,
    `CREATE TRIGGER IF NOT EXISTS sync_${table}_upd AFTER UPDATE OF ${columns.join(", ")} ON ${table}
     WHEN ${SYNC_QUIET} AND (${changed}) BEGIN
       ${mapRow}
       ${touch("NEW", 0)}
     END`,
    `CREATE TRIGGER IF NOT EXISTS sync_${table}_del AFTER DELETE ON ${table} WHEN ${SYNC_QUIET} BEGIN
       ${touch("OLD", 1)}
     END`,
    `INSERT OR IGNORE INTO sync_map (tbl, local_id, uid) SELECT '${table}', ${key}, ${uidFromKey ? key : SQL_UUID} FROM ${table}`,
  ];
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
  {
    version: 13,
    description: "Notes: raccolte (tabelle di dati condivise tra le note)",
    statements: [
      // Una raccolta; deleted_at = nel cestino (le viste nelle note mostrano "Ripristina").
      `CREATE TABLE IF NOT EXISTS note_collections (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL,
         icon TEXT NOT NULL DEFAULT 'table',
         color TEXT,
         created_at INTEGER NOT NULL,
         deleted_at INTEGER
       )`,
      // Colonne tipizzate (widgets/notes/lib/collections.ts); options = JSON con le scelte di select/multi.
      `CREATE TABLE IF NOT EXISTS note_collection_fields (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         collection_id INTEGER NOT NULL REFERENCES note_collections(id) ON DELETE CASCADE,
         name TEXT NOT NULL,
         type TEXT NOT NULL,
         options TEXT NOT NULL DEFAULT '{}',
         position INTEGER NOT NULL DEFAULT 0
       )`,
      // data = JSON con i valori per id di campo; deleted_at = riga eliminata (si può ripristinare).
      `CREATE TABLE IF NOT EXISTS note_collection_rows (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         collection_id INTEGER NOT NULL REFERENCES note_collections(id) ON DELETE CASCADE,
         data TEXT NOT NULL DEFAULT '{}',
         position INTEGER NOT NULL DEFAULT 0,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL,
         deleted_at INTEGER
       )`,
      // Modi di guardarla: layout tabella | schede | bacheca; filtro, ordinamento e campi nascosti in JSON.
      `CREATE TABLE IF NOT EXISTS note_collection_views (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         collection_id INTEGER NOT NULL REFERENCES note_collections(id) ON DELETE CASCADE,
         name TEXT NOT NULL DEFAULT '',
         layout TEXT NOT NULL DEFAULT 'tabella',
         filter TEXT NOT NULL DEFAULT '[]',
         sort TEXT,
         fields TEXT NOT NULL DEFAULT '[]',
         group_field INTEGER
       )`,
      `CREATE INDEX IF NOT EXISTS idx_note_collection_fields_coll ON note_collection_fields(collection_id, position)`,
      `CREATE INDEX IF NOT EXISTS idx_note_collection_rows_coll ON note_collection_rows(collection_id, position)`,
      `CREATE INDEX IF NOT EXISTS idx_note_collection_views_coll ON note_collection_views(collection_id)`,
    ],
  },
  {
    version: 14,
    description: "Gruppi: abbinamenti materia locale → materia del gruppo (restano su questo computer)",
    statements: [
      // group_subject_id NULL = "Non condividere" scelto apposta. Niente FK (come le tabelle dalla v8): un
      // abbinamento a una materia locale eliminata si ignora e si toglie alla prima lettura.
      `CREATE TABLE IF NOT EXISTS group_subject_links (
         user_id TEXT NOT NULL,
         group_id TEXT NOT NULL,
         local_subject_id INTEGER NOT NULL,
         group_subject_id TEXT,
         confirmed_at INTEGER NOT NULL,
         PRIMARY KEY (user_id, group_id, local_subject_id)
       )`,
    ],
  },
  {
    version: 15,
    description: "Gruppi: il foglietto Da fare della sessione (resta su questo computer; si condivide solo dal vivo)",
    statements: [
      // done_at NULL = da fare; le fatte si tolgono da sole il giorno dopo (todoRepository.purgeDoneBefore)
      `CREATE TABLE IF NOT EXISTS group_todos (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         text TEXT NOT NULL,
         done_at INTEGER,
         created_at INTEGER NOT NULL
       )`,
    ],
  },
  {
    version: 16,
    description: "Riparazione: colonne delle Note per i DB passati dalla prova dei Gruppi (dove la 11 e la 12 erano loro)",
    statements: [
      // Rieseguite: su un DB che le ha già non fanno nulla (duplicate column ignorato in core/db/index.ts).
      `ALTER TABLE note_pages ADD COLUMN color TEXT`,
      `ALTER TABLE notes ADD COLUMN font TEXT`,
    ],
  },
  {
    version: 17,
    description: "Notes: colore del titolo della nota",
    statements: [
      // NULL = colore del tema; altrimenti "#rrggbb" scelto dall'utente (widgets/notes/lib/titleColor.ts).
      // Rieseguita su un DB che la ha già non fa nulla (duplicate column ignorato in core/db/index.ts).
      `ALTER TABLE notes ADD COLUMN title_color TEXT`,
    ],
  },
  // La 18 è dello Studio (giorni e obiettivi per materia, branch non ancora in dev): qui si salta apposta, così un
  // DB già passato dalla 18 riceve comunque questa. Il runner applica le versioni > user_version, i buchi non contano.
  {
    version: 19,
    description: "YouTube: rinvii dei video consigliati e scarti per canale",
    statements: [
      // Una riga per video, creata al primo rinvio o alla prima proposta. Niente FK: deleteVideo la cancella a mano.
      // snoozed_until e last_suggested_at sono timestamp in ms; NULL = mai rinviato / mai proposto.
      `CREATE TABLE IF NOT EXISTS video_feedback (
         video_id INTEGER PRIMARY KEY,
         snooze_count INTEGER NOT NULL DEFAULT 0,
         snoozed_until INTEGER,
         last_suggested_at INTEGER
       )`,
      // Quanti video di un canale sono stati scartati: resta anche dopo che i video sono stati eliminati.
      `CREATE TABLE IF NOT EXISTS video_channel_feedback (
         channel TEXT PRIMARY KEY,
         dismissed_count INTEGER NOT NULL DEFAULT 0,
         updated_at INTEGER NOT NULL
       )`,
    ],
  },
  {
    version: 20,
    description: "Notes: segni (segnalibri) nel testo e sulla pagina",
    statements: [
      // Segni appoggiati sulla pagina (scrittura a mano): JSON [{id,name,kind,color,x,y}], coordinate come l'inchiostro.
      // Rieseguita su un DB che la ha già non fa nulla (duplicate column ignorato in core/db/index.ts).
      `ALTER TABLE note_pages ADD COLUMN pins TEXT NOT NULL DEFAULT '[]'`,
      // Indice dei segni per il pannello: si ricalcola a ogni salvataggio della pagina dal suo HTML
      // (<span data-bm>) e da pins (widgets/notes/lib/bookmarks.ts). Niente FK, come le altre tabelle delle Note.
      `CREATE TABLE IF NOT EXISTS note_bookmarks (
         id TEXT PRIMARY KEY,
         note_id INTEGER NOT NULL,
         page_id INTEGER NOT NULL,
         place TEXT NOT NULL,
         name TEXT NOT NULL,
         kind TEXT NOT NULL,
         color TEXT,
         position INTEGER NOT NULL,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_note_bookmarks_note ON note_bookmarks(note_id)`,
      `CREATE INDEX IF NOT EXISTS idx_note_bookmarks_page ON note_bookmarks(page_id)`,
    ],
  },
  {
    version: 21,
    description: "Notes: blocchi PDF (pagine di un PDF copiato nella nota) con l'inchiostro separato",
    statements: [
      // NULL = pagina normale; altrimenti JSON del blocco {id, file, name, from, to, sizes, invert?}
      // (widgets/notes/lib/pdf/pdfData.ts). Il PDF sta in Documenti/Notes/<nota>/allegati/.
      // Rieseguite su un DB che le ha già non fanno nulla (duplicate column ignorato in core/db/index.ts).
      `ALTER TABLE note_pages ADD COLUMN pdf TEXT`,
      // Inchiostro sopra le pagine del PDF: JSON {"<numero pagina>": [tratti]}; il PDF resta intatto.
      `ALTER TABLE note_pages ADD COLUMN pdf_ink TEXT NOT NULL DEFAULT '{}'`,
    ],
  },
  {
    version: 22,
    description: "Layout della dashboard sul telefono, separato da quello del desktop (+ riparazione 20-21)",
    statements: [
      // Pagine 2×4 (core/layout/mobileLayout.ts): page da 0, x 0-1, y 0-3, taglie fino a 2×2.
      // dashboard_layout (desktop) non si tocca: i due layout vivono in parallelo.
      `CREATE TABLE IF NOT EXISTS dashboard_layout_mobile (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         widget_id TEXT NOT NULL UNIQUE,
         page INTEGER NOT NULL,
         x INTEGER NOT NULL,
         y INTEGER NOT NULL,
         w INTEGER NOT NULL,
         h INTEGER NOT NULL
       )`,
      // Riparazione: la versione Android di prova usava il numero 20 per questa tabella, quindi i suoi DB (già a 20)
      // salterebbero la 20 delle Note. Si rieseguono 20 e 21: su un DB che le ha già non fanno nulla.
      `ALTER TABLE note_pages ADD COLUMN pins TEXT NOT NULL DEFAULT '[]'`,
      `CREATE TABLE IF NOT EXISTS note_bookmarks (
         id TEXT PRIMARY KEY,
         note_id INTEGER NOT NULL,
         page_id INTEGER NOT NULL,
         place TEXT NOT NULL,
         name TEXT NOT NULL,
         kind TEXT NOT NULL,
         color TEXT,
         position INTEGER NOT NULL,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_note_bookmarks_note ON note_bookmarks(note_id)`,
      `CREATE INDEX IF NOT EXISTS idx_note_bookmarks_page ON note_bookmarks(page_id)`,
      `ALTER TABLE note_pages ADD COLUMN pdf TEXT`,
      `ALTER TABLE note_pages ADD COLUMN pdf_ink TEXT NOT NULL DEFAULT '{}'`,
    ],
  },
  {
    version: 23,
    description: "Sync tra dispositivi: id globali, registro delle modifiche (trigger), origine delle sessioni",
    statements: [
      // Id globale (uuid; per settings la chiave) di ogni riga sincronizzata. local_id è la chiave della tabella:
      // senza tipo, così tiene sia gli id numerici sia le chiavi di settings.
      `CREATE TABLE IF NOT EXISTS sync_map (
         tbl TEXT NOT NULL,
         local_id NOT NULL,
         uid TEXT NOT NULL,
         PRIMARY KEY (tbl, local_id)
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_map_uid ON sync_map(tbl, uid)`,
      // Righe cambiate su questo dispositivo e non ancora mandate al cloud (deleted = eliminata).
      `CREATE TABLE IF NOT EXISTS sync_outbox (
         tbl TEXT NOT NULL,
         local_id NOT NULL,
         changed_at INTEGER NOT NULL,
         deleted INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (tbl, local_id)
       )`,
      // applying = 1 mentre si applicano le modifiche arrivate dal cloud (i trigger tacciono). Una tabella e non una
      // variabile perché plugin-sql usa più connessioni; torna 0 a ogni avvio (core/db/index.ts).
      `CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value INTEGER NOT NULL)`,
      `INSERT OR IGNORE INTO sync_state (key, value) VALUES ('applying', 0)`,
      // Dispositivo (id dei Gruppi) che ha registrato la sessione; NULL = questo. I totali dei Gruppi contano solo
      // le sessioni fatte qui, altrimenti PC e telefono caricherebbero due volte le stesse.
      `ALTER TABLE study_sessions ADD COLUMN origin_device TEXT`,
      ...syncTracking("subjects", "id", ["name", "created_at", "color", "mode", "work_minutes", "short_break_minutes", "long_break_minutes", "cycles_before_long_break", "archived_at"]),
      ...syncTracking("study_sessions", "id", ["subject_id", "started_at", "ended_at", "duration_seconds"]),
      ...syncTracking("note_folders", "id", ["parent_id", "name", "color", "icon", "created_at"]),
      ...syncTracking("notes", "id", ["folder_id", "title", "tags", "starred", "created_at", "updated_at", "deleted_at", "font", "title_color"]),
      ...syncTracking("note_pages", "id", ["note_id", "position", "content", "ink", "background", "color", "pdf", "pdf_ink", "pins"]),
      ...syncTracking("note_attachments", "id", ["note_id", "name", "size", "created_at"]),
      ...syncTracking("note_collections", "id", ["name", "icon", "color", "created_at", "deleted_at"]),
      ...syncTracking("note_collection_fields", "id", ["collection_id", "name", "type", "options", "position"]),
      ...syncTracking("note_collection_rows", "id", ["collection_id", "data", "position", "created_at", "updated_at", "deleted_at"]),
      ...syncTracking("note_collection_views", "id", ["collection_id", "name", "layout", "filter", "sort", "fields", "group_field"]),
      ...syncTracking("settings", "key", ["value"], true),
    ],
  },
  {
    version: 24,
    description: "Sync tra dispositivi: file già allineati con il cloud (allegati delle note, file delle raccolte)",
    statements: [
      // Un file (per account) che c'è sia qui sia nel cloud. Serve a capire chi l'ha cancellato: sparito qui ma
      // nell'elenco = cancellato qui (si toglie dal cloud); il suo riferimento sparito = cancellato altrove.
      `CREATE TABLE IF NOT EXISTS sync_files (
         user_id TEXT NOT NULL,
         scope TEXT NOT NULL,
         owner_uid TEXT NOT NULL,
         name TEXT NOT NULL,
         PRIMARY KEY (user_id, scope, owner_uid, name)
       )`,
    ],
  },
  {
    version: 25,
    description: "Campanella della dashboard: cronologia delle notifiche dell'app (solo su questo dispositivo)",
    statements: [
      // open_json: dove porta il clic (NotificationOpen di core/notify/notifier.ts), NULL = da nessuna parte.
      // read_at NULL = non letta. Non sincronizzata: ogni dispositivo ha le sue (core/notify/inbox.ts).
      `CREATE TABLE IF NOT EXISTS app_notifications (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         kind TEXT NOT NULL,
         title TEXT NOT NULL,
         body TEXT NOT NULL DEFAULT '',
         open_json TEXT,
         created_at INTEGER NOT NULL,
         read_at INTEGER
       )`,
      `CREATE INDEX IF NOT EXISTS idx_app_notifications_created ON app_notifications(created_at)`,
    ],
  },
];
