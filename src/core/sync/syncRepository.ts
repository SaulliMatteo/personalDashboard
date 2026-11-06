import { getDatabase } from "../db";
import { specOfTable, type TableSpec } from "./tables";
import type { Row } from "./engine/records";

/*
 * Tutto l'SQL del sync tra dispositivi (tabelle della migrazione 23 e righe delle tabelle sincronizzate).
 * Lavora su un `SqlDb` qualunque: nell'app il DB di plugin-sql, nelle prove (scripts/sync/round.test.mts) un SQLite
 * di node:sqlite. Le scritture delle modifiche arrivate dal cloud stanno dentro `whileApplying`, che zittisce i
 * trigger: non devono tornare indietro come modifiche di questo dispositivo.
 */

/** Il sottoinsieme di plugin-sql che serve qui. */
export interface SqlDb {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
}

/** Id locale: numero, o la chiave per le impostazioni. */
export type LocalId = number | string;

/** Una riga di sync_outbox: cambiata qui e non ancora mandata. `uid` null se manca in sync_map. */
export interface OutboxEntry {
  tbl: string;
  localId: LocalId;
  changedAt: number;
  deleted: boolean;
  uid: string | null;
}

/** Errore di SQLite su un vincolo UNIQUE (es. due materie con lo stesso nome). */
export function isUniqueViolation(error: unknown, table: string, column: string): boolean {
  return String(error).includes(`UNIQUE constraint failed: ${table}.${column}`);
}

/** uuid v4 calcolato da SQLite (come nella migrazione 23). */
const SQL_UUID =
  "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || " +
  "substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))";

const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(", ");
const quote = (column: string) => `"${column}"`;

export class SyncRepository {
  private readonly db: SqlDb;

  constructor(db: SqlDb) {
    this.db = db;
  }

  /** Il repository sul DB dell'app. */
  static async open(): Promise<SyncRepository> {
    return new SyncRepository(await getDatabase());
  }

  // ------------------------------------------------------------ id globali

  /** sync_map delle tabelle indicate: tbl → (id locale → uid). */
  async loadMap(tables: readonly string[]): Promise<{ tbl: string; localId: LocalId; uid: string }[]> {
    if (tables.length === 0) return [];
    return this.db.select<{ tbl: string; localId: LocalId; uid: string }[]>(
      `SELECT tbl, local_id AS localId, uid FROM sync_map WHERE tbl IN (${placeholders(tables.length)})`,
      [...tables]
    );
  }

  /** Assegna (o cambia) l'id globale di una riga locale. */
  async setUid(tbl: string, localId: LocalId, uid: string): Promise<void> {
    await this.db.execute(
      `INSERT INTO sync_map (tbl, local_id, uid) VALUES (?, ?, ?) ON CONFLICT (tbl, local_id) DO UPDATE SET uid = excluded.uid`,
      [tbl, localId, uid]
    );
  }

  async removeUid(tbl: string, localId: LocalId): Promise<void> {
    await this.db.execute(`DELETE FROM sync_map WHERE tbl = ? AND local_id = ?`, [tbl, localId]);
  }

  /** Tipo dei campi delle Raccolte (per i campi "nota" dentro i dati delle righe). */
  async fieldTypes(): Promise<Map<number, string>> {
    const rows = await this.db.select<{ id: number; type: string }[]>(`SELECT id, type FROM note_collection_fields`);
    return new Map(rows.map((r) => [r.id, r.type]));
  }

  // ------------------------------------------------------------ registro delle modifiche

  async outbox(tables: readonly string[], limit = -1): Promise<OutboxEntry[]> {
    if (tables.length === 0) return [];
    const rows = await this.db.select<{ tbl: string; localId: LocalId; changedAt: number; deleted: number; uid: string | null }[]>(
      `SELECT o.tbl, o.local_id AS localId, o.changed_at AS changedAt, o.deleted, m.uid
       FROM sync_outbox o LEFT JOIN sync_map m ON m.tbl = o.tbl AND m.local_id = o.local_id
       WHERE o.tbl IN (${placeholders(tables.length)})
       ORDER BY o.changed_at, o.tbl, o.local_id LIMIT ?`,
      [...tables, limit]
    );
    return rows.map((r) => ({ ...r, deleted: Boolean(r.deleted) }));
  }

