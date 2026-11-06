/**
 * Sync tra dispositivi: da riga SQLite a elemento del cloud e ritorno. Logica PURA: gli id li risolve il chiamante
 * (con le mappe di sync_map già caricate), quindi si prova senza DB né rete (scripts/sync/records.test.mts).
 *
 * Nel cloud non compare mai un id locale: le colonne di riferimento (`refs` in tables.ts) e gli id dentro i
 * contenuti diventano id globali al push e tornano gli id locali di quel dispositivo al pull. Id dentro i contenuti:
 * - pagine: `data-view="<id vista>"` e `data-ref-row="<id riga>"` nell'HTML (widgets/notes/lib/blocks.ts);
 * - righe delle Raccolte: `data` è un JSON per id di campo, e i campi "nota" contengono l'id di una nota;
 * - viste: `filter` [{field}], `sort` {field}, `fields` [id dei campi nascosti].
 * Un riferimento che non si trova diventa "0" nell'HTML (le Note lo scartano come id non valido) o sparisce dai JSON.
 */
import { PER_DEVICE_SETTINGS, type SettingKey } from "../../settings/schema";
import { specOf, type SyncKind, type TableSpec } from "../tables";

/** Valori di una riga, per nome di colonna (come li dà plugin-sql). */
export type Row = Record<string, unknown>;

/** Un elemento nel cloud: l'ultima versione di una riga (o la sua cancellazione). */
export interface SyncRecord {
  kind: SyncKind;
  /** Id globale (uuid; per le impostazioni la chiave). */
  uid: string;
  /** Quando è stato cambiato (ms, orologio corretto con quello del server). */
  changedAt: number;
  deleted: boolean;
  /** Dispositivo che l'ha cambiato (id dei Gruppi). */
  deviceId: string;
  /** Colonne di `columns` già tradotte; null se cancellato. */
  data: Row | null;
}

export interface PushContext {
  /** Id di questo dispositivo: diventa l'origine delle sessioni registrate qui. */
  deviceId: string;
  /** Id globale di una riga locale, o null se non c'è (riga cancellata). */
  uidOf(kind: SyncKind, localId: number): string | null;
  /** Tipo di un campo locale delle Raccolte (per riconoscere i campi "nota"), o null. */
  fieldTypeOf(localFieldId: number): string | null;
}

export interface PullContext {
  deviceId: string;
  /** Id locale dell'elemento con questo id globale, o null se qui non c'è (ancora). */
  localOf(kind: SyncKind, uid: string): number | null;
  fieldTypeOf(localFieldId: number): string | null;
  /**
   * false: un riferimento non trovato rimanda l'elemento (arriverà nel prossimo giro). true (elemento rimandato
   * troppe volte, o l'altro è stato cancellato): si applica lo stesso, senza quel riferimento, quando si può.
   */
  lenient: boolean;
}

export type PullResult = { ok: true; row: Row } | { ok: false; missing: string[] };

/** Le impostazioni di questo dispositivo non viaggiano (core/settings/schema.ts). */
export function isSyncedSetting(key: string): boolean {
  return !PER_DEVICE_SETTINGS.has(key as SettingKey);
}

/** L'ultima modifica vince; a parità di istante decide l'id del dispositivo, così tutti scelgono la stessa. */
export function isNewer(a: Pick<SyncRecord, "changedAt" | "deviceId">, b: Pick<SyncRecord, "changedAt" | "deviceId">): boolean {
  return a.changedAt > b.changedAt || (a.changedAt === b.changedAt && a.deviceId > b.deviceId);
}

const asLocalId = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

function parseJson(text: unknown): unknown {
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------- traduttori degli id nei contenuti

/** Traduce un id (locale ↔ globale); null = non trovato. */
type Resolve = (kind: SyncKind, id: string) => string | null;

/** Nei JSON gli id locali sono numeri (le Note scartano il resto), quelli globali testo. */
const idValue = (id: string, toLocal: boolean): string | number => (toLocal ? Number(id) : id);

const PAGE_REF = /data-(view|ref-row)="([^"]*)"/g;

function pageContent(html: string, resolve: Resolve): string {
  if (!html.includes("data-view=") && !html.includes("data-ref-row=")) return html;
  return html.replace(PAGE_REF, (_all, attr: string, id: string) => {
    const kind: SyncKind = attr === "view" ? "view" : "row";
    return `data-${attr}="${(id !== "0" && resolve(kind, id)) || "0"}"`;
  });
}

/**
 * `data` di una riga: chiavi = id dei campi, e i campi "nota" hanno l'id di una nota (numero in locale, testo nel
 * cloud: `toLocal` dice in che verso si traduce).
 */
