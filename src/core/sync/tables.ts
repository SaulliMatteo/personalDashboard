/**
 * Sync tra dispositivi: quali tabelle passano dal cloud e com'è fatto ogni loro elemento. Logica PURA (niente DB né
 * rete): la usano `engine/records.ts` (traduzione da riga a elemento e ritorno) e `syncRepository.ts` (SQL).
 *
 * Ogni riga sincronizzata ha un id globale (uuid; per le impostazioni la chiave) in `sync_map`, dato dai trigger
 * della migrazione 23 (core/db/migrations.ts). Nel cloud gli id locali non compaiono mai: le colonne in `refs` e gli
 * id dentro i contenuti (vedi `engine/records.ts`) diventano id globali al push e tornano id locali al pull.
 * Una tabella nuova da sincronizzare: trigger in una migrazione nuova + una voce qui.
 */

export type SyncKind =
  | "subject"
  | "session"
  | "folder"
  | "note"
  | "page"
  | "attachment"
  | "collection"
  | "field"
  | "row"
  | "view"
  | "setting";

export interface RefSpec {
  kind: SyncKind;
  nullable?: true;
}

export interface TableSpec {
  kind: SyncKind;
  /** Tabella SQLite (e `tbl` in sync_map / sync_outbox). */
  table: string;
  /** Chiave della tabella: `id` numerico, oppure `key` testuale (impostazioni, id globale = chiave). */
  key: "id" | "key";
  /** Colonne che viaggiano (le stesse dei trigger, senza la chiave). Le altre restano di questo dispositivo. */
  columns: readonly string[];
  /**
   * Colonne che contengono l'id locale di un'altra tabella sincronizzata. `nullable`: se l'elemento a cui punta non
   * c'è più, la colonna diventa NULL (es. la cartella madre); altrimenti senza di lui la riga non ha senso.
   */
  refs: Readonly<Record<string, RefSpec>>;
  /**
   * Colonne di questo dispositivo da leggere prima che il sync cancelli una riga, per chi deve fare pulizia fuori dal
   * DB (es. la cartella su disco di una nota): arrivano in `deleted` dell'evento di syncEvents.ts.
   */
  localColumns?: readonly string[];
}

/** In ordine di dipendenza: al pull un elemento si applica dopo quelli a cui punta. */
export const SYNC_TABLES: readonly TableSpec[] = [
  {
    kind: "subject",
    table: "subjects",
    key: "id",
    columns: ["name", "created_at", "color", "mode", "work_minutes", "short_break_minutes", "long_break_minutes", "cycles_before_long_break", "archived_at"],
    refs: {},
  },
  {
    kind: "session",
    table: "study_sessions",
    key: "id",
    // origin_device non viaggia così com'è: lo traduce records.ts (NULL qui = "fatta su questo dispositivo").
    columns: ["subject_id", "started_at", "ended_at", "duration_seconds", "origin_device"],
    refs: { subject_id: { kind: "subject" } },
  },
  { kind: "folder", table: "note_folders", key: "id", columns: ["parent_id", "name", "color", "icon", "created_at"], refs: { parent_id: { kind: "folder", nullable: true } } },
  {
    kind: "note",
    table: "notes",
    key: "id",
    // disk_path e synced_at descrivono la copia su disco di questo dispositivo: non viaggiano.
    columns: ["folder_id", "title", "tags", "starred", "created_at", "updated_at", "deleted_at", "font", "title_color"],
    refs: { folder_id: { kind: "folder", nullable: true } },
    localColumns: ["disk_path"],
  },
  {
    kind: "page",
    table: "note_pages",
    key: "id",
    columns: ["note_id", "position", "content", "ink", "background", "color", "pdf", "pdf_ink", "pins"],
    refs: { note_id: { kind: "note" } },
  },
  { kind: "attachment", table: "note_attachments", key: "id", columns: ["note_id", "name", "size", "created_at"], refs: { note_id: { kind: "note" } } },
  { kind: "collection", table: "note_collections", key: "id", columns: ["name", "icon", "color", "created_at", "deleted_at"], refs: {} },
  {
    kind: "field",
    table: "note_collection_fields",
    key: "id",
    columns: ["collection_id", "name", "type", "options", "position"],
    refs: { collection_id: { kind: "collection" } },
  },
  {
    kind: "row",
    table: "note_collection_rows",
    key: "id",
    columns: ["collection_id", "data", "position", "created_at", "updated_at", "deleted_at"],
    refs: { collection_id: { kind: "collection" } },
  },
  {
    kind: "view",
    table: "note_collection_views",
    key: "id",
    columns: ["collection_id", "name", "layout", "filter", "sort", "fields", "group_field"],
    refs: { collection_id: { kind: "collection" }, group_field: { kind: "field", nullable: true } },
  },
  { kind: "setting", table: "settings", key: "key", columns: ["value"], refs: {} },
];

const BY_KIND = new Map<SyncKind, TableSpec>(SYNC_TABLES.map((t) => [t.kind, t]));
const BY_TABLE = new Map<string, TableSpec>(SYNC_TABLES.map((t) => [t.table, t]));

export function specOf(kind: SyncKind): TableSpec {
  const spec = BY_KIND.get(kind);
  if (!spec) throw new Error(`Tipo non sincronizzato: ${kind}`);
  return spec;
}

/** La descrizione di una tabella SQLite, o null se non si sincronizza. */
export function specOfTable(table: string): TableSpec | null {
  return BY_TABLE.get(table) ?? null;
}

export function isSyncKind(value: unknown): value is SyncKind {
  return typeof value === "string" && BY_KIND.has(value as SyncKind);
}

/** Posizione nell'ordine di dipendenza (per ordinare gli elementi da applicare). */
export function kindOrder(kind: SyncKind): number {
  return SYNC_TABLES.findIndex((t) => t.kind === kind);
}
