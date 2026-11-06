/**
 * Un giro di sync: prima si applica ciò che è arrivato nel cloud (pull per `seq`), poi si manda ciò che è cambiato
 * qui (push dal registro sync_outbox). DB e rete arrivano da fuori (`SyncStore`, `SyncServer`), così il giro si prova
 * con due SQLite veri e un server finto (scripts/sync/round.test.mts).
 *
 * Regole:
 * - per elemento vince l'ultima modifica (`isNewer`): un elemento arrivato più vecchio di una modifica locale non
 *   ancora mandata si salta, e la modifica locale parte subito dopo;
 * - un elemento che punta a qualcosa che qui non c'è ancora aspetta (in `meta`) e si riprova ai giri successivi; dopo
 *   LENIENT_AFTER tentativi si applica senza i riferimenti facoltativi, o si scarta;
 * - `adopt` (primo sync con "Unisci", o un tipo che comincia a sincronizzarsi): un elemento del cloud uguale a uno
 *   locale (stessa materia, stessa sessione…) prende il posto dell'id globale locale invece di duplicarlo.
 */
import { isNewer, isSyncedSetting, dataToRow, rowToData, type Row, type SyncRecord } from "./records";
import { kindOrder, specOf, specOfTable, SYNC_TABLES, type SyncKind, type TableSpec } from "../tables";
import type { LocalId, OutboxEntry, SyncRepository } from "../syncRepository";
import { isUniqueViolation } from "../syncRepository";

/** Elemento letto dal server, con la sua posizione nell'ordine di scrittura. */
export interface ServerRecord extends SyncRecord {
  seq: number;
}

export interface SyncServer {
  /** Restituisce gli elementi rifiutati (il server ne ha uno più nuovo), con la versione del server. */
  push(records: SyncRecord[]): Promise<SyncRecord[]>;
  pull(afterSeq: number): Promise<{ records: ServerRecord[]; lastSeq: number; more: boolean }>;
}

export type SyncStore = Pick<
  SyncRepository,
  | "loadMap"
  | "setUid"
  | "removeUid"
  | "fieldTypes"
  | "outbox"
  | "ackOutbox"
  | "dropOutbox"
  | "rows"
  | "findBy"
  | "insert"
  | "update"
  | "remove"
  | "getMeta"
  | "setMeta"
>;

export interface RoundOptions {
  deviceId: string;
  /** ora del server ≈ ora locale + clockOffset (ms) */
  clockOffset: number;
  kinds: readonly SyncKind[];
  /** riconosci gli elementi uguali a quelli locali invece di duplicarli (vedi sopra) */
  adopt: boolean;
  /** chiavi di `meta` per account */
  cursorKey: string;
  pendingKey: string;
  /** Massimo di elementi per invio (limite del server). */
  batch?: number;
  /** Elemento troppo grande per il server: non si manda (chi chiama lo segnala). */
  maxRecordBytes?: number;
  onSkipped?: (kind: SyncKind, reason: "too_large" | "unresolved") => void;
}

export interface RoundResult {
  /** Tipi con righe locali cambiate dai dati arrivati: chi li mostra deve ricaricarli. */
  changed: Set<SyncKind>;
  pulled: number;
  pushed: number;
}

/** Dopo quanti tentativi un elemento con riferimenti mancanti si applica lo stesso (o si scarta). */
export const LENIENT_AFTER = 3;

/** Colonne che dicono "è lo stesso elemento" per `adopt` (dopo la traduzione degli id). */
const SAME_ELEMENT: Partial<Record<SyncKind, readonly string[]>> = {
  subject: ["name"],
  session: ["subject_id", "started_at", "ended_at"],
};

/** Colonne UNIQUE: un nome già usato da un altro elemento qui diventa "Nome (2)". */
const UNIQUE_TEXT: Partial<Record<SyncKind, string>> = { subject: "name" };

