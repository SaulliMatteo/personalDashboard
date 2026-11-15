/*
 * Prove delle migrazioni di Tempo al PC su SQLite vero (node:sqlite): si applicano le migrazioni fino a quella prima,
 * si mettono righe di prova e si applica quella da provare. Lancio (dalla cartella del repo):
 *   npx rolldown scripts/screentime/migrations.test.mts --file node_modules/.tmp/st-mig.test.mjs --platform node
 *   node node_modules/.tmp/st-mig.test.mjs
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "../../src/core/db/migrations";

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
function migrate(db: DatabaseSync, from: number, upTo: number) {
  for (const m of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (m.version < from || m.version > upTo) continue;
    for (const statement of m.statements) {
      try {
        db.exec(statement);
      } catch (error) {
        if (!String(error).includes("duplicate column name")) throw error;
      }
    }
  }
}

const all = (db: DatabaseSync, sql: string) => db.prepare(sql).all().map((r) => ({ ...r }));

test("29: le righe di Opera con un sito si uniscono in Opera, sempre navigazione", () => {
  const db = new DatabaseSync(":memory:");
  migrate(db, 0, 28);
  const ins = db.prepare("INSERT INTO screentime_usage (day, hour, app_key, site, app_label, category, seconds, first_at, last_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  ins.run("2026-11-14", 10, "opera", "", "Opera", "browser", 100, 1000, 2000);
  ins.run("2026-11-14", 10, "opera", "YouTube", "Opera", "video", 300, 500, 3000);
  ins.run("2026-11-14", 10, "opera", "GitHub", "Opera", "coding", 50, 800, 900);
  ins.run("2026-11-14", 11, "opera_gx", "YouTube", "Opera GX", "video", 70, 4000, 5000);
  ins.run("2026-11-14", 10, "chrome", "YouTube", "Chrome", "video", 40, 1, 2);
  migrate(db, 29, 29);
  assert.deepEqual(all(db, "SELECT hour, app_key, site, category, seconds, first_at, last_at FROM screentime_usage ORDER BY app_key, hour"), [
    { hour: 10, app_key: "chrome", site: "YouTube", category: "video", seconds: 40, first_at: 1, last_at: 2 },
    { hour: 10, app_key: "opera", site: "", category: "browser", seconds: 450, first_at: 500, last_at: 3000 },
    { hour: 11, app_key: "opera_gx", site: "", category: "browser", seconds: 70, first_at: 4000, last_at: 5000 },
  ]);
});

test("30: tutte le righe con un sito si uniscono nel loro browser; via i limiti per sito", () => {
  const db = new DatabaseSync(":memory:");
  migrate(db, 0, 29);
  const ins = db.prepare("INSERT INTO screentime_usage (day, hour, app_key, site, app_label, category, seconds, first_at, last_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  ins.run("2026-11-14", 10, "chrome", "", "Chrome", "other", 10, 100, 200);
  ins.run("2026-11-14", 10, "chrome", "YouTube", "Chrome", "video", 300, 50, 900);
  ins.run("2026-11-14", 10, "chrome", "GitHub", "Chrome", "coding", 60, 300, 400);
  ins.run("2026-11-14", 12, "firefox", "Reddit", "Firefox", "social", 40, 7, 8);
  ins.run("2026-11-14", 10, "code", "", "VS Code", "coding", 500, 1, 2);
  const lim = db.prepare("INSERT INTO screentime_limits (kind, target, label, minutes, warn, created_at) VALUES (?, ?, ?, 60, 1, 0)");
  lim.run("site", "YouTube", "YouTube");
  lim.run("app", "chrome", "Chrome");
  migrate(db, 30, 30);
  assert.deepEqual(all(db, "SELECT hour, app_key, site, category, seconds, first_at, last_at FROM screentime_usage ORDER BY app_key, hour"), [
    { hour: 10, app_key: "chrome", site: "", category: "browser", seconds: 370, first_at: 50, last_at: 900 },
    { hour: 10, app_key: "code", site: "", category: "coding", seconds: 500, first_at: 1, last_at: 2 },
    { hour: 12, app_key: "firefox", site: "", category: "browser", seconds: 40, first_at: 7, last_at: 8 },
  ]);
  assert.deepEqual(all(db, "SELECT kind, target FROM screentime_limits"), [{ kind: "app", target: "chrome" }]);
});

test("31: le righe passano in screen_usage come computer di qui, con l'id del sync; rieseguita non cambia nulla", () => {
  const db = new DatabaseSync(":memory:");
  migrate(db, 0, 30);
  const ins = db.prepare("INSERT INTO screentime_usage (day, hour, app_key, site, app_label, category, seconds, first_at, last_at) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?)");
  ins.run("2026-11-14", 10, "code", "VS Code", "coding", 500, 1, 2);
  ins.run("2026-11-14", 11, "opera", "Opera", "browser", 300, 3, 4);
  migrate(db, 31, 31);
  const rows = "SELECT origin_device, device_kind, day, hour, app_key, app_label, category, seconds, first_at, last_at FROM screen_usage ORDER BY hour";
  const expected = [
    { origin_device: null, device_kind: "computer", day: "2026-11-14", hour: 10, app_key: "code", app_label: "VS Code", category: "coding", seconds: 500, first_at: 1, last_at: 2 },
    { origin_device: null, device_kind: "computer", day: "2026-11-14", hour: 11, app_key: "opera", app_label: "Opera", category: "browser", seconds: 300, first_at: 3, last_at: 4 },
  ];
  assert.deepEqual(all(db, rows), expected);
  assert.deepEqual(all(db, "SELECT name FROM sqlite_master WHERE name = 'screentime_usage'"), [], "la tabella vecchia non c'è più");
  assert.equal(all(db, "SELECT uid FROM sync_map WHERE tbl = 'screen_usage'").length, 2, "id globali per il sync");
  assert.equal(all(db, "SELECT * FROM sync_outbox").length, 0, "nel registro ci vanno quando il tipo si accende (syncSetup.ts)");
  migrate(db, 31, 31);
  assert.deepEqual(all(db, rows), expected);
});

console.log(`screentime migrazioni: ${passed} prove passate`);
