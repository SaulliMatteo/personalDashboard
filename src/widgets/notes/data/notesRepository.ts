import { getDatabase, getMeta, setMeta } from "../../../core/db";
import {
  asBookmarkColor,
  asBookmarkKind,
  parsePins,
  readBookmarks,
  type BookmarkKind,
  type BookmarkPlace,
  type PagePin,
} from "../lib/bookmarks";
import { asPageColor } from "../lib/pageColor";
import { isNoteFont, type NoteFont } from "../lib/textStyle";
import { asTitleColor } from "../lib/titleColor";
// ---------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------

export interface Folder {
  id: number;
  parentId: number | null;
  name: string;
  color: string | null;
  icon: string;
  createdAt: number;
}

interface FolderRow {
  id: number;
  parent_id: number | null;
  name: string;
  color: string | null;
  icon: string;
  created_at: number;
}

export type PageBackground = "none" | "dots" | "grid" | "lines";

function parseBackground(raw: string | null | undefined): PageBackground {
  return raw === "dots" || raw === "grid" || raw === "lines" ? raw : "none";
}

export interface NoteSummary {
  id: number;
  folderId: number | null;
  title: string;
  tags: string[];
  starred: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** HTML (troncato) della prima pagina: serve alle anteprime delle card. */
  firstContent: string;
  pageCount: number;
  /** Cartella della nota nella copia su disco (relativa a Documenti/Notes), se già scritta. */
  diskPath: string | null;
  /** Quando la copia su disco è stata aggiornata l'ultima volta (null = da riscrivere). */
  syncedAt: number | null;
  /** Font predefinito della nota (null = quello del tema). */
  font: NoteFont | null;
  /** Colore del titolo, "#rrggbb" scelto dall'utente (null = quello del tema). */
  titleColor: string | null;
}

interface NoteRow {
  id: number;
  folder_id: number | null;
  title: string;
  tags: string;
  starred: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  first_content: string | null;
  page_count: number;
  disk_path: string | null;
  synced_at: number | null;
  font: string | null;
  title_color: string | null;
}

/** Un tratto di scrittura a mano. Coordinate normalizzate sulla LARGHEZZA della pagina (0..1). */
export interface InkStroke {
  tool: "pen" | "highlighter";
  color: string;
  /** Spessore in px su una pagina larga 900px. */
  size: number;
  points: [number, number][];
}

export interface NotePage {
  id: number;
  noteId: number;
  position: number;
  content: string;
  ink: InkStroke[];
  background: PageBackground;
  color: string | null;
  /** Segni appoggiati sulla pagina (scrittura a mano), vedi lib/bookmarks.ts. */
  pins: PagePin[];
}

export interface Attachment {
  id: number;
  noteId: number;
  name: string;
  size: number;
  createdAt: number;
}

function parseTags(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function parseInk(raw: string): InkStroke[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? (v as InkStroke[]) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------
// Cartelle
// ---------------------------------------------------------------------

export async function listFolders(): Promise<Folder[]> {
  const db = await getDatabase();
  const rows = await db.select<FolderRow[]>(
    `SELECT id, parent_id, name, color, icon, created_at FROM note_folders ORDER BY name COLLATE NOCASE`
  );
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    name: r.name,
    color: r.color,
    icon: r.icon,
    createdAt: r.created_at,
  }));
}

export async function addFolder(name: string, parentId: number | null): Promise<number> {
  const db = await getDatabase();
  const result = await db.execute(
    `INSERT INTO note_folders (parent_id, name, color, icon, created_at) VALUES (?, ?, NULL, 'folder', ?)`,
    [parentId, name, Date.now()]
  );
  if (result.lastInsertId == null) throw new Error("Cartella non creata");
  return result.lastInsertId;
}

export interface FolderPatch {
  name?: string;
  color?: string | null;
  icon?: string;
  parentId?: number | null;
}