interface Pending {
  record: SyncRecord;
  attempts: number;
}

const keyOf = (kind: SyncKind | string, id: LocalId | string) => `${kind}\u0000${id}`;

/** Mappe id locale ↔ globale di un giro, aggiornate man mano che si applicano gli elementi. */
class IdMaps {
  private readonly toUid = new Map<string, string>();
  private readonly toLocal = new Map<string, LocalId>();

  constructor(rows: { tbl: string; localId: LocalId; uid: string }[]) {
    for (const r of rows) this.set(r.tbl, r.localId, r.uid);
  }

  set(tbl: string, localId: LocalId, uid: string): void {
    const old = this.toUid.get(keyOf(tbl, localId));
    if (old !== undefined) this.toLocal.delete(keyOf(tbl, old));
    this.toUid.set(keyOf(tbl, localId), uid);
    this.toLocal.set(keyOf(tbl, uid), localId);
  }

  remove(tbl: string, localId: LocalId): void {
    const uid = this.toUid.get(keyOf(tbl, localId));
    if (uid !== undefined) this.toLocal.delete(keyOf(tbl, uid));
    this.toUid.delete(keyOf(tbl, localId));
  }

  uid(tbl: string, localId: LocalId): string | null {
    return this.toUid.get(keyOf(tbl, localId)) ?? null;
  }

  local(tbl: string, uid: string): LocalId | null {
    return this.toLocal.get(keyOf(tbl, uid)) ?? null;
  }
}