function rowData(text: unknown, resolve: Resolve, typeOf: (fieldId: string) => string | null, toLocal: boolean): string {
  const data = parseJson(text);
  if (!isObject(data)) return "{}";
  const out: Record<string, unknown> = {};
  for (const [fieldId, value] of Object.entries(data)) {
    const target = resolve("field", fieldId);
    if (!target) continue;
    if (typeOf(fieldId) === "note") {
      const note = value === null || value === undefined ? null : resolve("note", String(value));
      if (note) out[target] = idValue(note, toLocal);
      continue;
    }
    out[target] = value;
  }
  return JSON.stringify(out);
}

function viewFilter(text: unknown, resolve: Resolve, toLocal: boolean): string {
  const list = parseJson(text);
  if (!Array.isArray(list)) return "[]";
  return JSON.stringify(
    list.flatMap((f) => {
      if (!isObject(f)) return [];
      const field = resolve("field", String(f.field));
      return field ? [{ ...f, field: idValue(field, toLocal) }] : [];
    })
  );
}

function viewSort(text: unknown, resolve: Resolve, toLocal: boolean): string | null {
  const sort = parseJson(text);
  if (!isObject(sort)) return null;
  const field = resolve("field", String(sort.field));
  return field ? JSON.stringify({ ...sort, field: idValue(field, toLocal) }) : null;
}

function viewFields(text: unknown, resolve: Resolve, toLocal: boolean): string {
  const list = parseJson(text);
  if (!Array.isArray(list)) return "[]";
  return JSON.stringify(
    list.flatMap((id) => {
      const field = resolve("field", String(id));
      return field ? [idValue(field, toLocal)] : [];
    })
  );
}

/** Gli id dei contenuti di un elemento, tradotti con `resolve` (stesso codice per push e pull). */
function translateContent(kind: SyncKind, row: Row, resolve: Resolve, typeOf: (fieldId: string) => string | null, toLocal: boolean): void {
  if (kind === "page" && typeof row.content === "string") row.content = pageContent(row.content, resolve);
  if (kind === "row") row.data = rowData(row.data, resolve, typeOf, toLocal);
  if (kind === "view") {
    row.filter = viewFilter(row.filter, resolve, toLocal);
    row.sort = viewSort(row.sort, resolve, toLocal);
    row.fields = viewFields(row.fields, resolve, toLocal);
  }
}

// ---------------------------------------------------------------- push

/**
 * I dati da mandare per una riga locale, o null se non va mandata: impostazione di questo dispositivo, oppure riga
 * orfana (punta a qualcosa che qui non c'è più, es. la pagina di una nota cancellata).
 */
export function rowToData(spec: TableSpec, row: Row, ctx: PushContext): Row | null {
  if (spec.kind === "setting" && !isSyncedSetting(String(row.key))) return null;
  const out: Row = {};
  for (const column of spec.columns) out[column] = row[column] ?? null;
  for (const [column, ref] of Object.entries(spec.refs)) {
    const local = asLocalId(out[column]);
    if (local === null) {
      out[column] = null;
      continue;
    }
    const uid = ctx.uidOf(ref.kind, local);
    if (!uid && !ref.nullable) return null;
    out[column] = uid;
  }
  if (spec.kind === "session") out.origin_device = typeof row.origin_device === "string" ? row.origin_device : ctx.deviceId;
  const toUid: Resolve = (kind, id) => {
    const local = Number(id);
    return Number.isInteger(local) && local > 0 ? ctx.uidOf(kind, local) : null;
  };
  translateContent(spec.kind, out, toUid, (fieldId) => ctx.fieldTypeOf(Number(fieldId)), false);
  return out;
}

// ---------------------------------------------------------------- pull

/** La riga locale da scrivere per i dati arrivati, o gli id globali che qui mancano ancora. */
export function dataToRow(kind: SyncKind, data: Row, ctx: PullContext): PullResult {
  const spec = specOf(kind);
  const missing = new Set<string>();
  const row: Row = {};
  for (const column of spec.columns) row[column] = data[column] ?? null;
  for (const [column, ref] of Object.entries(spec.refs)) {
    const uid = row[column];
    if (typeof uid !== "string" || !uid) {
      row[column] = null;
      continue;
    }
    const local = ctx.localOf(ref.kind, uid);
    if (local === null && !(ctx.lenient && ref.nullable)) missing.add(uid);
    row[column] = local;
  }
  if (kind === "session") row.origin_device = row.origin_device === ctx.deviceId ? null : row.origin_device;
  const toLocal: Resolve = (refKind, uid) => {
    const local = ctx.localOf(refKind, uid);
    if (local === null && !ctx.lenient) missing.add(uid);
    return local === null ? null : String(local);
  };
  // nel `data` arrivato i campi sono id globali: il tipo si legge dal campo locale corrispondente
  translateContent(kind, row, toLocal, (fieldUid) => {
    const local = ctx.localOf("field", fieldUid);
    return local === null ? null : ctx.fieldTypeOf(local);
  }, true);
  return missing.size > 0 ? { ok: false, missing: [...missing] } : { ok: true, row };
}
