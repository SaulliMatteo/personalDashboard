/**
 * Raccolte: piccole tabelle di dati con colonne tipizzate, fuori dalle note. Logica PURA
 * (niente DOM, niente database, orologio passato da fuori): tipi dei campi, valori,
 * filtro, ordinamento, raggruppamento della bacheca, CSV e JSON della copia su disco.
 * L'SQL sta in data/collectionsRepository.ts, la cache condivisa in lib/collectionsStore.ts.
 */

// ---------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------

export const FIELD_TYPES = [
  { key: "text", label: "Testo" },
  { key: "number", label: "Numero" },
  { key: "date", label: "Data" },
  { key: "select", label: "Scelta" },
  { key: "multi", label: "Scelte multiple" },
  { key: "check", label: "Casella" },
  { key: "url", label: "Link" },
  { key: "note", label: "Nota" },
  { key: "file", label: "File" },
] as const;

export type FieldType = (typeof FIELD_TYPES)[number]["key"];

/** Colori delle scelte: token --tint-* del tema (più il grigio neutro). */
export const CHOICE_COLORS = [
  { key: "senape", label: "Senape" },
  { key: "salvia", label: "Salvia" },
  { key: "blu", label: "Blu" },
  { key: "malva", label: "Malva" },
  { key: "grigio", label: "Grigio" },
] as const;

export type ChoiceColor = (typeof CHOICE_COLORS)[number]["key"];

export interface Choice {
  id: string;
  label: string;
  color: ChoiceColor;
}

export interface FieldOptions {
  /** Solo select e multi. */
  choices?: Choice[];
}

export interface Field {
  id: number;
  collectionId: number;
  name: string;
  type: FieldType;
  options: FieldOptions;
  position: number;
}

export interface FileValue {
  name: string;
  size: number;
}

/** Valore di una cella: dipende dal tipo del campo (vedi asValue). */
export type CellValue = string | number | boolean | string[] | FileValue | null;

