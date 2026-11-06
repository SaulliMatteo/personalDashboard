/*
 * Prove del tracciamento locale del sync (migrazione 23 di core/db/migrations.ts) su un SQLite vero (node:sqlite):
 * tutte le migrazioni da zero come le esegue l'app, poi i trigger e la coerenza con core/sync/tables.ts.
 * Lancio (da questa cartella del repo):
 *   npx rolldown scripts/sync/schema.test.mts --file node_modules/.tmp/sync-schema.test.mjs --platform node
 *   node node_modules/.tmp/sync-schema.test.mjs
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "../../src/core/db/migrations";
import { SYNC_TABLES } from "../../src/core/sync/tables";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error(`FALLITO: ${name}`);
    throw error;
  }
}

/** Come runMigrations di core/db/index.ts: in ordine, "duplicate column" ignorato. */
function migrate(db: DatabaseSync, upTo = Infinity) {
  const current = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  for (const m of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (m.version <= current || m.version > upTo) continue;
    for (const statement of m.statements) {
      try {
        db.exec(statement);
      } catch (error) {
        if (!String(error).includes("duplicate column name")) throw error;
      }
    }
    db.exec(`PRAGMA user_version = ${m.version}`);
  }
}

// node:sqlite dà oggetti senza prototipo: copiati, così deepStrictEqual li confronta con oggetti normali
const all = <T,>(db: DatabaseSync, sql: string, ...params: (string | number | null)[]) => db.prepare(sql).all(...params).map((r) => ({ ...r })) as T[];
const one = <T,>(db: DatabaseSync, sql: string, ...params: (string | number | null)[]) => db.prepare(sql).get(...params) as T;
const count = (db: DatabaseSync, sql: string, ...params: (string | number | null)[]) => Number(Object.values(one<Record<string, number>>(db, sql, ...params))[0]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const SUBJECT = `INSERT INTO subjects (name, created_at, mode, work_minutes, short_break_minutes, long_break_minutes, cycles_before_long_break)
                 VALUES (?, 1, 'pomodoro', 25, 5, 15, 4)`;
const SETTING = `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`;

/** Un DB fermo alla 22 con qualche riga, poi portato all'ultima versione. */
function upgradedDb() {
  const db = new DatabaseSync(":memory:");
  migrate(db, 22);
  db.prepare(SUBJECT).run("Esistente");
  db.prepare(SETTING).run("userName", '"Matteo"');
  migrate(db);
  return db;
}

test("tutte le migrazioni da zero, e rieseguite non cambiano nulla", () => {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  const last = Math.max(...MIGRATIONS.map((m) => m.version));
  assert.equal(count(db, "PRAGMA user_version"), last);
  db.exec("PRAGMA user_version = 22");
  migrate(db);
  assert.equal(count(db, "PRAGMA user_version"), last);
  assert.equal(one<{ integrity_check: string }>(db, "PRAGMA integrity_check").integrity_check, "ok");
});

test("tables.ts e la migrazione 23 hanno le stesse colonne, e le colonne esistono", () => {
  const db = upgradedDb();
  for (const spec of SYNC_TABLES) {
    const existing = all<{ name: string }>(db, `PRAGMA table_info(${spec.table})`).map((c) => c.name);
    for (const column of [spec.key, ...spec.columns]) assert.ok(existing.includes(column), `${spec.table}.${column}`);
    const trigger = one<{ sql: string } | undefined>(db, "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?", `sync_${spec.table}_upd`);
    assert.ok(trigger, `trigger di ${spec.table}`);
    const watched = /UPDATE OF ([^]*?) ON /.exec(trigger.sql)?.[1].split(",").map((c) => c.trim());
    // origin_device lo scrive solo il sync (con i trigger zitti): non è tra quelle osservate
    assert.deepEqual(watched, spec.columns.filter((c) => c !== "origin_device"), spec.table);
  }
});

test("le righe che c'erano già ricevono un id globale; il registro parte vuoto", () => {
  const db = upgradedDb();
  const uid = one<{ uid: string }>(db, "SELECT uid FROM sync_map WHERE tbl = 'subjects'").uid;
  assert.match(uid, UUID);
  assert.equal(one<{ uid: string }>(db, "SELECT uid FROM sync_map WHERE tbl = 'settings' AND local_id = 'userName'").uid, "userName");
  assert.equal(count(db, "SELECT count(*) FROM sync_outbox"), 0);
});

test("insert: id globale nuovo e riga nel registro con l'ora giusta", () => {
  const db = upgradedDb();
  const before = Date.now();
  db.prepare(SUBJECT).run("Nuova");
  const row = one<{ tbl: string; changed_at: number; deleted: number }>(db, "SELECT tbl, changed_at, deleted FROM sync_outbox");
  assert.equal(row.tbl, "subjects");
  assert.equal(row.deleted, 0);
  assert.ok(Math.abs(row.changed_at - before) < 2000, "millisecondi come Date.now()");
  const uids = all<{ uid: string }>(db, "SELECT uid FROM sync_map WHERE tbl = 'subjects'").map((r) => r.uid);
  assert.equal(new Set(uids).size, 2);
  assert.ok(uids.every((u) => UUID.test(u)));
});

test("update: solo se cambia una colonna sincronizzata; più modifiche = una riga", () => {
  const db = upgradedDb();
  const id = Number(db.prepare("INSERT INTO notes (folder_id, title, tags, starred, created_at, updated_at) VALUES (NULL, 'n', '[]', 0, 1, 1)").run().lastInsertRowid);
  db.exec("DELETE FROM sync_outbox");
  db.prepare("UPDATE notes SET synced_at = 5, disk_path = 'x' WHERE id = ?").run(id);
  assert.equal(count(db, "SELECT count(*) FROM sync_outbox"), 0, "copia su disco: non conta");
  db.prepare("UPDATE notes SET title = 'n' WHERE id = ?").run(id);
  assert.equal(count(db, "SELECT count(*) FROM sync_outbox"), 0, "stesso valore: non conta");
  db.prepare("UPDATE notes SET title = 'm' WHERE id = ?").run(id);
  db.prepare("UPDATE notes SET title = 'z' WHERE id = ?").run(id);
  assert.deepEqual(all(db, "SELECT tbl, local_id, deleted FROM sync_outbox"), [{ tbl: "notes", local_id: id, deleted: 0 }]);
});

test("delete: segnata come cancellata, l'id globale resta per mandarla", () => {
  const db = upgradedDb();
  const id = Number(db.prepare("INSERT INTO notes (folder_id, title, tags, starred, created_at, updated_at) VALUES (NULL, 'n', '[]', 0, 1, 1)").run().lastInsertRowid);
  db.prepare("DELETE FROM notes WHERE id = ?").run(id);
  assert.deepEqual(all(db, "SELECT tbl, local_id, deleted FROM sync_outbox"), [{ tbl: "notes", local_id: id, deleted: 1 }]);
  assert.equal(count(db, "SELECT count(*) FROM sync_map WHERE tbl = 'notes' AND local_id = ?", id), 1);
});

test("impostazioni salvate con UPSERT (come settingsRepository): una riga, id = chiave", () => {
  const db = upgradedDb();
  db.prepare(SETTING).run("theme", '"opaco"');
  db.prepare(SETTING).run("theme", '"notte"');
  db.prepare(SETTING).run("userName", '"Mat"');
  assert.deepEqual(all(db, "SELECT tbl, local_id, deleted FROM sync_outbox ORDER BY local_id"), [
    { tbl: "settings", local_id: "theme", deleted: 0 },
    { tbl: "settings", local_id: "userName", deleted: 0 },
  ]);
  assert.equal(one<{ uid: string }>(db, "SELECT uid FROM sync_map WHERE tbl = 'settings' AND local_id = 'theme'").uid, "theme");
});

test("mentre si applica il cloud (applying = 1) i trigger tacciono", () => {
  const db = upgradedDb();
  db.exec("UPDATE sync_state SET value = 1 WHERE key = 'applying'");
  db.prepare(SUBJECT).run("Dal cloud");
  db.prepare(SETTING).run("theme", '"opaco"');
  db.exec("UPDATE subjects SET name = 'Rinominata' WHERE name = 'Esistente'");
  db.exec("DELETE FROM settings WHERE key = 'userName'");
  assert.equal(count(db, "SELECT count(*) FROM sync_outbox"), 0);
  assert.equal(count(db, "SELECT count(*) FROM sync_map WHERE tbl = 'subjects'"), 1, "l'id globale lo scrive il sync, non il trigger");
  db.exec("UPDATE sync_state SET value = 0 WHERE key = 'applying'");
  db.exec("UPDATE subjects SET name = 'Di nuovo' WHERE name = 'Rinominata'");
  assert.equal(count(db, "SELECT count(*) FROM sync_outbox"), 1);
});

test("le sessioni hanno origin_device, NULL di default (= fatte qui)", () => {
  const db = upgradedDb();
  db.prepare("INSERT INTO study_sessions (subject_id, started_at, ended_at, duration_seconds) VALUES (1, 1, 2, 1)").run();
  assert.equal(one<{ origin_device: string | null }>(db, "SELECT origin_device FROM study_sessions").origin_device, null);
});

test("le tabelle non sincronizzate non finiscono nel registro", () => {
  const db = upgradedDb();
  db.exec("INSERT INTO meta (key, value) VALUES ('x', 'y')");
  db.exec("INSERT INTO dashboard_layout (widget_id, x, y, w, h) VALUES ('clock', 0, 0, 1, 1)");
  db.exec("UPDATE timer_state SET subject_id = subject_id");
  assert.equal(count(db, "SELECT count(*) FROM sync_outbox"), 0);
});

console.log(`OK: ${passed} prove superate`);
