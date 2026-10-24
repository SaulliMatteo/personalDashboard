import { useSyncExternalStore } from "react";
import * as repo from "../data/collectionsRepository";
import {
  CHOICE_COLORS,
  FIELD_TYPES,
  asValue,
  convertValue,
  type CellValue,
  type Choice,
  type Collection,
  type Field,
  type FieldOptions,
  type FieldType,
  type Row,
  type ValueContext,
  type View,
} from "./collections";

/**
 * Cache in memoria delle raccolte, condivisa da tutta la pagina Notes: la pagina della raccolta,
 * la barra laterale e (Fase 6b) le viste dentro le note leggono da qui con useCollections(), così
 * una modifica fatta in un punto arriva subito a tutti gli altri, anche nello schermo diviso.
 * Ogni modifica passa dal repository (SQL) e poi aggiorna la cache.
 */

export interface CollectionsState {
  loaded: boolean;
  error: string | null;
  collections: Collection[];
  fields: Field[];
  rows: Row[];
  views: View[];
}

let state: CollectionsState = { loaded: false, error: null, collections: [], fields: [], rows: [], views: [] };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function setState(next: CollectionsState) {
  state = next;
  for (const l of listeners) l();
}

export function subscribeCollections(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCollectionsState(): CollectionsState {
  return state;
}

export function useCollections(): CollectionsState {
  return useSyncExternalStore(subscribeCollections, getCollectionsState);
}

/** Carica tutto dal database (una volta; `force` per ricaricare dopo un errore). */
export function loadCollections(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = repo
    .loadAllCollections()
    .then((snap) => setState({ loaded: true, error: null, ...snap }))
    .catch((error: unknown) => {
      console.error("Raccolte non caricate:", error);
      setState({ ...state, loaded: true, error: "Impossibile caricare le raccolte" });
    });
  return loading;
}

/** Se una scrittura fallisce si ricarica dal database (la cache torna vera) e si rilancia l'errore. */
async function guarded<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    await loadCollections(true);
    throw error;
  }
}

// ---------------------------------------------------------------------
// Letture
// ---------------------------------------------------------------------

export function fieldsOf(s: CollectionsState, collectionId: number): Field[] {
  return s.fields.filter((f) => f.collectionId === collectionId).sort((a, b) => a.position - b.position || a.id - b.id);
}

export function rowsOf(s: CollectionsState, collectionId: number): Row[] {
  return s.rows.filter((r) => r.collectionId === collectionId);
}

/** La vista della pagina della raccolta: la prima creata. */
export function pageViewOf(s: CollectionsState, collectionId: number): View | null {
  return s.views.filter((v) => v.collectionId === collectionId).sort((a, b) => a.id - b.id)[0] ?? null;
}

const newChoiceId = () => Math.random().toString(36).slice(2, 9);

// ---------------------------------------------------------------------
// Raccolte
// ---------------------------------------------------------------------

/** Nuova raccolta con tre campi di partenza: Titolo, Stato (con tre scelte), Data. */
export async function createCollection(name = "Nuova raccolta"): Promise<number> {
  const choices: Choice[] = [
    { id: newChoiceId(), label: "Da fare", color: "senape" },
    { id: newChoiceId(), label: "In corso", color: "blu" },
    { id: newChoiceId(), label: "Fatto", color: "salvia" },
  ];
  const id = await guarded(() =>
    repo.createCollection(name, [
      { name: "Titolo", type: "text" },
      { name: "Stato", type: "select", options: { choices } },
      { name: "Data", type: "date" },
    ])
  );
  await loadCollections(true);
  return id;
}

export async function renameCollection(id: number, name: string): Promise<void> {
  const clean = name.trim() || "Senza nome";
  await guarded(() => repo.renameCollection(id, clean));
  setState({ ...state, collections: state.collections.map((c) => (c.id === id ? { ...c, name: clean } : c)) });
}

export async function trashCollection(id: number): Promise<void> {
  const at = Date.now();
  await guarded(() => repo.setCollectionDeleted(id, at));
  setState({ ...state, collections: state.collections.map((c) => (c.id === id ? { ...c, deletedAt: at } : c)) });
}