export interface Row {
  id: number;
  collectionId: number;
  /** Valori per id di campo. */
  data: Record<string, CellValue>;
  position: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Collection {
  id: number;
  name: string;
  icon: string;
  color: string | null;
  createdAt: number;
  deletedAt: number | null;
}

export type ViewLayout = "tabella" | "schede" | "bacheca";

export type FilterOp = "contiene" | "vuoto" | "pieno" | "uguale" | "diverso" | "maggiore" | "minore" | "prima" | "dopo" | "spuntato" | "nonSpuntato";

export interface Filter {
  field: number;
  op: FilterOp;
  value?: string;
}

export interface Sort {
  field: number;
  dir: 1 | -1;
}

export interface View {
  id: number;
  collectionId: number;
  name: string;
  layout: ViewLayout;
  filter: Filter[];
  sort: Sort | null;
  /** Campi nascosti nella vista. */
  hidden: number[];
  /** Bacheca: campo per cui raggruppare (select o date). */
  groupField: number | null;
}

// ---------------------------------------------------------------------
// Validazione
// ---------------------------------------------------------------------

const TYPE_SET = new Set<string>(FIELD_TYPES.map((t) => t.key));
const COLOR_SET = new Set<string>(CHOICE_COLORS.map((c) => c.key));
const LAYOUTS: readonly string[] = ["tabella", "schede", "bacheca"];
const OPS: readonly string[] = ["contiene", "vuoto", "pieno", "uguale", "diverso", "maggiore", "minore", "prima", "dopo", "spuntato", "nonSpuntato"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function asFieldType(v: unknown): FieldType {
  return typeof v === "string" && TYPE_SET.has(v) ? (v as FieldType) : "text";
}

export function asLayout(v: unknown): ViewLayout {
  return typeof v === "string" && LAYOUTS.includes(v) ? (v as ViewLayout) : "tabella";
}

export function asChoiceColor(v: unknown): ChoiceColor {
  return typeof v === "string" && COLOR_SET.has(v) ? (v as ChoiceColor) : "grigio";
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function asOptions(type: FieldType, v: unknown): FieldOptions {
  if (type !== "select" && type !== "multi") return {};
  const raw = isObject(v) && Array.isArray(v.choices) ? v.choices : [];
  const seen = new Set<string>();
  const choices: Choice[] = [];
  for (const c of raw) {
    if (!isObject(c) || typeof c.id !== "string" || !c.id || seen.has(c.id)) continue;
    seen.add(c.id);
    choices.push({ id: c.id, label: typeof c.label === "string" ? c.label.slice(0, 80) : "", color: asChoiceColor(c.color) });
  }
  return { choices };
}

export function asFilters(v: unknown): Filter[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((f) =>
    isObject(f) && Number.isInteger(f.field) && typeof f.op === "string" && OPS.includes(f.op)
      ? [{ field: f.field as number, op: f.op as FilterOp, ...(typeof f.value === "string" ? { value: f.value } : {}) }]
      : []
  );
}

export function asSort(v: unknown): Sort | null {
  return isObject(v) && Number.isInteger(v.field) && (v.dir === 1 || v.dir === -1) ? { field: v.field as number, dir: v.dir } : null;
}

export function asIdList(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : [];
}

export function isDateString(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00`);
  return !Number.isNaN(d.getTime()) && toDateString(d) === v;
}

/** Il valore ripulito per il tipo del campo (null = vuoto). */
export function asValue(field: Pick<Field, "type" | "options">, v: unknown): CellValue {
  switch (field.type) {
    case "text":
    case "url":
      return typeof v === "string" && v !== "" ? v.slice(0, 5000) : null;
    case "number": {
      const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : Number.NaN;
      return Number.isFinite(n) ? n : null;
    }
    case "date":
      return isDateString(v) ? v : null;
    case "select": {
      const ids = new Set((field.options.choices ?? []).map((c) => c.id));
      return typeof v === "string" && ids.has(v) ? v : null;
    }
    case "multi": {
      const ids = new Set((field.options.choices ?? []).map((c) => c.id));
      const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && ids.has(x)) : [];
      return list.length > 0 ? [...new Set(list)] : null;
    }
    case "check":
      return v === true ? true : null;
    case "note":
      return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
    case "file":
      return isObject(v) && typeof v.name === "string" && v.name && typeof v.size === "number" ? { name: v.name, size: v.size } : null;
  }
}

/** Tutti i valori di una riga ripuliti (i campi che non esistono più spariscono). */
export function cleanData(fields: Field[], data: unknown): Record<string, CellValue> {
  const out: Record<string, CellValue> = {};
  if (!isObject(data)) return out;
  for (const f of fields) {
    const v = asValue(f, data[String(f.id)]);
    if (v !== null) out[String(f.id)] = v;
  }
  return out;
}

// ---------------------------------------------------------------------
// Date
// ---------------------------------------------------------------------

export function toDateString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** "12 nov" (con l'anno se non è quello di `now`). */
export function formatDate(v: string, now: Date): string {
  const d = new Date(`${v}T00:00:00`);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** Il lunedì della settimana della data. */
export function weekStart(v: string): string {
  const d = new Date(`${v}T00:00:00`);
  const day = (d.getDay() + 6) % 7; // lunedì = 0
  d.setDate(d.getDate() - day);
  return toDateString(d);
}

// ---------------------------------------------------------------------
// Testo dei valori
// ---------------------------------------------------------------------

export interface ValueContext {
  now: Date;
  /** Titolo di una nota (campi "nota"). */
  noteTitle: (id: number) => string | null;
}

export function choiceOf(field: Field, id: string): Choice | null {
  return field.options.choices?.find((c) => c.id === id) ?? null;
}

/** Il valore come testo semplice (tabella senza stile, CSV, ricerca, ordinamento). */
export function valueText(field: Field, v: CellValue, ctx: ValueContext): string {
  if (v === null || v === undefined) return "";
  switch (field.type) {
    case "number":
      return typeof v === "number" ? String(v).replace(".", ",") : "";
    case "date":
      return typeof v === "string" ? formatDate(v, ctx.now) : "";
    case "select":
      return typeof v === "string" ? choiceOf(field, v)?.label ?? "" : "";
    case "multi":
      return Array.isArray(v) ? v.map((id) => choiceOf(field, id)?.label ?? "").filter(Boolean).join(", ") : "";
    case "check":
      return v === true ? "Sì" : "";
    case "note":
      return typeof v === "number" ? ctx.noteTitle(v) ?? "Nota eliminata" : "";
    case "file":
      return typeof v === "object" && !Array.isArray(v) && v ? v.name : "";
    default:
      return typeof v === "string" ? v : "";
  }
}

// ---------------------------------------------------------------------
// Filtro e ordinamento
// ---------------------------------------------------------------------

/** Operatori che hanno senso per il tipo (il primo è quello proposto). */
export function opsFor(type: FieldType): FilterOp[] {
  switch (type) {
    case "number":
      return ["uguale", "diverso", "maggiore", "minore", "vuoto", "pieno"];
    case "date":
      return ["prima", "dopo", "uguale", "vuoto", "pieno"];
    case "select":
      return ["uguale", "diverso", "vuoto", "pieno"];
    case "multi":
      return ["contiene", "vuoto", "pieno"];
    case "check":
      return ["spuntato", "nonSpuntato"];
    default:
      return ["contiene", "vuoto", "pieno"];
  }
}

export const OP_LABELS: Record<FilterOp, string> = {
  contiene: "contiene",
  vuoto: "è vuoto",
  pieno: "non è vuoto",
  uguale: "è",
  diverso: "non è",
  maggiore: "maggiore di",
  minore: "minore di",
  prima: "prima del",
  dopo: "dopo il",
  spuntato: "spuntata",
  nonSpuntato: "non spuntata",
};

/** L'operatore vuole un valore? */
export function opNeedsValue(op: FilterOp): boolean {
  return op !== "vuoto" && op !== "pieno" && op !== "spuntato" && op !== "nonSpuntato";
}

function matches(field: Field, v: CellValue, f: Filter, ctx: ValueContext): boolean {
  const empty = v === null || v === undefined || (Array.isArray(v) && v.length === 0);
  switch (f.op) {
    case "vuoto":
      return empty;
    case "pieno":
      return !empty;
    case "spuntato":
      return v === true;
    case "nonSpuntato":
      return v !== true;
  }
  const want = f.value ?? "";
  if (want === "") return true; // filtro non ancora completo: non toglie niente
  switch (field.type) {
    case "number": {
      const n = Number(want.replace(",", "."));
      if (typeof v !== "number" || !Number.isFinite(n)) return f.op === "diverso" && typeof v !== "number";
      if (f.op === "uguale") return v === n;
      if (f.op === "diverso") return v !== n;
      if (f.op === "maggiore") return v > n;
      if (f.op === "minore") return v < n;
      return false;
    }
    case "date":
      if (typeof v !== "string") return false;
      if (f.op === "prima") return v < want;
      if (f.op === "dopo") return v > want;
      return v === want;
    case "select":
      return f.op === "diverso" ? v !== want : v === want;
    case "multi":
      return Array.isArray(v) && v.includes(want);
    default:
      return valueText(field, v, ctx).toLowerCase().includes(want.toLowerCase());
  }
}

const collator = new Intl.Collator("it", { numeric: true, sensitivity: "base" });

function compareValues(field: Field, a: CellValue, b: CellValue, ctx: ValueContext): number {
  const ea = a === null || a === undefined;
  const eb = b === null || b === undefined;
  if (ea || eb) return ea && eb ? 0 : ea ? 1 : -1;
  if (field.type === "number" && typeof a === "number" && typeof b === "number") return a - b;
  if (field.type === "date" && typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  if (field.type === "check") return a === b ? 0 : a === true ? -1 : 1;
  if (field.type === "select" && typeof a === "string" && typeof b === "string") {
    // Nell'ordine delle scelte, come le ha messe l'utente.
    const order = (field.options.choices ?? []).map((c) => c.id);
    return order.indexOf(a) - order.indexOf(b);
  }
  return collator.compare(valueText(field, a, ctx), valueText(field, b, ctx));
}

/** Le righe vive della vista: filtrate e ordinate (le vuote in fondo, a prescindere dal verso). */
export function viewRows(rows: Row[], fields: Field[], view: Pick<View, "filter" | "sort">, ctx: ValueContext): Row[] {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const live = rows.filter((r) => r.deletedAt === null);
  const filtered = live.filter((r) =>
    view.filter.every((f) => {
      const field = byId.get(f.field);
      return !field || matches(field, r.data[String(field.id)] ?? null, f, ctx);
    })
  );
  const sortField = view.sort ? byId.get(view.sort.field) : undefined;
  const dir = view.sort?.dir ?? 1;
  return [...filtered].sort((a, b) => {
    if (sortField) {
      const va = a.data[String(sortField.id)] ?? null;
      const vb = b.data[String(sortField.id)] ?? null;
      const empty = (va === null ? 1 : 0) - (vb === null ? 1 : 0);
      if (empty !== 0) return empty;
      const c = compareValues(sortField, va, vb, ctx) * dir;
      if (c !== 0) return c;
    }
    return a.position - b.position || a.id - b.id;
  });
}

// ---------------------------------------------------------------------
// Bacheca
// ---------------------------------------------------------------------

export interface Group {
  /** Id della scelta, lunedì della settimana ("2026-11-02") o "" (senza valore). */
  key: string;
  label: string;
  color: ChoiceColor | null;
  rows: Row[];
}

/** Campi con cui si può raggruppare la bacheca. */
export function groupableFields(fields: Field[]): Field[] {
  return fields.filter((f) => f.type === "select" || f.type === "date");
}

/**
 * Colonne della bacheca: per scelta (nell'ordine delle scelte, anche vuote) o per settimana di
 * una data (solo le settimane che hanno righe, in ordine di tempo). In fondo "Senza …".
 */
export function groupRows(rows: Row[], field: Field, now: Date): Group[] {
  const empty: Group = { key: "", label: field.type === "date" ? "Senza data" : `Senza ${field.name.toLowerCase()}`, color: null, rows: [] };
  if (field.type === "select") {
    const groups: Group[] = (field.options.choices ?? []).map((c) => ({ key: c.id, label: c.label || "Senza nome", color: c.color, rows: [] }));
    const byKey = new Map(groups.map((g) => [g.key, g]));
    for (const r of rows) {
      const v = r.data[String(field.id)];
      const group = typeof v === "string" ? byKey.get(v) : undefined;
      (group ?? empty).rows.push(r);
    }
    return empty.rows.length > 0 || groups.length === 0 ? [...groups, empty] : groups;
  }
  const weeks = new Map<string, Group>();
  const thisWeek = weekStart(toDateString(now));
  for (const r of rows) {
    const v = r.data[String(field.id)];
    if (typeof v !== "string" || !isDateString(v)) {
      empty.rows.push(r);
      continue;
    }
    const key = weekStart(v);
    let g = weeks.get(key);
    if (!g) {
      const label = key === thisWeek ? "Questa settimana" : `Settimana del ${formatDate(key, now)}`;
      g = { key, label, color: null, rows: [] };
      weeks.set(key, g);
    }
    g.rows.push(r);
  }
  const sorted = [...weeks.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  return empty.rows.length > 0 ? [...sorted, empty] : sorted;
}

// ---------------------------------------------------------------------
// Cambiare il tipo di un campo
// ---------------------------------------------------------------------

/**
 * Converte un valore al tipo nuovo (quello che non si può convertire si perde). Per select e
 * multi le scelte mancanti vengono create: `choices` è l'elenco (aggiornato sul posto).
 */
export function convertValue(from: Field, to: FieldType, v: CellValue, choices: Choice[], ctx: ValueContext, newChoiceId: () => string): CellValue {
  if (v === null) return null;
  if (from.type === to) return v;
  const text = valueText(from, v, ctx);
  const choiceFor = (label: string): string => {
    const found = choices.find((c) => c.label.toLowerCase() === label.toLowerCase());
    if (found) return found.id;
    const c: Choice = { id: newChoiceId(), label, color: CHOICE_COLORS[choices.length % CHOICE_COLORS.length].key };
    choices.push(c);
    return c.id;
  };
  switch (to) {
    case "text":
      return text || null;
    case "url":
      return /^(https?:|mailto:)/i.test(text) ? text : null;
    case "number":
      return asValue({ type: "number", options: {} }, text);
    case "date":
      return typeof v === "string" && isDateString(v) ? v : null;
    case "check":
      return text !== "" && text !== "0" ? true : null;
    case "select": {
      const first = from.type === "multi" && Array.isArray(v) ? (choiceOf(from, v[0])?.label ?? "") : text;
      return first ? choiceFor(first) : null;
    }
    case "multi": {
      const labels = from.type === "multi" && Array.isArray(v) ? v.map((id) => choiceOf(from, id)?.label ?? "") : text.split(",");
      const ids = labels.map((l) => l.trim()).filter(Boolean).map(choiceFor);
      return ids.length > 0 ? [...new Set(ids)] : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------
// Copia su disco: JSON e CSV
// ---------------------------------------------------------------------

/** Contrassegno dei file JSON scritti dall'app (solo quelli si possono sovrascrivere o togliere). */
export const COLLECTION_FILE_KIND = "personal-dashboard/raccolta";

export function collectionToJson(collection: Collection, fields: Field[], rows: Row[]): string {
  const live = rows.filter((r) => r.deletedAt === null).sort((a, b) => a.position - b.position);
  return JSON.stringify(
    {
      kind: COLLECTION_FILE_KIND,
      version: 1,
      id: collection.id,
      name: collection.name,
      fields: fields.map((f) => ({ id: f.id, name: f.name, type: f.type, options: f.options })),
      rows: live.map((r) => ({ id: r.id, data: r.data, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    },
    null,
    2
  );
}

function csvCell(text: string): string {
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV con il ";" (lo apre bene Excel in italiano); date in formato AAAA-MM-GG. */
export function collectionToCsv(fields: Field[], rows: Row[], ctx: ValueContext): string {
  const live = rows.filter((r) => r.deletedAt === null).sort((a, b) => a.position - b.position);
  const lines = [fields.map((f) => csvCell(f.name)).join(";")];
  for (const r of live) {
    lines.push(
      fields
        .map((f) => {
          const v = r.data[String(f.id)] ?? null;
          return csvCell(f.type === "date" && typeof v === "string" ? v : valueText(f, v, ctx));
        })
        .join(";")
    );
  }
  return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------
// Da una tabella della nota a una raccolta ("Trasforma in raccolta")
// ---------------------------------------------------------------------

const NUMBER_RE = /^-?\d+([.,]\d+)?$/;
const IT_DATE_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

/** "12/11/2026" o "2026-11-12" → "2026-11-12" (o null). */
export function parseDateText(text: string): string | null {
  const t = text.trim();
  if (isDateString(t)) return t;
  const m = IT_DATE_RE.exec(t);
  if (!m) return null;
  const v = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isDateString(v) ? v : null;
}

/** Il tipo di una colonna dai suoi valori: numero o data se lo sono tutti, altrimenti testo. */
export function inferFieldType(values: string[]): "text" | "number" | "date" {
  const filled = values.map((v) => v.trim()).filter(Boolean);
  if (filled.length === 0) return "text";
  if (filled.every((v) => NUMBER_RE.test(v))) return "number";
  if (filled.every((v) => parseDateText(v) !== null)) return "date";
  return "text";
}

export interface TableImport {
  fields: { name: string; type: "text" | "number" | "date" }[];
  /** Per riga, i valori nell'ordine dei campi (già del tipo giusto). */
  rows: CellValue[][];
}

/**
 * Colonne e righe di una tabella (testo delle celle) → campi e valori di una raccolta.
 * `header` = testo dell'intestazione, null se la tabella non ce l'ha ("Colonna 1"…).
 * Le righe del tutto vuote si saltano.
 */
export function tableToCollection(header: string[] | null, body: string[][]): TableImport {
  const width = Math.max(header?.length ?? 0, ...body.map((r) => r.length), 1);
  const used = new Set<string>();
  const fields = Array.from({ length: width }, (_, c) => {
    let name = (header?.[c] ?? "").trim() || `Colonna ${c + 1}`;
    const base = name;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    used.add(name.toLowerCase());
    return { name, type: inferFieldType(body.map((r) => r[c] ?? "")) };
  });
  const rows = body
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) =>
      fields.map((f, c): CellValue => {
        const v = (r[c] ?? "").trim();
        if (!v) return null;
        if (f.type === "number") return Number(v.replace(",", "."));
        if (f.type === "date") return parseDateText(v);
        return v;
      })
    );
  return { fields, rows };
}

/** Il titolo di una riga: il testo del primo campo. */
export function rowTitle(fields: Field[], row: Row, ctx: ValueContext): string {
  const first = fields[0];
  return (first ? valueText(first, row.data[String(first.id)] ?? null, ctx) : "") || "Senza titolo";
}
