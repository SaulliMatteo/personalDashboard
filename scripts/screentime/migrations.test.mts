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

console.log(`screentime migrazioni: ${passed} prove passate`);