export async function restoreCollection(id: number): Promise<void> {
  await guarded(() => repo.setCollectionDeleted(id, null));
  setState({ ...state, collections: state.collections.map((c) => (c.id === id ? { ...c, deletedAt: null } : c)) });
}

export async function purgeCollection(id: number): Promise<void> {
  await guarded(() => repo.purgeCollection(id));
  setState({
    ...state,
    collections: state.collections.filter((c) => c.id !== id),
    fields: state.fields.filter((f) => f.collectionId !== id),
    rows: state.rows.filter((r) => r.collectionId !== id),
    views: state.views.filter((v) => v.collectionId !== id),
  });
}

// ---------------------------------------------------------------------
// Campi
// ---------------------------------------------------------------------

export async function addField(collectionId: number, type: FieldType): Promise<number> {
  const fields = fieldsOf(state, collectionId);
  const base = FIELD_TYPES.find((t) => t.key === type)?.label ?? "Campo";
  let name = base;
  for (let n = 2; fields.some((f) => f.name.toLowerCase() === name.toLowerCase()); n++) name = `${base} ${n}`;
  const options: FieldOptions = type === "select" || type === "multi" ? { choices: [] } : {};
  const position = fields.reduce((m, f) => Math.max(m, f.position), -1) + 1;
  const id = await guarded(() => repo.addField(collectionId, { name, type, options }, position));
  setState({ ...state, fields: [...state.fields, { id, collectionId, name, type, options, position }] });
  return id;
}

export async function renameField(id: number, name: string): Promise<void> {
  const clean = name.trim() || "Campo";
  await guarded(() => repo.updateField(id, { name: clean }));
  setState({ ...state, fields: state.fields.map((f) => (f.id === id ? { ...f, name: clean } : f)) });
}

/** Scelte di select/multi; i valori che puntavano a scelte tolte si svuotano. */
export async function setFieldChoices(id: number, choices: Choice[]): Promise<void> {
  const field = state.fields.find((f) => f.id === id);
  if (!field) return;
  const next: Field = { ...field, options: { choices } };
  await guarded(() => repo.updateField(id, { options: next.options }));
  const rows = await rewriteRows(field.collectionId, (data) => {
    const key = String(id);
    const v = asValue(next, data[key] ?? null);
    if (v === (data[key] ?? null) || JSON.stringify(v) === JSON.stringify(data[key] ?? null)) return null;
    const out = { ...data };
    if (v === null) delete out[key];
    else out[key] = v;
    return out;
  });
  setState({ ...state, fields: state.fields.map((f) => (f.id === id ? next : f)), rows });
}

/** Cambia il tipo convertendo i valori (quello che non si può convertire si perde). */
export async function changeFieldType(id: number, type: FieldType, ctx: ValueContext): Promise<void> {
  const field = state.fields.find((f) => f.id === id);
  if (!field || field.type === type) return;
  const choices: Choice[] = type === "select" || type === "multi" ? [...(field.options.choices ?? [])] : [];
  const converted = new Map<number, CellValue>();
  for (const r of rowsOf(state, field.collectionId)) {
    const v = r.data[String(id)] ?? null;
    if (v !== null) converted.set(r.id, convertValue(field, type, v, choices, ctx, newChoiceId));
  }
  const options: FieldOptions = type === "select" || type === "multi" ? { choices } : {};
  await guarded(() => repo.updateField(id, { type, options }));
  const rows = await rewriteRows(field.collectionId, (data, rowId) => {
    if (!converted.has(rowId)) return null;
    const out = { ...data };
    const v = converted.get(rowId) ?? null;
    if (v === null) delete out[String(id)];
    else out[String(id)] = v;
    return out;
  });
  setState({ ...state, fields: state.fields.map((f) => (f.id === id ? { ...f, type, options } : f)), rows });
}

export async function deleteField(id: number): Promise<void> {
  const field = state.fields.find((f) => f.id === id);
  if (!field) return;
  if (fieldsOf(state, field.collectionId).length <= 1) throw new Error("Una raccolta ha almeno un campo");
  await guarded(() => repo.deleteField(id));
  const rows = await rewriteRows(field.collectionId, (data) => {
    if (!(String(id) in data)) return null;
    const out = { ...data };
    delete out[String(id)];
    return out;
  });
  setState({ ...state, fields: state.fields.filter((f) => f.id !== id), rows });
}

