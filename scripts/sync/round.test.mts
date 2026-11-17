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
import { specOf, type SyncKind } from "../../src/core/sync/tables";
import { chooseReplace, SYNC_KINDS } from "../../src/core/sync/syncSetup";

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

// ---------------------------------------------------------------- Note e Raccolte

const ALL: SyncKind[] = [...SYNC_KINDS];
const NOTE_TABLES = ALL.map((k) => specOf(k).table);

/** Un quaderno con cartelle, una nota con una vista e un riferimento a una riga, e una raccolta con un campo nota. */
function notebook(d: Device) {
  const parent = Number(d.sql(`INSERT INTO note_folders (parent_id, name, created_at) VALUES (NULL, 'Scuola', 1)`).lastInsertRowid);
  const child = Number(d.sql(`INSERT INTO note_folders (parent_id, name, created_at) VALUES (?, 'Fisica', 2)`, parent).lastInsertRowid);
  const note = Number(
    d.sql(`INSERT INTO notes (folder_id, title, created_at, updated_at, disk_path) VALUES (?, 'Leggi', 10, 10, 'scuola/fisica/leggi--1')`, child).lastInsertRowid
  );
  const coll = Number(d.sql(`INSERT INTO note_collections (name, created_at) VALUES ('Compiti', 20)`).lastInsertRowid);
  const title = Number(d.sql(`INSERT INTO note_collection_fields (collection_id, name, type, position) VALUES (?, 'Titolo', 'text', 0)`, coll).lastInsertRowid);
  const link = Number(d.sql(`INSERT INTO note_collection_fields (collection_id, name, type, position) VALUES (?, 'Nota', 'note', 1)`, coll).lastInsertRowid);
  const row = Number(
    d.sql(`INSERT INTO note_collection_rows (collection_id, data, created_at, updated_at) VALUES (?, ?, 30, 30)`, coll, JSON.stringify({ [title]: "Esercizi", [link]: note }))
      .lastInsertRowid
  );
  const view = Number(
    d.sql(
      `INSERT INTO note_collection_views (collection_id, name, filter, sort, fields, group_field) VALUES (?, 'Tutti', ?, ?, ?, ?)`,
      coll,
      JSON.stringify([{ field: title, op: "contains", value: "E" }]),
      JSON.stringify({ field: link, dir: "asc" }),
      JSON.stringify([link]),
      title
    ).lastInsertRowid
  );
  d.sql(`INSERT INTO note_pages (note_id, position, content) VALUES (?, 0, ?)`, note, `<p>vedi</p><div data-view="${view}"></div><span data-ref-row="${row}">riga</span>`);
  d.sql(`INSERT INTO note_pages (note_id, position, content) VALUES (?, 1, '<p>due</p>')`, note);
  return { note, coll, row, view };
}

/** Il quaderno come lo vede l'utente, senza id locali (gli id dentro i contenuti risolti in nomi). */
function readNotebook(d: Device) {
  const folders = d.all<{ id: number; parent_id: number | null; name: string }>(`SELECT id, parent_id, name FROM note_folders`);
  const fname = (id: unknown) => folders.find((f) => f.id === id)?.name ?? null;
  const fields = d.all<{ id: number; name: string }>(`SELECT id, name FROM note_collection_fields`);
  const field = (id: unknown) => fields.find((f) => f.id === Number(id))?.name ?? null;
  const notes = d.all<{ id: number; title: string; folder_id: number }>(`SELECT id, title, folder_id FROM notes`);
  const rows = d.all<{ id: number; data: string }>(`SELECT id, data FROM note_collection_rows`);
  const views = d.all<{ id: number; name: string; filter: string; sort: string; fields: string; group_field: number }>(`SELECT * FROM note_collection_views`);
  const pages = d.all<{ note_id: number; position: number; content: string }>(`SELECT note_id, position, content FROM note_pages ORDER BY position`);
  return {
    folders: folders.map((f) => [f.name, fname(f.parent_id)]).sort(),
    notes: notes.map((n) => [n.title, fname(n.folder_id)]),
    rows: rows.map((r) =>
      Object.entries(JSON.parse(r.data) as Record<string, unknown>).map(([k, v]) => [field(k), field(k) === "Nota" ? notes.find((n) => n.id === v)?.title : v])
    ),
    views: views.map((v) => ({
      name: v.name,
      filter: (JSON.parse(v.filter) as { field: number }[]).map((f) => field(f.field)),
      sort: field((JSON.parse(v.sort) as { field: number }).field),
      fields: (JSON.parse(v.fields) as number[]).map(field),
      group: field(v.group_field),
      numeric: (JSON.parse(v.filter) as { field: unknown }[]).every((f) => typeof f.field === "number"),
    })),
    pages: pages.map((p) => [
      notes.find((n) => n.id === p.note_id)?.title,
      p.position,
      p.content
        .replace(/data-view="(\d+)"/, (_m, id) => `data-view="${views.find((v) => v.id === Number(id))?.name}"`)
        .replace(/data-ref-row="(\d+)"/, (_m, id) => `data-ref-row="${rows.some((r) => r.id === Number(id)) ? "ok" : "manca"}"`),
    ]),
  };
}

