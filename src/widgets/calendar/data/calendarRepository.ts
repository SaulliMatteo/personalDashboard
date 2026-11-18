import { getDatabase, getMeta, setMeta } from "../../../core/db";
import { parseDone, parseOptions, parseProps, parsePropType, parseReminders, parseRepeat, parseTodos } from "../lib/serialize";
import type {
  CalendarCategory,
  CalendarEvent,
  CalendarProperty,
  CalendarView,
  ItemKind,
  NoteLink,
  PropType,
} from "../lib/types";

/*
 * Tutte le query SQL del Calendario (tabelle delle migrazioni 32 e 33). Niente FK: quando si elimina qualcosa, la pulizia
 * di ciò che lo cita la fa questo file. Le materie e le note si leggono da core/study e core/notes, mai da qui.
 */

// ---------------------------------------------------------------------------
// Eventi e sessioni pianificate
// ---------------------------------------------------------------------------

interface EventRow {
  id: number;
  kind: string;
  title: string;
  start_at: number;
  end_at: number;
  all_day: number;
  category_id: number | null;
  subject_id: number | null;
  parent_id: number | null;
  series_id: number | null;
  original_start: number | null;
  color: string | null;
  repeat: string | null;
  reminders: string;
  props: string;
  todos: string;
  description: string;
  done: string;
  created_at: number;
  updated_at: number;
}

const EVENT_COLUMNS =
  "id, kind, title, start_at, end_at, all_day, category_id, subject_id, parent_id, series_id, original_start, color, " +
  "repeat, reminders, props, todos, description, done, created_at, updated_at";