  /** Quante modifiche aspettano e l'ultima (per accorgersi che ne è arrivata una nuova). */
  async outboxSummary(tables: readonly string[]): Promise<{ count: number; last: number }> {
    if (tables.length === 0) return { count: 0, last: 0 };
    const rows = await this.db.select<{ count: number; last: number | null }[]>(
      `SELECT count(*) AS count, max(changed_at) AS last FROM sync_outbox WHERE tbl IN (${placeholders(tables.length)})`,
      [...tables]
    );
    return { count: Number(rows[0]?.count ?? 0), last: Number(rows[0]?.last ?? 0) };
  }

  /**
   * Toglie dal registro le voci mandate, solo se non sono cambiate nel frattempo (stesso changed_at): una modifica
   * fatta durante l'invio resta e parte al giro dopo. Per le righe cancellate si toglie anche l'id globale.
   */
  async ackOutbox(entries: readonly OutboxEntry[]): Promise<void> {
    for (let i = 0; i < entries.length; i += 200) {
      const chunk = entries.slice(i, i + 200);
      await this.db.execute(
        `DELETE FROM sync_outbox WHERE (tbl, local_id, changed_at) IN (VALUES ${chunk.map(() => "(?, ?, ?)").join(", ")})`,
        chunk.flatMap((e) => [e.tbl, e.localId, e.changedAt])
      );
      const gone = chunk.filter((e) => e.deleted);
      if (gone.length > 0) {
        await this.db.execute(
          `DELETE FROM sync_map WHERE (tbl, local_id) IN (VALUES ${gone.map(() => "(?, ?)").join(", ")})
             AND NOT EXISTS (SELECT 1 FROM sync_outbox o WHERE o.tbl = sync_map.tbl AND o.local_id = sync_map.local_id)`,
          gone.flatMap((e) => [e.tbl, e.localId])
        );
      }
    }
  }

  /** Svuota il registro delle tabelle indicate (le modifiche di prima non si mandano più). */
  async clearOutbox(tables: readonly string[]): Promise<void> {
    if (tables.length === 0) return;
    await this.db.execute(`DELETE FROM sync_outbox WHERE tbl IN (${placeholders(tables.length)})`, [...tables]);
  }

  async dropOutbox(tbl: string, localId: LocalId): Promise<void> {
    await this.db.execute(`DELETE FROM sync_outbox WHERE tbl = ? AND local_id = ?`, [tbl, localId]);
  }

  /**
   * Mette nel registro tutte le righe che ci sono, con `changedAt` (le voci che c'erano prendono lo stesso valore):
   * serve quando una tabella comincia a sincronizzarsi. Le cancellazioni di prima non interessano al cloud.
   */
  async enqueueAll(tables: readonly string[], changedAt: number): Promise<void> {
    for (const table of tables) {
      const spec = specOfTable(table);
      if (!spec) continue;
      await this.db.execute(`DELETE FROM sync_outbox WHERE tbl = ? AND deleted = 1`, [table]);
      await this.db.execute(
        `DELETE FROM sync_map WHERE tbl = ? AND local_id NOT IN (SELECT ${spec.key} FROM ${table})`,
        [table]
      );
      await this.db.execute(
        `INSERT INTO sync_map (tbl, local_id, uid)
         SELECT ?, ${spec.key}, ${spec.key === "key" ? spec.key : SQL_UUID} FROM ${table} WHERE true
         ON CONFLICT (tbl, local_id) DO NOTHING`,
        [table]
      );
      await this.db.execute(
        `INSERT INTO sync_outbox (tbl, local_id, changed_at, deleted) SELECT ?, ${spec.key}, ?, 0 FROM ${table} WHERE true
         ON CONFLICT (tbl, local_id) DO UPDATE SET changed_at = excluded.changed_at, deleted = 0`,
        [table, changedAt]
      );
    }
  }

  // ------------------------------------------------------------ righe delle tabelle sincronizzate