/** Sposta il campo di un posto a sinistra (-1) o a destra (+1). */
export async function moveField(id: number, direction: -1 | 1): Promise<void> {
  const field = state.fields.find((f) => f.id === id);
  if (!field) return;
  const list = fieldsOf(state, field.collectionId);
  const i = list.findIndex((f) => f.id === id);
  const j = i + direction;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await guarded(async () => {
    for (let p = 0; p < list.length; p++) if (list[p].position !== p) await repo.updateField(list[p].id, { position: p });
  });
  const pos = new Map(list.map((f, p) => [f.id, p]));
  setState({ ...state, fields: state.fields.map((f) => (pos.has(f.id) ? { ...f, position: pos.get(f.id) ?? f.position } : f)) });
}

/** Riscrive nel database le righe che `change` modifica (null = invariata); restituisce le righe nuove. */
async function rewriteRows(
  collectionId: number,
  change: (data: Record<string, CellValue>, rowId: number) => Record<string, CellValue> | null
): Promise<Row[]> {
  const at = Date.now();
  const updated = new Map<number, Record<string, CellValue>>();
  for (const r of rowsOf(state, collectionId)) {
    const next = change(r.data, r.id);
    if (next) updated.set(r.id, next);
  }
  await guarded(async () => {
    for (const [rowId, data] of updated) await repo.updateRowData(rowId, data, at);
  });
  return state.rows.map((r) => (updated.has(r.id) ? { ...r, data: updated.get(r.id) ?? r.data, updatedAt: at } : r));
}

// ---------------------------------------------------------------------
// Righe
// ---------------------------------------------------------------------

export async function addRow(collectionId: number, data: Record<string, CellValue> = {}): Promise<Row> {
  const position = rowsOf(state, collectionId).reduce((m, r) => Math.max(m, r.position), -1) + 1;
  const row = await guarded(() => repo.addRow(collectionId, data, position));
  setState({ ...state, rows: [...state.rows, row] });
  return row;
}

/** Cambia una cella. La cache si aggiorna subito (si scrive senza aspettare il disco). */
export async function setCell(rowId: number, fieldId: number, value: CellValue): Promise<void> {
  const row = state.rows.find((r) => r.id === rowId);
  const field = state.fields.find((f) => f.id === fieldId);
  if (!row || !field) return;
  const clean = asValue(field, value);
  const key = String(fieldId);
  if (JSON.stringify(clean) === JSON.stringify(row.data[key] ?? null)) return;
  const data = { ...row.data };
  if (clean === null) delete data[key];
  else data[key] = clean;
  const at = Date.now();
  setState({ ...state, rows: state.rows.map((r) => (r.id === rowId ? { ...r, data, updatedAt: at } : r)) });
  await guarded(() => repo.updateRowData(rowId, data, at));
}

export async function trashRow(rowId: number): Promise<void> {
  const at = Date.now();
  await guarded(() => repo.setRowDeleted(rowId, at));
  setState({ ...state, rows: state.rows.map((r) => (r.id === rowId ? { ...r, deletedAt: at } : r)) });
}

export async function restoreRow(rowId: number): Promise<void> {
  await guarded(() => repo.setRowDeleted(rowId, null));
  setState({ ...state, rows: state.rows.map((r) => (r.id === rowId ? { ...r, deletedAt: null } : r)) });
}

// ---------------------------------------------------------------------
// Viste
// ---------------------------------------------------------------------

export async function updateView(id: number, patch: repo.ViewPatch): Promise<void> {
  setState({ ...state, views: state.views.map((v) => (v.id === id ? { ...v, ...patch } : v)) });
  await guarded(() => repo.updateView(id, patch));
}

/** Colore proposto per una scelta nuova (gira sulla palette). */
export function nextChoiceColor(choices: Choice[]): Choice["color"] {
  return CHOICE_COLORS[choices.length % CHOICE_COLORS.length].key;
}

export { newChoiceId };
