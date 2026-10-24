import { getDatabase } from "../../../core/db";
import {
  asFieldType,
  asFilters,
  asIdList,
  asLayout,
  asOptions,
  asSort,
  cleanData,
  type CellValue,
  type Collection,
  type Field,
  type FieldOptions,
  type FieldType,
  type Row,
  type View,
  type ViewLayout,
} from "../lib/collections";

/**
 * Raccolte (tabelle note_collection*): tutto l'SQL. I valori JSON si leggono passando dai
 * validatori puri di lib/collections.ts, così un dato rovinato non rompe la pagina.
 */

interface CollectionRow {
  id: number;
  name: string;
  icon: string;
  color: string | null;
  created_at: number;
  deleted_at: number | null;
}

interface FieldRow {
  id: number;
  collection_id: number;
  name: string;
  type: string;
  options: string;
  position: number;
}

interface DataRow {
  id: number;
  collection_id: number;
  data: string;
  position: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface ViewRow {
  id: number;
  collection_id: number;
  name: string;
  layout: string;
  filter: string;
  sort: string | null;
  fields: string;
  group_field: number | null;
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toField(r: FieldRow): Field {
  const type = asFieldType(r.type);
  return { id: r.id, collectionId: r.collection_id, name: r.name, type, options: asOptions(type, parseJson(r.options)), position: r.position };
}

function toView(r: ViewRow): View {
  return {
    id: r.id,
    collectionId: r.collection_id,
    name: r.name,
    layout: asLayout(r.layout),
    filter: asFilters(parseJson(r.filter)),
    sort: asSort(parseJson(r.sort)),
    hidden: asIdList(parseJson(r.fields)),
    groupField: r.group_field,
  };
}

export interface CollectionsSnapshot {
  collections: Collection[];
  fields: Field[];
  rows: Row[];
  views: View[];
}

/** Tutte le raccolte con campi, righe e viste (sono dati piccoli: si caricano insieme). */
export async function loadAllCollections(): Promise<CollectionsSnapshot> {
  const db = await getDatabase();
  const [cs, fs, rs, vs] = await Promise.all([
    db.select<CollectionRow[]>(`SELECT id, name, icon, color, created_at, deleted_at FROM note_collections ORDER BY name COLLATE NOCASE`),
    db.select<FieldRow[]>(`SELECT id, collection_id, name, type, options, position FROM note_collection_fields ORDER BY collection_id, position, id`),
    db.select<DataRow[]>(
      `SELECT id, collection_id, data, position, created_at, updated_at, deleted_at FROM note_collection_rows ORDER BY collection_id, position, id`
    ),
    db.select<ViewRow[]>(`SELECT id, collection_id, name, layout, filter, sort, fields, group_field FROM note_collection_views ORDER BY collection_id, id`),
  ]);
  const fields = fs.map(toField);
  const fieldsOf = new Map<number, Field[]>();
  for (const f of fields) fieldsOf.set(f.collectionId, [...(fieldsOf.get(f.collectionId) ?? []), f]);
  return {
    collections: cs.map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color, createdAt: c.created_at, deletedAt: c.deleted_at })),
    fields,
    rows: rs.map((r) => ({
      id: r.id,
      collectionId: r.collection_id,
      data: cleanData(fieldsOf.get(r.collection_id) ?? [], parseJson(r.data)),
      position: r.position,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at,
    })),
    views: vs.map(toView),
  };
}

// ---------------------------------------------------------------------
// Raccolte
// ---------------------------------------------------------------------

export interface NewField {
  name: string;
  type: FieldType;
  options?: FieldOptions;
}

/** Crea la raccolta con i suoi campi e la vista della sua pagina. Restituisce l'id. */
export async function createCollection(name: string, fields: NewField[]): Promise<number> {
  const db = await getDatabase();
  const result = await db.execute(`INSERT INTO note_collections (name, icon, color, created_at) VALUES (?, 'table', NULL, ?)`, [name, Date.now()]);
  const id = result.lastInsertId;
  if (id == null) throw new Error("Raccolta non creata");
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    await db.execute(`INSERT INTO note_collection_fields (collection_id, name, type, options, position) VALUES (?, ?, ?, ?, ?)`, [
      id,
      f.name,
      f.type,
      JSON.stringify(f.options ?? {}),
      i,
    ]);
  }
  await db.execute(`INSERT INTO note_collection_views (collection_id, name, layout) VALUES (?, '', 'tabella')`, [id]);
  return id;
}