  /** Le righe con questi id (chiave + colonne sincronizzate), per id. */
  async rows(spec: TableSpec, ids: readonly LocalId[]): Promise<Map<LocalId, Row>> {
    const out = new Map<LocalId, Row>();
    const columns = [spec.key, ...spec.columns].map(quote).join(", ");
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const rows = await this.db.select<Row[]>(
        `SELECT ${columns} FROM ${spec.table} WHERE ${spec.key} IN (${placeholders(chunk.length)})`,
        [...chunk]
      );
      for (const row of rows) out.set(row[spec.key] as LocalId, { ...row });
    }
    return out;
  }

  /** Chiave e colonne locali (`localColumns`) delle righe indicate, o di tutte se `ids` manca. */
  async localRows(spec: TableSpec, ids?: readonly LocalId[]): Promise<Row[]> {
    const columns = [spec.key, ...(spec.localColumns ?? [])].map(quote).join(", ");
    if (!ids) return (await this.db.select<Row[]>(`SELECT ${columns} FROM ${spec.table}`)).map((r) => ({ ...r }));
    if (ids.length === 0) return [];
    const rows = await this.db.select<Row[]>(
      `SELECT ${columns} FROM ${spec.table} WHERE ${spec.key} IN (${placeholders(ids.length)})`,
      [...ids]
    );
    return rows.map((r) => ({ ...r }));
  }

  /** Una riga che ha questi valori (per riconoscere lo stesso elemento creato su due dispositivi), o null. */
  async findBy(spec: TableSpec, values: Row): Promise<LocalId | null> {
    const columns = Object.keys(values);
    const rows = await this.db.select<{ id: LocalId }[]>(
      `SELECT ${spec.key} AS id FROM ${spec.table} WHERE ${columns.map((c) => `${quote(c)} IS ?`).join(" AND ")} LIMIT 1`,
      columns.map((c) => values[c])
    );
    return rows[0]?.id ?? null;
  }

  /** Nuova riga dai dati arrivati; restituisce il suo id locale. */
  async insert(spec: TableSpec, uid: string, row: Row): Promise<LocalId> {
    const columns = Object.keys(row);
    if (spec.key === "key") {
      await this.db.execute(
        `INSERT INTO ${spec.table} (key, ${columns.map(quote).join(", ")}) VALUES (?, ${placeholders(columns.length)})
         ON CONFLICT (key) DO UPDATE SET ${columns.map((c) => `${quote(c)} = excluded.${quote(c)}`).join(", ")}`,
        [uid, ...columns.map((c) => row[c])]
      );
      return uid;
    }
    const result = await this.db.execute(
      `INSERT INTO ${spec.table} (${columns.map(quote).join(", ")}) VALUES (${placeholders(columns.length)})`,
      columns.map((c) => row[c])
    );
    if (typeof result.lastInsertId !== "number") throw new Error(`Sync: id della nuova riga di ${spec.table} mancante`);
    return result.lastInsertId;
  }

  async update(spec: TableSpec, localId: LocalId, row: Row): Promise<void> {
    const columns = Object.keys(row);
    await this.db.execute(
      `UPDATE ${spec.table} SET ${columns.map((c) => `${quote(c)} = ?`).join(", ")} WHERE ${spec.key} = ?`,
      [...columns.map((c) => row[c]), localId]
    );
  }

  async remove(spec: TableSpec, localId: LocalId): Promise<void> {
    await this.db.execute(`DELETE FROM ${spec.table} WHERE ${spec.key} = ?`, [localId]);
  }

  /** Cancella tutte le righe delle tabelle (figlie prima) con id globali e registro: "usa i dati del cloud". */
  async wipe(tables: readonly string[]): Promise<void> {
    for (const table of [...tables].reverse()) {
      if (!specOfTable(table)) continue;
      await this.db.execute(`DELETE FROM ${table}`);
      await this.db.execute(`DELETE FROM sync_map WHERE tbl = ?`, [table]);
      await this.db.execute(`DELETE FROM sync_outbox WHERE tbl = ?`, [table]);
    }
  }

  /** Esegue `fn` con i trigger zitti; li riaccende sempre, anche se `fn` fallisce. */
  async whileApplying<T>(fn: () => Promise<T>): Promise<T> {
    await this.db.execute(`UPDATE sync_state SET value = 1 WHERE key = 'applying'`);
    try {
      return await fn();
    } finally {
      await this.db.execute(`UPDATE sync_state SET value = 0 WHERE key = 'applying'`);
    }
  }

  // ------------------------------------------------------------ stato del sync (tabella meta)

  async getMeta(key: string): Promise<string | null> {
    const rows = await this.db.select<{ value: string }[]>(`SELECT value FROM meta WHERE key = ?`, [key]);
    return rows[0]?.value ?? null;
  }

  async setMeta(key: string, value: string | null): Promise<void> {
    if (value === null) {
      await this.db.execute(`DELETE FROM meta WHERE key = ?`, [key]);
      return;
    }
    await this.db.execute(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [
      key,
      value,
    ]);
  }
}