function mapEvent(r: EventRow): CalendarEvent {
  return {
    id: r.id,
    kind: r.kind === "study" || r.kind === "reminder" ? r.kind : "event",
    title: r.title,
    startAt: r.start_at,
    // un promemoria è un istante
    endAt: r.kind === "reminder" ? r.start_at : Math.max(r.start_at, r.end_at),
    allDay: r.all_day === 1,
    categoryId: r.category_id,
    subjectId: r.subject_id,
    parentId: r.parent_id,
    seriesId: r.series_id,
    originalStart: r.original_start,
    color: r.color,
    repeat: parseRepeat(r.repeat),
    reminders: parseReminders(r.reminders),
    props: parseProps(r.props),
    todos: parseTodos(r.todos),
    description: r.description,
    done: parseDone(r.done),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** I campi che si scrivono (id e date di creazione/modifica li gestisce il repository). */
export type EventFields = Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">;

/** Campo → colonna e conversione in valore SQL. */
const FIELD_COLUMNS: { [K in keyof EventFields]: [string, (v: EventFields[K]) => unknown] } = {
  kind: ["kind", (v) => v],
  title: ["title", (v) => v],
  startAt: ["start_at", (v) => v],
  endAt: ["end_at", (v) => v],
  allDay: ["all_day", (v) => (v ? 1 : 0)],
  categoryId: ["category_id", (v) => v],
  subjectId: ["subject_id", (v) => v],
  parentId: ["parent_id", (v) => v],
  seriesId: ["series_id", (v) => v],
  originalStart: ["original_start", (v) => v],
  color: ["color", (v) => v],
  repeat: ["repeat", (v) => (v ? JSON.stringify(v) : null)],
  reminders: ["reminders", (v) => JSON.stringify(v)],
  props: ["props", (v) => JSON.stringify(v)],
  todos: ["todos", (v) => JSON.stringify(v)],
  description: ["description", (v) => v],
  done: ["done", (v) => JSON.stringify(v)],
};

function toColumns(patch: Partial<EventFields>): { columns: string[]; values: unknown[] } {
  const columns: string[] = [];
  const values: unknown[] = [];
  for (const key of Object.keys(patch) as (keyof EventFields)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    const [column, convert] = FIELD_COLUMNS[key] as [string, (v: unknown) => unknown];
    columns.push(column);
    values.push(convert(value));
  }
  return { columns, values };
}

/** Un evento nuovo con i valori di default (chi crea sovrascrive ciò che serve). */
export function blankEvent(kind: ItemKind, startAt: number, endAt: number): EventFields {
  return {
    kind,
    title: "",
    startAt,
    endAt,
    allDay: false,
    categoryId: null,
    subjectId: null,
    parentId: null,
    seriesId: null,
    originalStart: null,
    color: null,
    repeat: null,
    reminders: [],
    props: {},
    todos: [],
    description: "",
    done: [],
  };
}

/**
 * Gli elementi che possono avere occorrenze in [start, end): quelli singoli che lo toccano e TUTTE le serie
 * iniziate prima di `end` (le occorrenze le calcola lib/recurrence.ts).
 */
export async function listEventsInRange(start: number, end: number): Promise<CalendarEvent[]> {
  const db = await getDatabase();
  const rows = await db.select<EventRow[]>(
    `SELECT ${EVENT_COLUMNS} FROM calendar_events
     WHERE start_at < ? AND (repeat IS NOT NULL OR end_at > ? OR (end_at = start_at AND start_at >= ?))
     ORDER BY start_at, id`,
    [end, start, start]
  );
  return rows.map(mapEvent);
}

export async function getEvent(id: number): Promise<CalendarEvent | null> {
  const db = await getDatabase();
  const rows = await db.select<EventRow[]>(`SELECT ${EVENT_COLUMNS} FROM calendar_events WHERE id = ?`, [id]);
  return rows[0] ? mapEvent(rows[0]) : null;
}

/** Le sessioni di studio collegate a un evento ("Sessioni di studio collegate"), in ordine di tempo. */
export async function listLinkedSessions(parentId: number): Promise<CalendarEvent[]> {
  const db = await getDatabase();
  const rows = await db.select<EventRow[]>(
    `SELECT ${EVENT_COLUMNS} FROM calendar_events WHERE parent_id = ? ORDER BY start_at, id`,
    [parentId]
  );
  return rows.map(mapEvent);
}

/** Le eccezioni "solo questa" di una serie. */
export async function listSeriesExceptions(seriesId: number): Promise<CalendarEvent[]> {
  const db = await getDatabase();
  const rows = await db.select<EventRow[]>(
    `SELECT ${EVENT_COLUMNS} FROM calendar_events WHERE series_id = ? ORDER BY original_start, id`,
    [seriesId]
  );
  return rows.map(mapEvent);
}

export async function createEvent(fields: EventFields, now = Date.now()): Promise<number> {
  const db = await getDatabase();
  const { columns, values } = toColumns(fields);
  const result = await db.execute(
    `INSERT INTO calendar_events (${columns.join(", ")}, created_at, updated_at)
     VALUES (${columns.map(() => "?").join(", ")}, ?, ?)`,
    [...values, now, now]
  );
  if (result.lastInsertId === undefined) throw new Error("Evento non creato");
  return Number(result.lastInsertId);
}

export async function updateEvent(id: number, patch: Partial<EventFields>, now = Date.now()): Promise<void> {
  const { columns, values } = toColumns(patch);
  if (columns.length === 0) return;
  const db = await getDatabase();
  await db.execute(`UPDATE calendar_events SET ${columns.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ?`, [
    ...values,
    now,
    id,
  ]);
}

/**
 * Elimina un elemento (o una serie intera): con lui le sue eccezioni e le note collegate a lui; le sessioni di
 * studio collegate restano, scollegate.
 */
export async function deleteEvent(id: number): Promise<void> {
  const db = await getDatabase();
  const exceptions = await db.select<{ id: number }[]>(`SELECT id FROM calendar_events WHERE series_id = ?`, [id]);
  const ids = [id, ...exceptions.map((e) => e.id)];
  const marks = ids.map(() => "?").join(", ");
  await db.execute(`UPDATE calendar_events SET parent_id = NULL WHERE parent_id IN (${marks})`, ids);
  await db.execute(`DELETE FROM calendar_note_links WHERE event_id IN (${marks})`, ids);
  await db.execute(`DELETE FROM calendar_events WHERE id IN (${marks})`, ids);
}

/** Una copia dell'elemento (stesso orario, "(copia)" nel titolo); le note collegate vengono con lei. */
export async function duplicateEvent(id: number): Promise<number | null> {
  const event = await getEvent(id);
  if (!event) return null;
  const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = event;
  const copyId = await createEvent({ ...fields, title: event.title ? `${event.title} (copia)` : "", seriesId: null, originalStart: null });
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO calendar_note_links (note_id, day, event_id, created_at)
     SELECT note_id, day, ?, ? FROM calendar_note_links WHERE event_id = ?`,
    [copyId, Date.now(), id]
  );
  return copyId;
}

// ---------------------------------------------------------------------------
// Categorie
// ---------------------------------------------------------------------------

export async function listCategories(): Promise<CalendarCategory[]> {
  const db = await getDatabase();
  return db.select<CalendarCategory[]>(`SELECT id, name, color, position FROM calendar_categories ORDER BY position, id`);
}

export async function createCategory(name: string, color: string): Promise<number> {
  const db = await getDatabase();
  const result = await db.execute(
    `INSERT INTO calendar_categories (name, color, position, created_at)
     VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM calendar_categories), ?)`,
    [name, color, Date.now()]
  );
  return Number(result.lastInsertId);
}

export async function updateCategory(id: number, patch: { name?: string; color?: string }): Promise<void> {
  const db = await getDatabase();
  if (patch.name !== undefined) await db.execute(`UPDATE calendar_categories SET name = ? WHERE id = ?`, [patch.name, id]);
  if (patch.color !== undefined) await db.execute(`UPDATE calendar_categories SET color = ? WHERE id = ?`, [patch.color, id]);
}

/** Gli eventi della categoria restano, senza categoria. */
export async function deleteCategory(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE calendar_events SET category_id = NULL WHERE category_id = ?`, [id]);
  await db.execute(`DELETE FROM calendar_categories WHERE id = ?`, [id]);
}

