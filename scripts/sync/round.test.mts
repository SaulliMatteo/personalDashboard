/*
 * Prove di un giro di sync (src/core/sync/engine/round.ts) da capo a fondo: due dispositivi con un SQLite vero
 * ciascuno (node:sqlite, tutte le migrazioni) e un server finto che si comporta come sync_push / la lettura per seq
 * di supabase/migrations/…_sync.sql. Lancio (da questa cartella del repo):
 *   npx rolldown scripts/sync/round.test.mts --file node_modules/.tmp/sync-round.test.mjs --platform node
 *   node node_modules/.tmp/sync-round.test.mjs
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "../../src/core/db/migrations";
import { SyncRepository, type SqlDb } from "../../src/core/sync/syncRepository";
import { syncRound, type ServerRecord, type SyncServer } from "../../src/core/sync/engine/round";
import { isNewer, type SyncRecord } from "../../src/core/sync/engine/records";
import type { SyncKind } from "../../src/core/sync/tables";

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (error) {
    console.error(`FALLITO: ${name}`);
    throw error;
  }
}

function migrate(db: DatabaseSync) {
  for (const m of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
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

/** node:sqlite con l'interfaccia di plugin-sql. */
function adapter(db: DatabaseSync): SqlDb {
  return {
    async select<T>(query: string, params: unknown[] = []) {
      return db.prepare(query).all(...(params as (string | number | null)[])).map((r) => ({ ...r })) as T;
    },
    async execute(query: string, params: unknown[] = []) {
      const result = db.prepare(query).run(...(params as (string | number | null)[]));
      return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) };
    },
  };
}

/** Come sync_push e la select per seq del server (ultima modifica vince, a parità il device_id più alto). */
class FakeServer {
  rows = new Map<string, ServerRecord>();
  seq = 0;
  pageSize = 500;
  pushes = 0;

  forDevice(deviceId: string): SyncServer {
    return {
      push: async (records) => {
        this.pushes++;
        const rejected: SyncRecord[] = [];
        for (const r of records) {
          assert.equal(r.deviceId, deviceId);
          const key = `${r.kind}:${r.uid}`;
          const cur = this.rows.get(key);
          if (!cur || isNewer(r, cur)) {
            this.rows.set(key, { ...structuredClone(r), data: r.deleted ? null : structuredClone(r.data), seq: ++this.seq });
          } else if (!(cur.changedAt === r.changedAt && cur.deviceId === r.deviceId)) {
            rejected.push(structuredClone(cur));
          }
        }
        return rejected;
      },
      pull: async (afterSeq) => {
        const all = [...this.rows.values()].filter((r) => r.seq > afterSeq).sort((a, b) => a.seq - b.seq);
        const records = all.slice(0, this.pageSize).map((r) => structuredClone(r));
        return { records, lastSeq: records.length ? records[records.length - 1].seq : afterSeq, more: all.length > this.pageSize };
      },
    };
  }

  get(kind: SyncKind, uid: string) {
    return this.rows.get(`${kind}:${uid}`);
  }

  ofKind(kind: SyncKind) {
    return [...this.rows.values()].filter((r) => r.kind === kind);
  }
}

const KINDS: SyncKind[] = ["subject", "session", "setting"];
const TABLES = ["subjects", "study_sessions", "settings"];

class Device {
  db = new DatabaseSync(":memory:");
  repo: SyncRepository;
  clockOffset = 0;

  constructor(
    public readonly id: string,
    private readonly server: FakeServer
  ) {
    migrate(this.db);
    this.repo = new SyncRepository(adapter(this.db));
  }

  sql(query: string, ...params: (string | number | null)[]) {
    return this.db.prepare(query).run(...params);
  }

  all<T>(query: string, ...params: (string | number | null)[]) {
    return this.db.prepare(query).all(...params).map((r) => ({ ...r })) as T[];
  }

