/*
 * Prove dell'invio dei totali di studio (parti pure, orologio e timer finti).
 * Lancio (da questa cartella del repo):
 *   npx rolldown scripts/gruppi/sync.test.mts --file node_modules/.tmp/gruppi-sync.test.mjs --platform node
 *   TZ=Europe/Rome node node_modules/.tmp/gruppi-sync.test.mjs
 * TZ fisso: le prove sul cambio d'ora usano le date italiane.
 */
import assert from "node:assert/strict";
import { dailyTotals, dayKey, syncDays, SYNC_DAYS } from "../../src/social/modules/study/sync/plan";
import { PERIODIC_SYNC_MS, StudySync, type StudySyncDeps, type StudySyncState, type SyncFailure } from "../../src/social/modules/study/sync/studySync";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (error) {
    console.error(`FALLITO: ${name}`);
    throw error;
  }
}

const at = (y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0) => new Date(y, m - 1, d, h, min, s, ms);
const HOUR = 3_600_000;

// ora dell'Europa centrale (su Windows Node può chiamarla Europe/Paris): +1 d'inverno, +2 d'estate
assert.ok(at(2026, 1, 15).getTimezoneOffset() === -60 && at(2026, 7, 15).getTimezoneOffset() === -120, "lanciare con TZ=Europe/Rome");

// ---------------------------------------------------------------- plan.ts

await test("dayKey usa il giorno locale", () => {
  assert.equal(dayKey(at(2026, 1, 5, 0, 0)), "2026-01-05");
  assert.equal(dayKey(at(2026, 12, 31, 23, 59, 59, 999)), "2026-12-31");
});

await test("primo invio: 14 giorni fino a oggi, consecutivi", () => {
  const days = syncDays(at(2026, 10, 24, 15), null);
  assert.equal(days.length, SYNC_DAYS);
  assert.equal(days[0].key, "2026-10-11");
  assert.equal(days[13].key, "2026-10-24");
  for (let i = 1; i < days.length; i++) assert.equal(days[i].start, days[i - 1].end);
});

await test("ultimo invio oggi: ieri e oggi", () => {
  const days = syncDays(at(2026, 10, 24, 15), at(2026, 10, 24, 9).getTime());
  assert.deepEqual(days.map((d) => d.key), ["2026-10-23", "2026-10-24"]);
});