export async function updateFolder(id: number, patch: FolderPatch): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    values.push(patch.name);
  }
  if (patch.color !== undefined) {
    sets.push("color = ?");
    values.push(patch.color);
  }
  if (patch.icon !== undefined) {
    sets.push("icon = ?");
    values.push(patch.icon);
  }
  if (patch.parentId !== undefined) {
    sets.push("parent_id = ?");
    values.push(patch.parentId);
  }
  if (sets.length === 0) return;
  const db = await getDatabase();
  await db.execute(`UPDATE note_folders SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
}

/** Elimina le cartelle indicate; le note che contenevano finiscono nel cestino. */
export async function deleteFolders(ids: number[]): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  for (const id of ids) {
    await db.execute(
      `UPDATE notes SET folder_id = NULL, deleted_at = COALESCE(deleted_at, ?), synced_at = NULL WHERE folder_id = ?`,
      [now, id]
    );
    await db.execute(`DELETE FROM note_folders WHERE id = ?`, [id]);
  }
}

// ---------------------------------------------------------------------
// Note
// ---------------------------------------------------------------------

export async function listNotes(): Promise<NoteSummary[]> {
  const db = await getDatabase();
  const rows = await db.select<NoteRow[]>(
    `SELECT n.id, n.folder_id, n.title, n.tags, n.starred, n.created_at, n.updated_at, n.deleted_at, n.disk_path, n.synced_at, n.font, n.title_color,
            (SELECT substr(p.content, 1, 4000) FROM note_pages p WHERE p.note_id = n.id ORDER BY p.position LIMIT 1) AS first_content,
            (SELECT COUNT(*) FROM note_pages p WHERE p.note_id = n.id) AS page_count
     FROM notes n
     ORDER BY n.updated_at DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    folderId: r.folder_id,
    title: r.title,
    tags: parseTags(r.tags),
    starred: r.starred === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    firstContent: r.first_content ?? "",
    pageCount: r.page_count,
    diskPath: r.disk_path,
    syncedAt: r.synced_at,
    font: isNoteFont(r.font) && r.font !== "punti" ? r.font : null,
    titleColor: asTitleColor(r.title_color),
  }));
}

export interface NewPageInput {
  content: string;
  ink: InkStroke[];
  background: PageBackground;
  color?: string | null;
  pins?: PagePin[];
}

export interface NewNoteInput {
  title: string;
  tags: string[];
  /** Colore del titolo (null o assente = quello del tema). */
  titleColor?: string | null;
  pages: NewPageInput[];
}

const BLANK_NOTE: NewNoteInput = {
  title: "Nuova nota",
  tags: [],
  pages: [{ content: "<p><br></p>", ink: [], background: "none" }],
};