await test("Note e Raccolte: struttura e id dentro i contenuti arrivano tradotti", async () => {
  const { pc, phone } = pair();
  // id diversi sul telefono
  phone.sql(`INSERT INTO note_folders (parent_id, name, created_at) VALUES (NULL, 'Prima', 0)`);
  phone.sql(`INSERT INTO note_collections (name, created_at) VALUES ('Prima', 0)`);
  phone.sql(`DELETE FROM note_folders`);
  phone.sql(`DELETE FROM note_collections`);
  notebook(pc);
  await pc.repo.enqueueAll(NOTE_TABLES, 1);
  await pc.round(false, ALL);
  await phone.repo.enqueueAll(NOTE_TABLES, 0);
  const result = await phone.round(true, ALL);
  for (const k of ["folder", "note", "page", "collection", "field", "row", "view"] as const) assert.ok(result.changed.has(k), k);
  assert.equal(result.written.get("page")?.length, 2);
  const seen = readNotebook(phone);
  assert.deepEqual(seen, readNotebook(pc));
  assert.deepEqual(seen.pages[0], ["Leggi", 0, `<p>vedi</p><div data-view="Tutti"></div><span data-ref-row="ok">riga</span>`]);
  assert.equal(seen.views[0].numeric, true);
  assert.notDeepEqual(phone.all(`SELECT id FROM note_collections`), pc.all(`SELECT id FROM note_collections`), "id locali diversi davvero");
  assert.deepEqual(phone.all(`SELECT disk_path FROM notes`), [{ disk_path: null }], "la cartella su disco è di ogni dispositivo");
  assert.equal(phone.all(`SELECT * FROM sync_outbox WHERE tbl <> 'settings'`).length, 0);
});

await test("Note: cancellata su un dispositivo, sparisce sull'altro con la sua cartella su disco nell'evento", async () => {
  const { pc, phone } = pair();
  const { note } = notebook(pc);
  await pc.repo.enqueueAll(NOTE_TABLES, 1);
  await pc.round(false, ALL);
  await phone.repo.enqueueAll(NOTE_TABLES, 0);
  await phone.round(true, ALL);
  phone.sql(`UPDATE notes SET disk_path = 'scuola/fisica/leggi--7'`);
  // come deleteNoteForever
  pc.sql(`DELETE FROM note_pages WHERE note_id = ?`, note);
  pc.sql(`DELETE FROM notes WHERE id = ?`, note);
  await pc.round(false, ALL);
  const result = await phone.round(false, ALL);
  assert.equal(phone.all(`SELECT * FROM notes`).length, 0);
  assert.equal(phone.all(`SELECT * FROM note_pages`).length, 0);
  assert.deepEqual(result.deleted.get("note")?.map((r) => r.disk_path), ["scuola/fisica/leggi--7"]);
});