  subject(name: string): number {
    return Number(
      this.sql(
        `INSERT INTO subjects (name, created_at, mode, work_minutes, short_break_minutes, long_break_minutes, cycles_before_long_break)
         VALUES (?, 1, 'pomodoro', 25, 5, 15, 4)`,
        name
      ).lastInsertRowid
    );
  }

  session(subjectId: number, startedAt: number, seconds = 60): number {
    return Number(
      this.sql(`INSERT INTO study_sessions (subject_id, started_at, ended_at, duration_seconds) VALUES (?, ?, ?, ?)`, subjectId, startedAt, startedAt + seconds * 1000, seconds)
        .lastInsertRowid
    );
  }

  setting(key: string, value: unknown) {
    this.sql(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, JSON.stringify(value));
  }

  settingValue(key: string): unknown {
    const row = this.all<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, key)[0];
    return row ? JSON.parse(row.value) : undefined;
  }

  subjects(): string[] {
    return this.all<{ name: string }>(`SELECT name FROM subjects ORDER BY name`).map((r) => r.name);
  }

  sessions() {
    return this.all<{ subject: string; started_at: number; origin_device: string | null }>(
      `SELECT s.name AS subject, x.started_at, x.origin_device FROM study_sessions x JOIN subjects s ON s.id = x.subject_id ORDER BY x.started_at`
    );
  }

  /** Accende il sync: le righe che ci sono entrano nel registro (1 = primo dispositivo, 0 = "Unisci"). */
  async enable(changedAt: 0 | 1) {
    await this.repo.enqueueAll(TABLES, changedAt);
  }

  round(adopt = false, kinds = KINDS) {
    return syncRound(this.repo, this.server.forDevice(this.id), {
      deviceId: this.id,
      clockOffset: this.clockOffset,
      kinds,
      adopt,
      cursorKey: "sync_cursor:u",
      pendingKey: "sync_pending:u",
      maxRecordBytes: 2_000_000,
    });
  }

  outboxCount() {
    return this.all<{ n: number }>(`SELECT count(*) AS n FROM sync_outbox`)[0].n;
  }
}

const PC = "aaaaaaaa-0000-4000-8000-000000000001";
const PHONE = "bbbbbbbb-0000-4000-8000-000000000002";