export async function createNote(folderId: number | null, input: NewNoteInput = BLANK_NOTE): Promise<number> {
  const db = await getDatabase();
  const now = Date.now();
  const result = await db.execute(
    `INSERT INTO notes (folder_id, title, tags, starred, created_at, updated_at, title_color) VALUES (?, ?, ?, 0, ?, ?, ?)`,
    [folderId, input.title, JSON.stringify(input.tags), now, now, asTitleColor(input.titleColor)]
  );
  const id = result.lastInsertId;
  if (id == null) throw new Error("Nota non creata");
  const pages = input.pages.length > 0 ? input.pages : BLANK_NOTE.pages;
  for (let i = 0; i < pages.length; i++) {
    const pins = pages[i].pins ?? [];
    const page = await db.execute(
      `INSERT INTO note_pages (note_id, position, content, ink, background, pins) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, i, pages[i].content, JSON.stringify(pages[i].ink), pages[i].background, JSON.stringify(pins)]
    );
    if (page.lastInsertId != null) await syncPageBookmarks(page.lastInsertId, id, pages[i].content, pins);
  }
  return id;
}

export interface ImportedNote extends NewNoteInput {
  font?: NoteFont | null;
  folderId: number | null;
  starred: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  diskPath: string;
}

/** Inserisce una nota letta dalla cartella su disco (importazione). */
export async function insertImportedNote(input: ImportedNote): Promise<number> {
  const db = await getDatabase();
  const result = await db.execute(
    `INSERT INTO notes (folder_id, title, tags, starred, created_at, updated_at, deleted_at, disk_path, synced_at, font, title_color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.folderId,
      input.title,
      JSON.stringify(input.tags),
      input.starred ? 1 : 0,
      input.createdAt,
      input.updatedAt,
      input.deletedAt,
      input.diskPath,
      Date.now(),
      input.font ?? null,
      asTitleColor(input.titleColor),
    ]
  );
  const id = result.lastInsertId;
  if (id == null) throw new Error("Nota non importata");
  for (let i = 0; i < input.pages.length; i++) {
    const p = input.pages[i];
    const pins = p.pins ?? [];
    const page = await db.execute(
      `INSERT INTO note_pages (note_id, position, content, ink, background, color, pins) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, i, p.content, JSON.stringify(p.ink), p.background, p.color ?? null, JSON.stringify(pins)]
    );
    if (page.lastInsertId != null) await syncPageBookmarks(page.lastInsertId, id, p.content, pins);
  }
  return id;
}

export interface NotePatch {
  title?: string;
  tags?: string[];
  starred?: boolean;
  folderId?: number | null;
  font?: NoteFont | null;
  titleColor?: string | null;
}

/** `touch` = aggiorna anche "ultima modifica" (non serve per preferiti/spostamenti). */
export async function updateNote(id: number, patch: NotePatch, touch = true): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    values.push(patch.title);
  }
  if (patch.tags !== undefined) {
    sets.push("tags = ?");
    values.push(JSON.stringify(patch.tags));
  }
  if (patch.starred !== undefined) {
    sets.push("starred = ?");
    values.push(patch.starred ? 1 : 0);
  }
  if (patch.folderId !== undefined) {
    sets.push("folder_id = ?");
    values.push(patch.folderId);
  }
  if (patch.font !== undefined) {
    sets.push("font = ?");
    values.push(patch.font);
  }
  if (patch.titleColor !== undefined) {
    sets.push("title_color = ?");
    values.push(asTitleColor(patch.titleColor));
  }
  if (sets.length === 0) return;
  if (touch) {
    sets.push("updated_at = ?");
    values.push(Date.now());
  } else {
    sets.push("synced_at = NULL"); // preferito/spostamento: la copia su disco va riscritta
  }
  const db = await getDatabase();
  await db.execute(`UPDATE notes SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
}

export async function trashNote(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE notes SET deleted_at = ?, synced_at = NULL WHERE id = ?`, [Date.now(), id]);
}

export async function restoreNote(id: number, folderStillExists: boolean): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE notes SET deleted_at = NULL, synced_at = NULL ${folderStillExists ? "" : ", folder_id = NULL"} WHERE id = ?`,
    [id]
  );
}

export async function deleteNoteForever(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM note_bookmarks WHERE note_id = ?`, [id]);
  await db.execute(`DELETE FROM note_pages WHERE note_id = ?`, [id]);
  await db.execute(`DELETE FROM note_attachments WHERE note_id = ?`, [id]);
  await db.execute(`DELETE FROM notes WHERE id = ?`, [id]);
}

export async function emptyTrash(ids: number[]): Promise<void> {
  for (const id of ids) await deleteNoteForever(id);
}

// ---------------------------------------------------------------------
// Pagine
// ---------------------------------------------------------------------
export async function getPages(noteId: number): Promise<NotePage[]> {
  const db = await getDatabase();
  const rows = await db.select<
    {
      id: number;
      note_id: number;
      position: number;
      content: string;
      ink: string;
      background: string | null;
      color: string | null;
      pins: string | null;
    }[]
  >(
    `SELECT id, note_id, position, content, ink, background, color, pins FROM note_pages WHERE note_id = ? ORDER BY position, id`,
    [noteId]
  );
  return rows.map((r) => ({
    id: r.id,
    noteId: r.note_id,
    position: r.position,
    content: r.content,
    ink: parseInk(r.ink),
    background: parseBackground(r.background),
    color: asPageColor(r.color),
    pins: parsePins(r.pins),
  }));
}

export async function addPage(noteId: number, background: PageBackground = "none", color: string | null = null): Promise<NotePage> {
  const db = await getDatabase();
  const rows = await db.select<{ next: number | null }[]>(
    `SELECT MAX(position) + 1 AS next FROM note_pages WHERE note_id = ?`,
    [noteId]
  );
  const position = rows[0]?.next ?? 0;
  const result = await db.execute(
    `INSERT INTO note_pages (note_id, position, content, ink, background, color) VALUES (?, ?, '<p><br></p>', '[]', ?, ?)`,
    [noteId, position, background, color]
  );
  if (result.lastInsertId == null) throw new Error("Pagina non creata");
  return { id: result.lastInsertId, noteId, position, content: "<p><br></p>", ink: [], background, color, pins: [] };
}

/** Salva testo, inchiostro e segni della pagina, e riallinea l'indice dei segni (note_bookmarks). */
export async function savePage(pageId: number, noteId: number, content: string, ink: InkStroke[], pins: PagePin[]): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE note_pages SET content = ?, ink = ?, pins = ? WHERE id = ?`, [
    content,
    JSON.stringify(ink),
    JSON.stringify(pins),
    pageId,
  ]);
  await db.execute(`UPDATE notes SET updated_at = ? WHERE id = ?`, [Date.now(), noteId]);
  await syncPageBookmarks(pageId, noteId, content, pins);
}

export async function deletePage(pageId: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM note_bookmarks WHERE page_id = ?`, [pageId]);
  await db.execute(`DELETE FROM note_pages WHERE id = ?`, [pageId]);
}

// ---------------------------------------------------------------------
// Segni (indice per il pannello; la fonte è la pagina, vedi lib/bookmarks.ts)
// ---------------------------------------------------------------------

export interface BookmarkRow {
  id: string;
  noteId: number;
  pageId: number;
  /** Numero della pagina nella nota, da 0. */
  pageIndex: number;
  place: BookmarkPlace;
  name: string;
  kind: BookmarkKind;
  color: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Riallinea l'indice di una pagina ai segni che contiene adesso: toglie quelli spariti
 * (cancellati dal testo, tagliati…) e aggiorna o aggiunge gli altri, tenendo la data di creazione.
 */
export async function syncPageBookmarks(pageId: number, noteId: number, content: string, pins: PagePin[]): Promise<void> {
  const db = await getDatabase();
  const entries = readBookmarks(content, pins);
  const rows = await db.select<{ id: string }[]>(`SELECT id FROM note_bookmarks WHERE page_id = ?`, [pageId]);
  const keep = new Set(entries.map((e) => e.id));
  for (const row of rows) {
    if (!keep.has(row.id)) await db.execute(`DELETE FROM note_bookmarks WHERE id = ?`, [row.id]);
  }
  const now = Date.now();
  for (const e of entries) {
    // updated_at cambia solo se cambia qualcosa che si vede (nome, tipo, colore, pagina).
    await db.execute(
      `INSERT INTO note_bookmarks (id, note_id, page_id, place, name, kind, color, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         updated_at = CASE
           WHEN note_bookmarks.name IS excluded.name AND note_bookmarks.kind IS excluded.kind
             AND note_bookmarks.color IS excluded.color AND note_bookmarks.page_id IS excluded.page_id
           THEN note_bookmarks.updated_at ELSE excluded.updated_at END,
         note_id = excluded.note_id, page_id = excluded.page_id, place = excluded.place, name = excluded.name,
         kind = excluded.kind, color = excluded.color, position = excluded.position`,
      [e.id, noteId, pageId, e.place, e.name, e.kind, e.color, e.position, now, now]
    );
  }
}

/** I segni delle note non nel cestino, nota per nota, in ordine di pagina e di posizione. */
export async function listBookmarks(): Promise<BookmarkRow[]> {
  const db = await getDatabase();
  const rows = await db.select<
    {
      id: string;
      note_id: number;
      page_id: number;
      page_index: number;
      place: string;
      name: string;
      kind: string;
      color: string | null;
      position: number;
      created_at: number;
      updated_at: number;
    }[]
  >(
    `SELECT b.id, b.note_id, b.page_id, b.place, b.name, b.kind, b.color, b.position, b.created_at, b.updated_at,
            (SELECT COUNT(*) FROM note_pages q
              WHERE q.note_id = p.note_id AND (q.position < p.position OR (q.position = p.position AND q.id < p.id))) AS page_index
     FROM note_bookmarks b
     JOIN notes n ON n.id = b.note_id AND n.deleted_at IS NULL
     JOIN note_pages p ON p.id = b.page_id AND p.note_id = b.note_id
     ORDER BY b.note_id, page_index, b.position`
  );
  return rows.map((r) => ({
    id: r.id,
    noteId: r.note_id,
    pageId: r.page_id,
    pageIndex: r.page_index,
    place: r.place === "pagina" ? "pagina" : "testo",
    name: r.name,
    kind: asBookmarkKind(r.kind),
    color: asBookmarkColor(r.color),
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function reorderPages(orderedIds: number[]): Promise<void> {
  const db = await getDatabase();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute(`UPDATE note_pages SET position = ? WHERE id = ?`, [i, orderedIds[i]]);
  }
}

export async function setPageBackground(pageId: number, noteId: number, background: PageBackground): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE note_pages SET background = ? WHERE id = ?`, [background, pageId]);
  await db.execute(`UPDATE notes SET updated_at = ? WHERE id = ?`, [Date.now(), noteId]);
}

// ---------------------------------------------------------------------
// Copia su disco e allegati
// ---------------------------------------------------------------------

/** `at` = istante in cui è iniziata la scrittura (una modifica successiva rende di nuovo "da riscrivere"). */
export async function markSynced(id: number, diskPath: string, at: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE notes SET disk_path = ?, synced_at = ? WHERE id = ?`, [diskPath, at, id]);
}

export async function markAllUnsynced(): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE notes SET synced_at = NULL`);
}