await test("Note: Unisci con una copia dello stesso quaderno non duplica niente", async () => {
  const { server, pc, phone } = pair();
  notebook(pc);
  notebook(phone);
  phone.sql(`UPDATE note_pages SET content = '<p>due, modificata</p>' WHERE position = 1`);
  await pc.repo.enqueueAll(NOTE_TABLES, 1);
  await pc.round(false, ALL);
  await phone.repo.enqueueAll(NOTE_TABLES, 0);
  await phone.round(true, ALL);
  await pc.round(false, ALL);
  const expected: Partial<Record<SyncKind, number>> = { folder: 2, note: 1, page: 2, collection: 1, field: 2, row: 1, view: 1 };
  for (const [k, n] of Object.entries(expected)) assert.equal(server.ofKind(k as SyncKind).length, n, k);
  assert.deepEqual(readNotebook(phone), readNotebook(pc));
});

await test("Usa i dati del cloud: Note e Studio di qui cancellati, cartelle su disco restituite", async () => {
  const { pc, phone } = pair();
  notebook(pc);
  await pc.repo.enqueueAll(NOTE_TABLES, 1);
  await pc.round(false, ALL);
  notebook(phone);
  phone.subject("Sul telefono");
  const deleted = await chooseReplace(phone.repo, "u");
  assert.deepEqual(deleted.get("note")?.map((r) => r.disk_path), ["scuola/fisica/leggi--1"]);
  assert.equal(phone.all(`SELECT * FROM notes`).length, 0);
  assert.equal(phone.outboxCount(), 0, "la cancellazione non va nel cloud");
  await phone.round(false, ALL);
  assert.deepEqual(readNotebook(phone), readNotebook(pc));
  assert.deepEqual(phone.subjects(), []);
});

await test("Tempo allo schermo: i minuti del PC arrivano al telefono col suo dispositivo, quelli di qui restano NULL", async () => {
  const { server, pc, phone } = pair();
  const KINDS_ST: SyncKind[] = ["screen_usage"];
  const add = (d: Device, kind: "computer" | "phone", hour: number, app: string, seconds: number) =>
    d.sql(
      `INSERT INTO screen_usage (origin_device, device_kind, day, hour, app_key, app_label, category, seconds, first_at, last_at)
       VALUES (NULL, ?, '2026-11-14', ?, ?, ?, 'chat', ?, 1, 2)
       ON CONFLICT (day, hour, app_key) WHERE origin_device IS NULL DO UPDATE SET seconds = seconds + excluded.seconds`,
      kind, hour, app, app, seconds
    );
  const rows = (d: Device) =>
    d.all<{ origin_device: string | null; device_kind: string; app_key: string; seconds: number }>(
      `SELECT origin_device, device_kind, app_key, seconds FROM screen_usage ORDER BY device_kind, app_key`
    );
  add(pc, "computer", 10, "discord", 60);
  await pc.repo.enqueueAll(["screen_usage"], 1);
  await pc.round(false, KINDS_ST);
  add(phone, "phone", 10, "discord", 30);
  await phone.repo.enqueueAll(["screen_usage"], 0);
  await phone.round(true, KINDS_ST);
  await pc.round(false, KINDS_ST);
  add(pc, "computer", 10, "discord", 15); // il PC continua a contare nella stessa riga
  await pc.round(false, KINDS_ST);
  await phone.round(false, KINDS_ST);
  assert.equal(server.ofKind("screen_usage").length, 2);
  assert.deepEqual(rows(phone), [
    { origin_device: PC, device_kind: "computer", app_key: "discord", seconds: 75 },
    { origin_device: null, device_kind: "phone", app_key: "discord", seconds: 30 },
  ]);
  assert.deepEqual(rows(pc), [
    { origin_device: null, device_kind: "computer", app_key: "discord", seconds: 75 },
    { origin_device: PHONE, device_kind: "phone", app_key: "discord", seconds: 30 },
  ]);

  // il PC rifà il DB (stesso dispositivo) e ricomincia a contare prima del giro: la sua riga del cloud prende il posto
  // di quella nuova, senza doppioni né errori dell'indice unico
  const fresh = new Device(PC, server);
  add(fresh, "computer", 10, "discord", 5);
  await fresh.round(false, KINDS_ST);
  assert.deepEqual(rows(fresh), [
    { origin_device: null, device_kind: "computer", app_key: "discord", seconds: 75 },
    { origin_device: PHONE, device_kind: "phone", app_key: "discord", seconds: 30 },
  ]);
  assert.equal(server.ofKind("screen_usage").length, 2);
});