// ---------------------------------------------------------------------------
// Proprietà personalizzate
// ---------------------------------------------------------------------------

export async function listProperties(): Promise<CalendarProperty[]> {
  const db = await getDatabase();
  const rows = await db.select<{ id: number; uid: string; name: string; type: string; options: string; position: number }[]>(
    `SELECT id, uid, name, type, options, position FROM calendar_properties ORDER BY position, id`
  );
  return rows.map((r) => ({ ...r, type: parsePropType(r.type), options: parseOptions(r.options) }));
}

export async function createProperty(name: string, type: PropType, options: string[] = []): Promise<CalendarProperty> {
  const db = await getDatabase();
  const uid = crypto.randomUUID();
  const result = await db.execute(
    `INSERT INTO calendar_properties (uid, name, type, options, position)
     VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM calendar_properties))`,
    [uid, name, type, JSON.stringify(options)]
  );
  const id = Number(result.lastInsertId);
  const rows = await db.select<{ position: number }[]>(`SELECT position FROM calendar_properties WHERE id = ?`, [id]);
  return { id, uid, name, type, options, position: rows[0]?.position ?? 0 };
}

export async function updateProperty(id: number, patch: { name?: string; type?: PropType; options?: string[] }): Promise<void> {
  const db = await getDatabase();
  if (patch.name !== undefined) await db.execute(`UPDATE calendar_properties SET name = ? WHERE id = ?`, [patch.name, id]);
  if (patch.type !== undefined) await db.execute(`UPDATE calendar_properties SET type = ? WHERE id = ?`, [patch.type, id]);
  if (patch.options !== undefined) {
    await db.execute(`UPDATE calendar_properties SET options = ? WHERE id = ?`, [JSON.stringify(patch.options), id]);
  }
}

/** I valori negli eventi restano nel JSON ma non si vedono più (nessuna proprietà con quell'uid). */
export async function deleteProperty(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM calendar_properties WHERE id = ?`, [id]);
}

// ---------------------------------------------------------------------------
// Note collegate
// ---------------------------------------------------------------------------

interface NoteLinkRow {
  id: number;
  note_id: number;
  day: string | null;
  event_id: number | null;
}

function mapLink(r: NoteLinkRow): NoteLink {
  return { id: r.id, noteId: r.note_id, day: r.day, eventId: r.event_id };
}

/** Le note collegate ai giorni da `fromDay` a `toDay` compresi ("YYYY-MM-DD", si confrontano come testo). */
export async function listDayNoteLinks(fromDay: string, toDay: string): Promise<NoteLink[]> {
  const db = await getDatabase();
  const rows = await db.select<NoteLinkRow[]>(
    `SELECT id, note_id, day, event_id FROM calendar_note_links WHERE day >= ? AND day <= ? ORDER BY day, id`,
    [fromDay, toDay]
  );
  return rows.map(mapLink);
}

export async function listEventNoteLinks(eventIds: readonly number[]): Promise<NoteLink[]> {
  if (eventIds.length === 0) return [];
  const db = await getDatabase();
  const rows = await db.select<NoteLinkRow[]>(
    `SELECT id, note_id, day, event_id FROM calendar_note_links WHERE event_id IN (${eventIds.map(() => "?").join(", ")}) ORDER BY id`,
    [...eventIds]
  );
  return rows.map(mapLink);
}

export async function addNoteLink(noteId: number, target: { day: string | null; eventId: number | null }): Promise<number> {
  const db = await getDatabase();
  const result = await db.execute(`INSERT INTO calendar_note_links (note_id, day, event_id, created_at) VALUES (?, ?, ?, ?)`, [
    noteId,
    target.day,
    target.eventId,
    Date.now(),
  ]);
  return Number(result.lastInsertId);
}

export async function removeNoteLink(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM calendar_note_links WHERE id = ?`, [id]);
}

// ---------------------------------------------------------------------------
// Stato interno (meta, per dispositivo)
// ---------------------------------------------------------------------------

const LAST_VIEW_KEY = "calendar_last_view";
const REMINDER_CHECK_KEY = "calendar_reminders_checked_at";

export async function loadLastView(): Promise<CalendarView> {
  const v = await getMeta(LAST_VIEW_KEY);
  return v === "week" || v === "day" ? v : "month";
}

export async function saveLastView(view: CalendarView): Promise<void> {
  await setMeta(LAST_VIEW_KEY, view);
}

/** Fino a quando i promemoria sono già stati controllati (null = mai: si parte da adesso). */
export async function loadReminderCheck(): Promise<number | null> {
  const v = Number(await getMeta(REMINDER_CHECK_KEY));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export async function saveReminderCheck(at: number): Promise<void> {
  await setMeta(REMINDER_CHECK_KEY, String(at));
}