export async function listAttachments(noteId: number): Promise<Attachment[]> {
  const db = await getDatabase();
  const rows = await db.select<{ id: number; note_id: number; name: string; size: number; created_at: number }[]>(
    `SELECT id, note_id, name, size, created_at FROM note_attachments WHERE note_id = ? ORDER BY id`,
    [noteId]
  );
  return rows.map((r) => ({ id: r.id, noteId: r.note_id, name: r.name, size: r.size, createdAt: r.created_at }));
}

export async function addAttachment(noteId: number, name: string, size: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`INSERT INTO note_attachments (note_id, name, size, created_at) VALUES (?, ?, ?, ?)`, [
    noteId,
    name,
    size,
    Date.now(),
  ]);
  await db.execute(`UPDATE notes SET updated_at = ? WHERE id = ?`, [Date.now(), noteId]);
}

export async function deleteAttachment(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM note_attachments WHERE id = ?`, [id]);
}

/** Lo stesso colore su tutte le pagine della nota ("Applica a tutte le pagine"). */
export async function setPagesColor(noteId: number, color: string | null): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE note_pages SET color = ? WHERE note_id = ?`, [color, noteId]);
  await db.execute(`UPDATE notes SET updated_at = ? WHERE id = ?`, [Date.now(), noteId]);
}

export async function setPageColor(pageId: number, noteId: number, color: string | null): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE note_pages SET color = ? WHERE id = ?`, [color, pageId]);
  await db.execute(`UPDATE notes SET updated_at = ? WHERE id = ?`, [Date.now(), noteId]);
}

// ---------------------------------------------------------------------
// Preferenze della scrittura a mano

const INK_SHAPES_KEY = "notes.inkShapes";

/** Forme automatiche della penna: accese se non è mai stato scelto altro. */
export async function loadInkShapes(): Promise<boolean> {
  return (await getMeta(INK_SHAPES_KEY)) !== "0";
}

export async function saveInkShapes(enabled: boolean): Promise<void> {
  await setMeta(INK_SHAPES_KEY, enabled ? "1" : "0");
}

const CODE_DETECT_KEY = "notes.codeDetect";

/** Riconoscimento del codice incollato: acceso se non è mai stato scelto altro. */
export async function loadCodeDetect(): Promise<boolean> {
  return (await getMeta(CODE_DETECT_KEY)) !== "0";
}

export async function saveCodeDetect(enabled: boolean): Promise<void> {
  await setMeta(CODE_DETECT_KEY, enabled ? "1" : "0");
}