function pair() {
  const server = new FakeServer();
  return { server, pc: new Device(PC, server), phone: new Device(PHONE, server) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

await test("primo dispositivo: tutto nel cloud; il secondo riceve materie, sessioni e impostazioni", async () => {
  const { server, pc, phone } = pair();
  const analisi = pc.subject("Analisi");
  pc.session(analisi, 1_000);
  pc.setting("userName", "Matteo");
  pc.setting("themeMode", "notte"); // di questo dispositivo: non viaggia
  await pc.enable(1);
  const first = await pc.round();
  assert.equal(first.pushed, 3);
  assert.equal(pc.outboxCount(), 0);
  assert.equal(server.ofKind("setting").length, 1);
  assert.equal(server.ofKind("session")[0].data?.origin_device, PC);

  await phone.enable(0);
  const second = await phone.round(true);
  assert.deepEqual([...second.changed].sort(), ["session", "setting", "subject"]);
  assert.deepEqual(phone.subjects(), ["Analisi"]);
  assert.deepEqual(phone.sessions(), [{ subject: "Analisi", started_at: 1_000, origin_device: PC }]);
  assert.equal(phone.settingValue("userName"), "Matteo");
  assert.equal(phone.settingValue("themeMode"), undefined);
  assert.equal(phone.outboxCount(), 0, "ciò che arriva dal cloud non torna indietro");
  assert.equal((await phone.round()).pushed, 0);
});

await test("le sessioni fatte qui tornano con origin_device NULL (totali dei Gruppi)", async () => {
  const { pc, phone } = pair();
  const s = pc.subject("Fisica");
  pc.session(s, 5_000);
  await pc.enable(1);
  await pc.round();
  await phone.enable(0);
  await phone.round(true);
  // il telefono cambia la durata: la sessione resta del PC
  phone.sql(`UPDATE study_sessions SET duration_seconds = 120`);
  await phone.round();
  pc.db.exec(`DELETE FROM meta`); // il PC rilegge tutto da capo
  await pc.round();
  assert.deepEqual(
    pc.all(`SELECT duration_seconds, origin_device FROM study_sessions`),
    [{ duration_seconds: 120, origin_device: null }]
  );
});

await test("modifica, cancellazione a cascata e ultima modifica che vince", async () => {
  const { pc, phone } = pair();
  const s = pc.subject("Chimica");
  pc.session(s, 1);
  pc.session(s, 2);
  await pc.enable(1);
  await pc.round();
  await phone.enable(0);
  await phone.round(true);

  phone.sql(`UPDATE subjects SET name = 'Chimica organica'`);
  await phone.round();
  await pc.round();
  assert.deepEqual(pc.subjects(), ["Chimica organica"]);

  // conflitto: tutti e due cambiano il nome; vince l'ultimo
  pc.setting("userName", "dal PC");
  await sleep(5);
  phone.setting("userName", "dal telefono");
  await pc.round();
  await phone.round();
  await pc.round();
  assert.equal(pc.settingValue("userName"), "dal telefono");
  assert.equal(phone.settingValue("userName"), "dal telefono");

  pc.sql(`DELETE FROM subjects`);
  assert.equal(pc.all(`SELECT * FROM study_sessions`).length, 0, "SQLite cancella a cascata");
  await pc.round();
  const result = await phone.round();
  assert.ok(result.changed.has("subject") && result.changed.has("session"));
  assert.deepEqual(phone.subjects(), []);
  assert.equal(phone.all(`SELECT * FROM study_sessions`).length, 0);
  assert.equal(pc.all(`SELECT * FROM sync_map WHERE tbl IN ('subjects', 'study_sessions')`).length, 0, "id globali dei cancellati tolti");
});

await test("una modifica locale più nuova non mandata vince su quella arrivata", async () => {
  const { pc, phone } = pair();
  pc.setting("userName", "A");
  await pc.enable(1);
  await pc.round();
  await phone.enable(0);
  await phone.round(true);
  pc.setting("userName", "vecchio");
  await pc.round();
  await sleep(5);
  phone.setting("userName", "nuovo"); // non ancora mandato
  await phone.round();
  assert.equal(phone.settingValue("userName"), "nuovo");
  await pc.round();
  assert.equal(pc.settingValue("userName"), "nuovo");
});

await test("Unisci con una copia dello stesso DB: niente doppioni, le sessioni prendono l'origine del PC", async () => {
  const { server, pc, phone } = pair();
  for (const d of [pc, phone]) {
    const s = d.subject("Analisi");
    d.session(s, 100);
    d.session(s, 200);
    d.subject(d === pc ? "Solo PC" : "Solo telefono");
  }
  phone.session(1, 300); // fatta sul telefono dopo la copia
  await pc.enable(1);
  await pc.round();
  await phone.enable(0);
  await phone.round(true);
  await pc.round();
  for (const d of [pc, phone]) assert.deepEqual(d.subjects(), ["Analisi", "Solo PC", "Solo telefono"]);
  assert.deepEqual(
    phone.sessions().map((s) => [s.started_at, s.origin_device]),
    [[100, PC], [200, PC], [300, null]]
  );
  assert.deepEqual(
    pc.sessions().map((s) => [s.started_at, s.origin_device]),
    [[100, null], [200, null], [300, PHONE]]
  );
  assert.equal(server.ofKind("subject").length, 3);
  assert.equal(server.ofKind("session").length, 3);
});

await test("senza Unisci, un nome già usato qui diventa 'Nome (2)'", async () => {
  const { pc, phone } = pair();
  pc.subject("Storia");
  await pc.enable(1);
  await pc.round();
  phone.subject("Storia");
  await phone.enable(1);
  await phone.round(); // niente adopt: due materie diverse
  assert.deepEqual(phone.subjects(), ["Storia", "Storia (2)"]);
});

await test("un elemento che arriva prima di quello a cui punta aspetta e si applica dopo", async () => {
  const { server, pc, phone } = pair();
  const s = pc.subject("Latino");
  pc.session(s, 10);
  await pc.enable(1);
  await pc.round();
  // il server rimanda la sessione prima della materia
  const subject = server.ofKind("subject")[0];
  subject.seq = ++server.seq;
  server.pageSize = 1;
  await phone.enable(0);
  await phone.round(true);
  assert.deepEqual(phone.sessions(), [{ subject: "Latino", started_at: 10, origin_device: PC }]);
  assert.equal(phone.all(`SELECT * FROM meta WHERE key = 'sync_pending:u'`).length, 0);
});

await test("un riferimento che non arriva mai: dopo qualche giro l'elemento si scarta", async () => {
  const { server, phone } = pair();
  server.rows.set("session:x", {
    kind: "session", uid: "x", changedAt: 1, deleted: false, deviceId: PC, seq: ++server.seq,
    data: { subject_id: "manca", started_at: 1, ended_at: 2, duration_seconds: 1, origin_device: PC },
  });
  await phone.enable(0);
  for (let i = 0; i < 4; i++) await phone.round();
  assert.equal(phone.all(`SELECT * FROM study_sessions`).length, 0);
  assert.equal(phone.all(`SELECT * FROM meta WHERE key = 'sync_pending:u'`).length, 0);
});

await test("rifiutato dal server (orologio indietro): si prende la versione del server", async () => {
  const { pc, phone } = pair();
  pc.setting("userName", "server");
  await pc.enable(1);
  await pc.round();
  await phone.enable(0);
  await phone.round(true);
  phone.clockOffset = -60_000; // il telefono pensa di essere un minuto indietro
  pc.setting("userName", "PC più nuovo");
  await pc.round();
  phone.setting("userName", "telefono");
  // il pull non lo vede (come se il PC avesse scritto mentre il telefono era già al push): lo rifiuta il server
  phone.sql(`UPDATE meta SET value = '999' WHERE key = 'sync_cursor:u'`);
  await phone.round();
  assert.equal(phone.settingValue("userName"), "PC più nuovo");
  assert.equal(phone.outboxCount(), 0);
});

await test("tipi non accesi: le loro modifiche restano nel registro", async () => {
  const { server, pc } = pair();
  pc.sql(`INSERT INTO notes (folder_id, title, tags, starred, created_at, updated_at) VALUES (NULL, 'n', '[]', 0, 1, 1)`);
  pc.subject("X");
  await pc.enable(1);
  await pc.round();
  assert.equal(server.ofKind("note").length, 0);
  assert.equal(pc.all(`SELECT * FROM sync_outbox WHERE tbl = 'notes'`).length, 1);
});

await test("una modifica fatta durante il giro non si perde", async () => {
  const { server, pc, phone } = pair();
  pc.setting("userName", "A");
  await pc.enable(1);
  await pc.round();
  await phone.enable(0);
  // mentre il telefono applica, l'utente crea una materia
  const base = server.forDevice(PHONE);
  let done = false;
  const sneaky: SyncServer = {
    push: base.push,
    pull: async (after) => {
      const page = await base.pull(after);
      if (!done) {
        done = true;
        phone.subject("Creata durante il giro");
      }
      return page;
    },
  };
  await syncRound(phone.repo, sneaky, {
    deviceId: PHONE, clockOffset: 0, kinds: KINDS, adopt: true, cursorKey: "sync_cursor:u", pendingKey: "sync_pending:u",
  });
  assert.ok(server.ofKind("subject").some((r) => r.data?.name === "Creata durante il giro"));
});

console.log(`OK: ${passed} prove superate`);