export async function syncRound(store: SyncStore, server: SyncServer, opts: RoundOptions): Promise<RoundResult> {
  const kinds = [...opts.kinds].sort((a, b) => kindOrder(a) - kindOrder(b));
  const tables = kinds.map((k) => specOf(k).table);
  const enabled = new Set(kinds);
  const maps = new IdMaps(await store.loadMap(tables));
  const fieldTypes = await store.fieldTypes();
  const changed = new Set<SyncKind>();
  /** righe locali già prese da un elemento del cloud in questo giro (adopt: una sola volta) */
  const claimed = new Set<string>();
  const batch = opts.batch ?? 500;

  const numeric = (id: LocalId | null) => (typeof id === "number" ? id : null);
  const uidOf = (kind: SyncKind, localId: number) => maps.uid(specOf(kind).table, localId);
  const localOf = (kind: SyncKind, uid: string) => numeric(maps.local(specOf(kind).table, uid));
  const fieldTypeOf = (localFieldId: number) => fieldTypes.get(localFieldId) ?? null;

  let outbox = new Map<string, OutboxEntry>();
  const reloadOutbox = async () => {
    outbox = new Map((await store.outbox(tables)).map((e) => [keyOf(e.tbl, e.localId), e]));
  };

  let pending: Pending[] = [];
  try {
    const saved = JSON.parse((await store.getMeta(opts.pendingKey)) ?? "[]") as unknown;
    if (Array.isArray(saved)) pending = saved as Pending[];
  } catch {
    pending = [];
  }
  const pendingIndex = (record: SyncRecord) => pending.findIndex((p) => p.record.kind === record.kind && p.record.uid === record.uid);

  /** Applica un elemento; false se deve aspettare (riferimenti mancanti). */
  async function applyOne(record: SyncRecord, attempts: number): Promise<"done" | "wait" | "drop"> {
    if (!enabled.has(record.kind)) return "done";
    const spec = specOf(record.kind);
    if (record.kind === "setting" && !isSyncedSetting(record.uid)) return "done";
    const local = maps.local(spec.table, record.uid);

    // una modifica locale più nuova non ancora mandata vince (partirà nel push di questo giro)
    if (local !== null) {
      const mine = outbox.get(keyOf(spec.table, local));
      if (mine && isNewer({ changedAt: mine.changedAt + opts.clockOffset, deviceId: opts.deviceId }, record)) return "done";
      // l'eco di una modifica fatta qui: la riga c'è già così
      if (record.deviceId === opts.deviceId && !mine) return "done";
    }

    if (record.deleted || !record.data) {
      if (local === null) return "done";
      await store.remove(spec, local);
      await store.removeUid(spec.table, local);
      await forget(spec.table, local);
      maps.remove(spec.table, local);
      changed.add(record.kind);
      // le righe che puntavano a questa (cancellate a cascata da SQLite) mandano le loro cancellazioni
      for (const child of SYNC_TABLES) if (Object.values(child.refs).some((r) => r.kind === record.kind)) changed.add(child.kind);
      return "done";
    }

    const converted = dataToRow(record.kind, record.data, {
      deviceId: opts.deviceId,
      localOf,
      fieldTypeOf,
      lenient: attempts >= LENIENT_AFTER,
    });
    if (!converted.ok) return attempts >= LENIENT_AFTER ? "drop" : "wait";
    const row = converted.row;

    let target = local;
    if (target === null && opts.adopt) target = await adoptable(spec, row);
    if (target !== null && local === null) {
      // stesso elemento creato anche qui: prende l'id globale del cloud, la versione del cloud vince
      await store.setUid(spec.table, target, record.uid);
      maps.set(spec.table, target, record.uid);
    }
    if (target !== null) claimed.add(keyOf(spec.table, target));

    const id = await writeRow(spec, record, target, row);
    // la scrittura ha acceso il trigger: non è una modifica di questo dispositivo
    await forget(spec.table, id);
    changed.add(record.kind);
    return "done";
  }

  async function adoptable(spec: TableSpec, row: Row): Promise<LocalId | null> {
    const columns = SAME_ELEMENT[spec.kind];
    if (!columns) return null;
    const found = await store.findBy(spec, Object.fromEntries(columns.map((c) => [c, row[c] ?? null])));
    return found !== null && !claimed.has(keyOf(spec.table, found)) ? found : null;
  }

  /**
   * Toglie dal registro la voce di una riga appena scritta dal sync. I trigger restano accesi mentre si applica (il
   * flag `applying` zittirebbe anche ciò che l'utente salva nello stesso momento in altre righe): si cancella
   * la voce subito dopo, riga per riga.
   */
  async function forget(tbl: string, id: LocalId): Promise<void> {
    await store.dropOutbox(tbl, id);
    outbox.delete(keyOf(tbl, id));
  }

  /** Scrive la riga (nuova o esistente) e ne dà l'id; un nome già preso da un altro elemento diventa "Nome (2)". */
  async function writeRow(spec: TableSpec, record: SyncRecord, target: LocalId | null, row: Row): Promise<LocalId> {
    const unique = UNIQUE_TEXT[spec.kind];
    for (let n = 1; ; n++) {
      const attempt = unique && n > 1 ? { ...row, [unique]: `${String(row[unique])} (${n})` } : row;
      try {
        if (target === null) {
          const id = await store.insert(spec, record.uid, attempt);
          await store.setUid(spec.table, id, record.uid);
          maps.set(spec.table, id, record.uid);
          claimed.add(keyOf(spec.table, id));
          return id;
        }
        await store.update(spec, target, attempt);
        return target;
      } catch (error) {
        if (!unique || n >= 50 || !isUniqueViolation(error, spec.table, unique)) throw error;
      }
    }
  }

  /** Applica un blocco nell'ordine giusto (prima chi è puntato, le cancellazioni dai figli). */
  async function applyAll(records: SyncRecord[]): Promise<void> {
    const upserts = records.filter((r) => !r.deleted).sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind));
    const deletes = records.filter((r) => r.deleted).sort((a, b) => kindOrder(b.kind) - kindOrder(a.kind));
    for (const record of [...upserts, ...deletes]) {
      const index = pendingIndex(record);
      const previous = index >= 0 ? pending[index] : null;
      // un elemento in attesa più nuovo di questo resta quello buono
      if (previous && previous.record !== record && isNewer(previous.record, record)) continue;
      const attempts = previous && previous.record === record ? previous.attempts : 0;
      const outcome = await applyOne(record, attempts);
      if (index >= 0) pending.splice(index, 1);
      if (outcome === "wait") pending.push({ record, attempts: attempts + 1 });
      if (outcome === "drop") opts.onSkipped?.(record.kind, "unresolved");
    }
  }

  // ------------------------------------------------------------ pull
  await reloadOutbox();
  let pulled = 0;
  let cursor = Number((await store.getMeta(opts.cursorKey)) ?? 0) || 0;
  // prima quelli in attesa dai giri precedenti (un tentativo in più a ogni giro)
  if (pending.length > 0) {
    const retry = pending.map((p) => p.record);
    await applyAll(retry);
  }
  for (;;) {
    const page = await server.pull(cursor);
    await applyAll(page.records);
    pulled += page.records.length;
    cursor = page.lastSeq;
    await store.setMeta(opts.cursorKey, String(cursor));
    await store.setMeta(opts.pendingKey, pending.length > 0 ? JSON.stringify(pending) : null);
    if (!page.more) break;
  }
  // quelli rimasti in attesa possono avere trovato in questo giro ciò a cui puntano (es. la materia dopo la sessione)
  if (pending.length > 0 && changed.size > 0) {
    await applyAll(pending.map((p) => p.record));
    await store.setMeta(opts.pendingKey, pending.length > 0 ? JSON.stringify(pending) : null);
  }

  // ------------------------------------------------------------ push
  let pushed = 0;
  for (;;) {
    const entries = await store.outbox(tables, batch);
    if (entries.length === 0) break;
    const records: SyncRecord[] = [];
    const sent: OutboxEntry[] = [];
    // righe attuali, per tabella
    const current = new Map<string, Map<LocalId, Row>>();
    for (const table of new Set(entries.map((e) => e.tbl))) {
      const spec = specOfTable(table);
      if (!spec) continue;
      current.set(table, await store.rows(spec, entries.filter((e) => e.tbl === table && !e.deleted).map((e) => e.localId)));
    }
    for (const entry of entries) {
      sent.push(entry);
      const spec = specOfTable(entry.tbl);
      if (!spec || !entry.uid) continue;
      // le impostazioni di questo dispositivo non viaggiano, nemmeno cancellate
      if (spec.kind === "setting" && !isSyncedSetting(entry.uid)) continue;
      const changedAt = Math.max(0, entry.changedAt + opts.clockOffset);
      const row = entry.deleted ? undefined : current.get(entry.tbl)?.get(entry.localId);
      if (!row) {
        records.push({ kind: spec.kind, uid: entry.uid, changedAt, deleted: true, deviceId: opts.deviceId, data: null });
        continue;
      }
      const data = rowToData(spec, row, { deviceId: opts.deviceId, uidOf, fieldTypeOf });
      if (!data) continue; // impostazione di questo dispositivo, o riga orfana
      if (opts.maxRecordBytes && new TextEncoder().encode(JSON.stringify(data)).length > opts.maxRecordBytes) {
        opts.onSkipped?.(spec.kind, "too_large");
        continue;
      }
      records.push({ kind: spec.kind, uid: entry.uid, changedAt, deleted: false, deviceId: opts.deviceId, data });
    }
    const rejected = await server.push(records);
    await store.ackOutbox(sent);
    pushed += records.length;
    if (rejected.length > 0) {
      // il server ha una versione più nuova: si applica qui (salvo modifiche fatte nel frattempo)
      await reloadOutbox();
      await applyAll(rejected);
      await store.setMeta(opts.pendingKey, pending.length > 0 ? JSON.stringify(pending) : null);
    }
    if (entries.length < batch) break;
  }

  return { changed, pulled, pushed };
}