await test("ultimo invio 3 giorni fa: da quel giorno", () => {
  const days = syncDays(at(2026, 10, 24, 15), at(2026, 10, 21, 23, 50).getTime());
  assert.deepEqual(days.map((d) => d.key), ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
});

await test("ultimo invio 30 giorni fa: al massimo 14 giorni", () => {
  const days = syncDays(at(2026, 10, 24, 15), at(2026, 9, 24).getTime());
  assert.equal(days.length, SYNC_DAYS);
  assert.equal(days[0].key, "2026-10-11");
});

await test("ultimo invio nel futuro (orologio spostato): ieri e oggi", () => {
  const days = syncDays(at(2026, 10, 24, 15), at(2026, 11, 2).getTime());
  assert.deepEqual(days.map((d) => d.key), ["2026-10-23", "2026-10-24"]);
});

await test("cambio d'ora (25 ottobre 2026): giorno di 25 ore, confini a mezzanotte", () => {
  const days = syncDays(at(2026, 10, 26, 10), at(2026, 10, 24, 12).getTime());
  assert.deepEqual(days.map((d) => d.key), ["2026-10-24", "2026-10-25", "2026-10-26"]);
  assert.equal(days[1].end - days[1].start, 25 * HOUR);
  assert.equal(days[1].start, at(2026, 10, 25).getTime());
  assert.equal(days[2].start, at(2026, 10, 26).getTime());
  const totals = dailyTotals(days, [{ endedAt: at(2026, 10, 25, 23, 30).getTime(), durationSeconds: 600 }]);
  assert.deepEqual(totals, [
    { day: "2026-10-24", seconds: 0 },
    { day: "2026-10-25", seconds: 600 },
    { day: "2026-10-26", seconds: 0 },
  ]);
});

await test("ora legale (29 marzo 2026): giorno di 23 ore", () => {
  const days = syncDays(at(2026, 3, 30, 8), at(2026, 3, 29, 1).getTime());
  assert.equal(days[0].key, "2026-03-29");
  assert.equal(days[0].end - days[0].start, 23 * HOUR);
});

await test("la sessione conta nel giorno in cui finisce (mezzanotte esatta = giorno dopo)", () => {
  const days = syncDays(at(2026, 10, 24, 15), at(2026, 10, 24, 9).getTime());
  const totals = dailyTotals(days, [
    { endedAt: at(2026, 10, 23, 23, 59, 59, 999).getTime(), durationSeconds: 3_000 },
    { endedAt: at(2026, 10, 24, 0, 0).getTime(), durationSeconds: 120 },
    { endedAt: at(2026, 10, 24, 10).getTime(), durationSeconds: 1_500 },
  ]);
  assert.deepEqual(totals, [
    { day: "2026-10-23", seconds: 3_000 },
    { day: "2026-10-24", seconds: 1_620 },
  ]);
});

await test("giorni vuoti a 0, fuori finestra ignorati, limiti del server rispettati", () => {
  const days = syncDays(at(2026, 10, 24, 15), at(2026, 10, 24, 9).getTime());
  const totals = dailyTotals(days, [
    { endedAt: at(2026, 10, 20).getTime(), durationSeconds: 999 },
    { endedAt: at(2026, 10, 25, 1).getTime(), durationSeconds: 999 },
    { endedAt: at(2026, 10, 24, 10).getTime(), durationSeconds: 80_000 },
    { endedAt: at(2026, 10, 24, 11).getTime(), durationSeconds: 80_000 },
    { endedAt: at(2026, 10, 24, 12).getTime(), durationSeconds: -50 },
    { endedAt: at(2026, 10, 23, 12).getTime(), durationSeconds: 10.4 },
  ]);
  assert.deepEqual(totals, [
    { day: "2026-10-23", seconds: 10 },
    { day: "2026-10-24", seconds: 86_400 },
  ]);
});

// ---------------------------------------------------------------- studySync.ts

/** Orologio e timer finti: `advance` fa scorrere il tempo e lascia finire le promesse. */
function harness(options: { fail?: () => SyncFailure | null; registerFails?: () => boolean } = {}) {
  let now = at(2026, 10, 24, 15).getTime();
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const log = {
    uploads: [] as { at: number; days: string[] }[],
    registers: 0,
    authErrors: 0,
    states: [] as StudySyncState[],
    lastSync: null as number | null,
  };
  const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  };
  const deps: StudySyncDeps = {
    now: () => now,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (id) => void timers.delete(id as number),
    loadSessions: async () => [],
    loadLastSync: async () => log.lastSync,
    saveLastSync: async (t) => void (log.lastSync = t),
    registerDevice: async () => {
      log.registers++;
      if (options.registerFails?.()) throw new Error("rete");
    },
    upload: async (totals) => {
      const failure = options.fail?.() ?? null;
      if (failure) throw new Error(failure);
      log.uploads.push({ at: now, days: totals.map((t) => t.day) });
    },
    classifyError: (e) => ((e as Error).message === "rete" ? "unreachable" : ((e as Error).message as SyncFailure)),
    onAuthError: () => void log.authErrors++,
    onState: (s) => void log.states.push(s),
  };
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      await settle();
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
      await settle();
    }
    now = end;
    await settle();
  };
  const pendingDelays = () => [...timers.values()].map((t) => t.at - now).sort((a, b) => a - b);
  return { sync: new StudySync(deps), log, advance, pendingDelays };
}

await test("invio: 14 giorni, dispositivo registrato, ultimo invio salvato, poi ogni 15 minuti", async () => {
  const h = harness();
  h.sync.request(0);
  await h.advance(0);
  assert.equal(h.log.uploads.length, 1);
  assert.equal(h.log.uploads[0].days.length, 14);
  assert.equal(h.log.registers, 1);
  assert.equal(h.log.lastSync, h.log.uploads[0].at);
  assert.deepEqual(h.pendingDelays(), [PERIODIC_SYNC_MS]);
  await h.advance(PERIODIC_SYNC_MS);
  assert.equal(h.log.uploads.length, 2);
  assert.deepEqual(h.log.uploads[1].days, ["2026-10-23", "2026-10-24"]);
  assert.equal(h.log.registers, 1, "il dispositivo si registra una volta sola");
  h.sync.stop();
});