// ---------------------------------------------------------------- Calendario

/**
 * Un calendario con tutti i riferimenti: categoria, proprietà (valori per uid), serie settimanale con un'eccezione
 * "solo questa", sessione di studio collegata a un evento, promemoria spuntato, note collegate a un giorno e a un evento.
 */
function calendar(d: Device) {
  const subject = d.subject("Analisi");
  const note = Number(d.sql(`INSERT INTO notes (folder_id, title, created_at, updated_at) VALUES (NULL, 'Appunti', 1, 1)`).lastInsertRowid);
  const cat = Number(d.sql(`INSERT INTO calendar_categories (name, color, position, created_at) VALUES ('Uni', '#5B8DEF', 0, 1)`).lastInsertRowid);
  d.sql(`INSERT INTO calendar_properties (uid, name, type, options, position) VALUES ('p-aula', 'Aula', 'text', '[]', 0)`);
  const ev = (kind: string, title: string, start: number, end: number, extra: Record<string, string | number | null> = {}) => {
    const cols = ["kind", "title", "start_at", "end_at", "created_at", "updated_at", ...Object.keys(extra)];
    const vals = [kind, title, start, end, 1, 1, ...Object.values(extra)];
    return Number(d.sql(`INSERT INTO calendar_events (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, ...vals).lastInsertRowid);
  };
  const exam = ev("event", "Esame", 10_000, 20_000, { category_id: cat, props: JSON.stringify({ "p-aula": "B2" }), reminders: '[{"type":"offset","minutes":10}]' });
  const series = ev("event", "Lezione", 100_000, 110_000, { repeat: JSON.stringify({ freq: "week", interval: 1, weekdays: 0, until: null, count: null, exdates: [704_900_000] }) });
  ev("event", "Lezione spostata", 705_000_000, 705_010_000, { series_id: series, original_start: 704_900_000 });
  ev("study", "", 30_000, 40_000, { subject_id: subject, parent_id: exam });
  ev("reminder", "Medicina", 50_000, 50_000, { description: "Una pastiglia", done: "[50000]" });
  d.sql(`INSERT INTO calendar_note_links (note_id, day, event_id, created_at) VALUES (?, '2026-11-17', NULL, 1)`, note);
  d.sql(`INSERT INTO calendar_note_links (note_id, day, event_id, created_at) VALUES (?, NULL, ?, 1)`, note, exam);
  return { exam, series };
}

/** Il calendario come lo vede l'utente: gli id locali risolti in nomi. */
function readCalendar(d: Device) {
  type E = Record<string, unknown> & { id: number };
  const events = d.all<E>(`SELECT * FROM calendar_events ORDER BY start_at`);
  const title = (id: unknown) => events.find((e) => e.id === id)?.title ?? null;
  const name = (table: string, id: unknown) =>
    id === null ? null : (d.all<{ name: string }>(`SELECT name FROM ${table} WHERE id = ?`, id as number)[0]?.name ?? "?");
  return {
    categories: d.all(`SELECT name, color FROM calendar_categories`),
    properties: d.all(`SELECT uid, name, type FROM calendar_properties`),
    events: events.map((e) => ({
      kind: e.kind,
      title: e.title,
      start: e.start_at,
      end: e.end_at,
      category: name("calendar_categories", e.category_id),
      subject: name("subjects", e.subject_id),
      parent: e.parent_id === null ? null : title(e.parent_id),
      series: e.series_id === null ? null : title(e.series_id),
      original: e.original_start,
      repeat: e.repeat,
      reminders: e.reminders,
      props: e.props,
      description: e.description,
      done: e.done,
    })),
    links: d
      .all<{ note: string; day: string | null; event_id: number | null }>(
        `SELECT n.title AS note, l.day, l.event_id FROM calendar_note_links l JOIN notes n ON n.id = l.note_id ORDER BY l.day IS NULL`
      )
      .map((l) => ({ note: l.note, day: l.day, event: l.event_id === null ? null : title(l.event_id) })),
  };
}

const ALL_TABLES = ALL.map((k) => specOf(k).table);

await test("Calendario: elementi, serie con eccezione, sessione collegata, promemoria e note arrivano tradotti", async () => {
  const { server, pc, phone } = pair();
  calendar(pc);
  await pc.repo.enqueueAll(ALL_TABLES, 1);
  await pc.round(false, ALL);
  assert.equal(server.ofKind("calendar_event").length, 5);
  assert.equal(server.ofKind("calendar_note").length, 2);
  // nel cloud nessun id locale: i riferimenti sono id globali
  const study = server.ofKind("calendar_event").find((r) => r.data?.kind === "study");
  assert.equal(typeof study?.data?.parent_id, "string");
  assert.equal(typeof study?.data?.subject_id, "string");

  await phone.round(false, ALL);
  const seen = readCalendar(phone);
  assert.deepEqual(seen, readCalendar(pc));
  assert.equal(seen.events.find((e) => e.title === "Lezione spostata")?.series, "Lezione");
  assert.equal(seen.events.find((e) => e.kind === "study")?.parent, "Esame");
  assert.deepEqual(seen.links.map((l) => [l.note, l.day, l.event]), [["Appunti", "2026-11-17", null], ["Appunti", null, "Esame"]]);
  assert.equal(phone.outboxCount(), 0);
});

await test("Calendario: modifica e cancellazione (con eccezioni e note collegate) arrivano sull'altro", async () => {
  const { pc, phone } = pair();
  const { exam, series } = calendar(pc);
  await pc.repo.enqueueAll(ALL_TABLES, 1);
  await pc.round(false, ALL);
  await phone.round(false, ALL);

  // sul PC: l'esame cambia ora; la serie si elimina come fa calendarRepository.deleteEvent
  pc.sql(`UPDATE calendar_events SET start_at = 12000, end_at = 22000, updated_at = 2 WHERE id = ?`, exam);
  pc.sql(`DELETE FROM calendar_events WHERE id = ? OR series_id = ?`, series, series);
  await pc.round(false, ALL);
  await phone.round(false, ALL);
  const seen = readCalendar(phone);
  assert.deepEqual(seen, readCalendar(pc));
  assert.equal(seen.events.find((e) => e.title === "Esame")?.start, 12_000);
  assert.equal(seen.events.some((e) => String(e.title).startsWith("Lezione")), false);

  // sul telefono: elimina l'esame (scollega la sessione, toglie le sue note) → sul PC la sessione resta, senza padre
  const phoneExam = phone.all<{ id: number }>(`SELECT id FROM calendar_events WHERE title = 'Esame'`)[0].id;
  phone.sql(`UPDATE calendar_events SET parent_id = NULL WHERE parent_id = ?`, phoneExam);
  phone.sql(`DELETE FROM calendar_note_links WHERE event_id = ?`, phoneExam);
  phone.sql(`DELETE FROM calendar_events WHERE id = ?`, phoneExam);
  await phone.round(false, ALL);
  await pc.round(false, ALL);
  const pcSeen = readCalendar(pc);
  assert.deepEqual(pcSeen, readCalendar(phone));
  assert.deepEqual(pcSeen.events.map((e) => [e.kind, e.parent]), [["study", null], ["reminder", null]]);
  assert.deepEqual(pcSeen.links.map((l) => l.day), ["2026-11-17"]);
});

await test("Calendario: Unisci con una copia dello stesso calendario non duplica niente", async () => {
  const { server, pc, phone } = pair();
  calendar(pc);
  calendar(phone);
  await pc.repo.enqueueAll(ALL_TABLES, 1);
  await pc.round(false, ALL);
  await phone.repo.enqueueAll(ALL_TABLES, 0);
  await phone.round(true, ALL);
  await pc.round(false, ALL);
  assert.deepEqual(readCalendar(phone), readCalendar(pc));
  assert.equal(server.ofKind("calendar_event").length, 5);
  assert.equal(server.ofKind("calendar_category").length, 1);
  assert.equal(server.ofKind("calendar_property").length, 1);
  assert.equal(server.ofKind("calendar_note").length, 2);
  assert.equal(phone.all(`SELECT * FROM calendar_events`).length, 5);
});

console.log(`OK: ${passed} prove superate`);