export async function renameCollection(id: number, name: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE note_collections SET name = ? WHERE id = ?`, [name, id]);
}

/** Nel cestino (o fuori, con null). */
export async function setCollectionDeleted(id: number, deletedAt: number | null): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE note_collections SET deleted_at = ? WHERE id = ?`, [deletedAt, id]);
}

/** Elimina per sempre la raccolta con tutto quello che contiene. */
export async function purgeCollection(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM note_collection_rows WHERE collection_id = ?`, [id]);
  await db.execute(`DELETE FROM note_collection_fields WHERE collection_id = ?`, [id]);
  await db.execute(`DELETE FROM note_collection_views WHERE collection_id = ?`, [id]);
  await db.execute(`DELETE FROM note_collections WHERE id = ?`, [id]);
}

// ---------------------------------------------------------------------
// Campi
// ---------------------------------------------------------------------

export async function addField(collectionId: number, field: NewField, position: number): Promise<number> {
  const db = await getDatabase();
  const result = await db.execute(
    `INSERT INTO note_collection_fields (collection_id, name, type, options, position) VALUES (?, ?, ?, ?, ?)`,
    [collectionId, field.name, field.type, JSON.stringify(field.options ?? {}), position]
  );
  if (result.lastInsertId == null) throw new Error("Campo non creato");
  return result.lastInsertId;
}

export interface FieldPatch {
  name?: string;
  type?: FieldType;
  options?: FieldOptions;
  position?: number;
}

export async function updateField(id: number, patch: FieldPatch): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    values.push(patch.name);
  }
  if (patch.type !== undefined) {
    sets.push("type = ?");
    values.push(patch.type);
  }
  if (patch.options !== undefined) {
    sets.push("options = ?");
    values.push(JSON.stringify(patch.options));
  }
  if (patch.position !== undefined) {
    sets.push("position = ?");
    values.push(patch.position);
  }
  if (sets.length === 0) return;
  const db = await getDatabase();
  await db.execute(`UPDATE note_collection_fields SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
}

export async function deleteField(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM note_collection_fields WHERE id = ?`, [id]);
}

// ---------------------------------------------------------------------
// Righe
// ---------------------------------------------------------------------

export async function addRow(collectionId: number, data: Record<string, CellValue>, position: number): Promise<Row> {
  const db = await getDatabase();
  const now = Date.now();
  const result = await db.execute(
    `INSERT INTO note_collection_rows (collection_id, data, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [collectionId, JSON.stringify(data), position, now, now]
  );
  if (result.lastInsertId == null) throw new Error("Riga non creata");
  return { id: result.lastInsertId, collectionId, data, position, createdAt: now, updatedAt: now, deletedAt: null };
}

export async function updateRowData(id: number, data: Record<string, CellValue>, at: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE note_collection_rows SET data = ?, updated_at = ? WHERE id = ?`, [JSON.stringify(data), at, id]);
}

export async function setRowDeleted(id: number, deletedAt: number | null): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE note_collection_rows SET deleted_at = ? WHERE id = ?`, [deletedAt, id]);
}

// ---------------------------------------------------------------------
// Viste
// ---------------------------------------------------------------------

export interface ViewPatch {
  name?: string;
  layout?: ViewLayout;
  filter?: View["filter"];
  sort?: View["sort"];
  hidden?: number[];
  groupField?: number | null;
}

export async function addView(collectionId: number, layout: ViewLayout = "tabella"): Promise<number> {
  const db = await getDatabase();
  const result = await db.execute(`INSERT INTO note_collection_views (collection_id, name, layout) VALUES (?, '', ?)`, [collectionId, layout]);
  if (result.lastInsertId == null) throw new Error("Vista non creata");
  return result.lastInsertId;
}

export async function updateView(id: number, patch: ViewPatch): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    values.push(patch.name);
  }
  if (patch.layout !== undefined) {
    sets.push("layout = ?");
    values.push(patch.layout);
  }
  if (patch.filter !== undefined) {
    sets.push("filter = ?");
    values.push(JSON.stringify(patch.filter));
  }
  if (patch.sort !== undefined) {
    sets.push("sort = ?");
    values.push(patch.sort ? JSON.stringify(patch.sort) : null);
  }
  if (patch.hidden !== undefined) {
    sets.push("fields = ?");
    values.push(JSON.stringify(patch.hidden));
  }
  if (patch.groupField !== undefined) {
    sets.push("group_field = ?");
    values.push(patch.groupField);
  }
  if (sets.length === 0) return;
  const db = await getDatabase();
  await db.execute(`UPDATE note_collection_views SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
}