await test("richieste ravvicinate: il timer più vicino vince, un solo invio", async () => {
  const h = harness();
  h.sync.request(5_000);
  h.sync.request(5_000);
  h.sync.request(1_000);
  assert.deepEqual(h.pendingDelays(), [1_000]);
  await h.advance(1_000);
  assert.equal(h.log.uploads.length, 1);
  h.sync.stop();
});

await test("richiesta durante un invio: uno solo in più, subito dopo", async () => {
  let release: () => void = () => {};
  const h = harness();
  const gate = new Promise<void>((r) => (release = r));
  let first = true;
  const sync = h.sync as unknown as { deps: StudySyncDeps };
  const upload = sync.deps.upload;
  sync.deps.upload = async (t) => {
    if (first) {
      first = false;
      await gate;
    }
    return upload(t);
  };
  h.sync.request(0);
  await h.advance(0);
  h.sync.request(0);
  h.sync.request(0);
  release();
  await h.advance(0);
  assert.equal(h.log.uploads.length, 2);
  assert.deepEqual(h.pendingDelays(), [PERIODIC_SYNC_MS]);
  h.sync.stop();
});

await test("non raggiungibile: 5 s, 10 s, 20 s, poi riuscito e si torna ai 15 minuti", async () => {
  let failures = 3;
  const h = harness({ fail: () => (failures-- > 0 ? "unreachable" : null) });
  h.sync.request(0);
  await h.advance(0);
  assert.deepEqual(h.pendingDelays(), [5_000]);
  assert.equal(h.log.states.at(-1)?.kind, "failed");
  await h.advance(5_000);
  assert.deepEqual(h.pendingDelays(), [10_000]);
  await h.advance(10_000);
  assert.deepEqual(h.pendingDelays(), [20_000]);
  await h.advance(20_000);
  assert.equal(h.log.uploads.length, 1);
  assert.equal(h.log.states.at(-1)?.kind, "synced");
  assert.deepEqual(h.pendingDelays(), [PERIODIC_SYNC_MS]);
  h.sync.stop();
});

await test("ritorno della rete: riprova subito e azzera le attese", async () => {
  let down = true;
  const h = harness({ fail: () => (down ? "unreachable" : null) });
  h.sync.request(0);
  await h.advance(0);
  await h.advance(5_000);
  assert.deepEqual(h.pendingDelays(), [10_000]);
  down = false;
  h.sync.retryNow();
  await h.advance(0);
  assert.equal(h.log.uploads.length, 1);
  h.sync.stop();
});

await test("l'ultimo invio non avanza se l'invio fallisce", async () => {
  const h = harness({ fail: () => "other" });
  h.sync.request(0);
  await h.advance(0);
  assert.equal(h.log.lastSync, null);
  h.sync.stop();
});

await test("registrazione del dispositivo fallita: si ritenta al giro dopo, niente invio prima", async () => {
  let fails = 1;
  const h = harness({ registerFails: () => fails-- > 0 });
  h.sync.request(0);
  await h.advance(0);
  assert.equal(h.log.uploads.length, 0);
  await h.advance(5_000);
  assert.equal(h.log.registers, 2);
  assert.equal(h.log.uploads.length, 1);
  h.sync.stop();
});

await test("sessione non valida: avvisa l'account e si ferma", async () => {
  const h = harness({ fail: () => "auth" });
  h.sync.request(0);
  await h.advance(0);
  assert.equal(h.log.authErrors, 1);
  assert.deepEqual(h.pendingDelays(), []);
  h.sync.request(0);
  assert.deepEqual(h.pendingDelays(), [], "fermo anche alle nuove richieste");
});

await test("stop: niente più invii", async () => {
  const h = harness();
  h.sync.request(1_000);
  h.sync.stop();
  await h.advance(PERIODIC_SYNC_MS * 2);
  assert.equal(h.log.uploads.length, 0);
});

console.log(`OK: ${passed} prove superate`);
