/*
 * Prove della presenza dello Studio (payload e gestione dei canali), con orologio, timer e canali finti.
 * Lancio (da questa cartella del repo):
 *   npx rolldown scripts/gruppi/presence.test.mts --file node_modules/.tmp/gruppi-presence.test.mjs --platform node
 *   node node_modules/.tmp/gruppi-presence.test.mjs
 */
import assert from "node:assert/strict";
import type { StudyTimerSnapshot } from "../../src/core/activity/activityBus";
import type { PresenceChannelStatus, PresenceListeners } from "../../src/core/cloud/presence";
import {
  buildPresence,
  mergeDevices,
  parseChannelState,
  parsePresence,
  phaseElapsedSeconds,
  presenceKind,
  unsavedStudySeconds,
  type StudyPresence,
} from "../../src/social/modules/study/presence/payload";
import { StudyPresenceHub, type PresenceSnapshot } from "../../src/social/modules/study/presence/presenceHub";

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

const NOW = 1_800_000_000_000; // ora "locale" delle prove
const OFFSET = 90_000; // il server è 90 s avanti
const SERVER = NOW + OFFSET;

const working: StudyTimerSnapshot = {
  phase: "work",
  mode: "pomodoro",
  runningSince: NOW - 600_000,
  phaseTotalSeconds: 1500,
  accumulatedSeconds: 120,
  changedAt: NOW - 600_000,
};

function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    phase: "work",
    mode: "pomodoro",
    runningSince: SERVER - 60_000,
    phaseTotalSeconds: 1500,
    accumulatedSeconds: 0,
    changedAt: SERVER - 60_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------- payload.ts

await test("build: istanti convertiti all'ora del server, materia e sala se date", () => {
  const p = buildPresence(working, { offsetMs: OFFSET, now: NOW, subject: "  Analisi 2 ", room: 1 });
  assert.deepEqual(p, {
    v: 1,
    phase: "work",
    mode: "pomodoro",
    runningSince: NOW - 600_000 + OFFSET,
    phaseTotalSeconds: 1500,
    accumulatedSeconds: 120,
    changedAt: NOW - 600_000 + OFFSET,
    subject: "Analisi 2",
    room: 1,
  });
});

await test("build: senza materia (impostazione spenta) il campo non c'è proprio", () => {
  const p = buildPresence(working, { offsetMs: 0, now: NOW, subject: null, room: null });
  assert.equal("subject" in p, false);
  assert.equal("room" in p, false);
});

await test("build: materia tagliata a 40 caratteri, mai durante la pausa; sala fuori range ignorata", () => {
  const long = "x".repeat(60);
  assert.equal(buildPresence(working, { offsetMs: 0, now: NOW, subject: long, room: null }).subject?.length, 40);
  const pause = { ...working, phase: "break" as const };
  assert.equal("subject" in buildPresence(pause, { offsetMs: 0, now: NOW, subject: "Fisica", room: null }), false);
  assert.equal("room" in buildPresence(working, { offsetMs: 0, now: NOW, subject: null, room: 4 }), false);
  assert.equal("room" in buildPresence(working, { offsetMs: 0, now: NOW, subject: null, room: 1.5 }), false);
});

await test("build: timer fermo = idle (connesso), cambiato all'istante dato", () => {
  const p = buildPresence(null, { offsetMs: OFFSET, now: NOW, subject: "Fisica", room: 0 });
  assert.deepEqual(p, {
    v: 1, phase: "idle", mode: "pomodoro", runningSince: null, phaseTotalSeconds: 0, accumulatedSeconds: 0,
    changedAt: SERVER, room: 0,
  });
  assert.equal(presenceKind(p), "online");
});

await test("parse: un payload costruito da noi torna uguale", () => {
  const p = buildPresence(working, { offsetMs: OFFSET, now: NOW, subject: "Analisi", room: 2 });
  assert.deepEqual(parsePresence(JSON.parse(JSON.stringify(p)), SERVER), p);
});

await test("parse: versione sconosciuta ignorata (anche futura)", () => {
  assert.equal(parsePresence(valid({ v: 2 }), SERVER), null);
  assert.equal(parsePresence(valid({ v: "1" }), SERVER), null);
  assert.equal(parsePresence({ ...valid(), v: undefined }, SERVER), null);
});

await test("parse: tipi e valori non ammessi scartati", () => {
  const bad: Record<string, unknown>[] = [
    { phase: "short_break" },
    { phase: "<b>x</b>" },
    { mode: "timer" },
    { phaseTotalSeconds: -1 },
    { phaseTotalSeconds: 86_401 },
    { accumulatedSeconds: Number.NaN },
    { accumulatedSeconds: "10" },
    { runningSince: SERVER - 25 * 3_600_000 },
    { runningSince: SERVER + 25 * 3_600_000 },
    { runningSince: "ieri" },
    { changedAt: SERVER + 25 * 3_600_000 },
    { changedAt: null },
    { subject: "x".repeat(41) },
    { subject: 42 },
    { room: 4 },
    { room: -1 },
    { room: "1" },
    { phase: "idle", runningSince: SERVER },
  ];
  for (const overrides of bad) assert.equal(parsePresence(valid(overrides), SERVER), null, JSON.stringify(overrides));
  assert.equal(parsePresence(null, SERVER), null);
  assert.equal(parsePresence("ciao", SERVER), null);
  assert.equal(parsePresence([], SERVER), null);
});

await test("parse: campi in più tolti; la materia resta testo e solo mentre si studia", () => {
  const p = parsePresence(valid({ subject: "<img src=x onerror=alert(1)>", avatar: "https://x", extra: 1 }), SERVER);
  assert.deepEqual(Object.keys(p ?? {}).sort(), ["accumulatedSeconds", "changedAt", "mode", "phase", "phaseTotalSeconds", "runningSince", "subject", "v"]);
  assert.equal(p?.subject, "<img src=x onerror=alert(1)>"); // la UI lo mostra come testo, mai come HTML
  const brk = parsePresence(valid({ phase: "break", subject: "Fisica" }), SERVER);
  assert.equal(brk && "subject" in brk, false);
  assert.equal(parsePresence(valid({ changedAt: SERVER - 3 * 86_400_000, runningSince: null, phase: "idle" }), SERVER)?.phase, "idle",
    "app aperta da giorni col timer fermo: valido");
});

await test("più dispositivi: vince chi studia, poi chi è in pausa, poi il più recente; i non validi non contano", () => {
  const idle = valid({ phase: "idle", runningSince: null, changedAt: SERVER - 1_000 });
  const paused = valid({ runningSince: null, changedAt: SERVER - 5_000 });
  const running = valid({ changedAt: SERVER - 9_000 });
  assert.equal(mergeDevices([idle, paused, running], SERVER)?.runningSince, running.runningSince);
  assert.equal(presenceKind(mergeDevices([idle, paused], SERVER) as StudyPresence), "paused");
  const older = valid({ phase: "idle", runningSince: null, changedAt: SERVER - 50_000 });
  assert.equal(mergeDevices([older, idle], SERVER)?.changedAt, idle.changedAt);
  assert.equal(mergeDevices([valid({ v: 9 }), { rotto: true }], SERVER), null);
  const members = parseChannelState({ a: [running], b: [valid({ v: 9 })] }, SERVER);
  assert.deepEqual(Object.keys(members), ["a"], "chi manda solo payload sconosciuti non compare");
});

await test("secondi della fase e non ancora salvati", () => {
  const p = parsePresence(valid({ accumulatedSeconds: 100, runningSince: SERVER - 50_000 }), SERVER) as StudyPresence;
  assert.equal(phaseElapsedSeconds(p, SERVER), 150);
  assert.equal(unsavedStudySeconds(p, SERVER), 150);
  const overtime = parsePresence(valid({ accumulatedSeconds: 1400, runningSince: SERVER - 600_000 }), SERVER) as StudyPresence;
  assert.equal(phaseElapsedSeconds(overtime, SERVER), 1500, "il pomodoro non supera la sua durata");
  const stopwatch = parsePresence(valid({ mode: "stopwatch", phaseTotalSeconds: 0, accumulatedSeconds: 3000, runningSince: SERVER - 600_000 }), SERVER) as StudyPresence;
  assert.equal(phaseElapsedSeconds(stopwatch, SERVER), 3600);
  const paused = parsePresence(valid({ accumulatedSeconds: 700, runningSince: null }), SERVER) as StudyPresence;
  assert.equal(unsavedStudySeconds(paused, SERVER), 700, "in pausa: i secondi fatti non sono ancora salvati");
  const brk = parsePresence(valid({ phase: "break", phaseTotalSeconds: 300, runningSince: SERVER - 30_000 }), SERVER) as StudyPresence;
  assert.equal(phaseElapsedSeconds(brk, SERVER), 30);
  assert.equal(unsavedStudySeconds(brk, SERVER), 0, "la pausa non è studio");
  const future = parsePresence(valid({ runningSince: SERVER + 5_000 }), SERVER) as StudyPresence;
  assert.equal(phaseElapsedSeconds(future, SERVER), 0, "orologi poco allineati: mai negativo");
});

// ---------------------------------------------------------------- presenceHub.ts

interface FakeChannel {
  groupId: string;
  listeners: PresenceListeners;
  tracked: Record<string, unknown>[];
  left: boolean;
  failTrack: boolean;
}

function harness() {
  let now = NOW;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const channels: FakeChannel[] = [];
  const snapshots: PresenceSnapshot[] = [];
  const hub = new StudyPresenceHub({
    now: () => now,
    join: (groupId, listeners) => {
      const ch: FakeChannel = { groupId, listeners, tracked: [], left: false, failTrack: false };
      channels.push(ch);
      return {
        track: async (payload) => {
          if (ch.failTrack) throw new Error("x");
          ch.tracked.push(payload);
        },
        leave: async () => void (ch.left = true),
      };
    },
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (id) => void timers.delete(id as number),
    onChange: (s) => void snapshots.push(s),
  });
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
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
    }
    now = end;
    await settle();
  };
  const open = (groupId: string) => channels.filter((c) => c.groupId === groupId && !c.left);
  const status = (groupId: string, s: PresenceChannelStatus) => open(groupId).at(-1)?.listeners.status(s);
  return { hub, channels, snapshots, advance, settle, open, status, last: () => snapshots.at(-1) as PresenceSnapshot, tick: (ms: number) => (now += ms) };
}

await test("entra nei gruppi nuovi, esce da quelli tolti", async () => {
  const h = harness();
  h.hub.setGroups(["g1", "g2"]);
  assert.deepEqual(h.channels.map((c) => c.groupId), ["g1", "g2"]);
  assert.deepEqual(h.last().channels, { g1: "joining", g2: "joining" });
  h.hub.setGroups(["g2", "g3"]);
  assert.equal(h.channels[0].left, true);
  assert.deepEqual(h.channels.filter((c) => !c.left).map((c) => c.groupId), ["g2", "g3"]);
  h.hub.setGroups(["g2", "g3"]);
  assert.equal(h.channels.length, 3, "stessi gruppi: nessun nuovo canale");
  h.hub.stop();
  assert.ok(h.channels.every((c) => c.left), "stop: esce da tutti");
});

await test("manda lo stato appena entrato e solo quando cambia", async () => {
  const h = harness();
  h.hub.setOffset(OFFSET);
  h.hub.setGroups(["g1"]);
  h.hub.setLocal({ timer: null, subject: null, rooms: {} });
  assert.equal(h.channels[0].tracked.length, 0, "prima di entrare non manda");
  h.status("g1", "joined");
  await h.settle();
  assert.equal(h.channels[0].tracked.length, 1);
  assert.equal(h.channels[0].tracked[0].phase, "idle");
  h.tick(30_000);
  h.hub.setLocal({ timer: null, subject: null, rooms: {} });
  h.hub.setLocal({ timer: null, subject: "Fisica", rooms: {} });
  await h.settle();
  assert.equal(h.channels[0].tracked.length, 1, "timer fermo: niente da rimandare (né l'ora né la materia)");
  h.hub.setLocal({ timer: working, subject: "Fisica", rooms: {} });
  await h.settle();
  assert.equal(h.channels[0].tracked.length, 2);
  assert.equal(h.channels[0].tracked[1].subject, "Fisica");
  assert.equal(h.channels[0].tracked[1].runningSince, (working.runningSince as number) + OFFSET);
  h.hub.setLocal({ timer: working, subject: "Fisica", rooms: {} });
  await h.settle();
  assert.equal(h.channels[0].tracked.length, 2, "stesso stato: non rimanda");
  h.hub.stop();
});

await test("la sala è per gruppo", async () => {
  const h = harness();
  h.hub.setGroups(["g1", "g2"]);
  h.status("g1", "joined");
  h.status("g2", "joined");
  h.hub.setLocal({ timer: working, subject: null, rooms: { g2: 3 } });
  await h.settle();
  assert.equal("room" in (h.channels[0].tracked.at(-1) ?? {}), false);
  assert.equal(h.channels[1].tracked.at(-1)?.room, 3);
  h.hub.stop();
});

await test("ricezione: stato del canale validato, versioni sconosciute ignorate", async () => {
  const h = harness();
  h.hub.setOffset(OFFSET);
  h.hub.setGroups(["g1"]);
  h.status("g1", "joined");
  h.open("g1")[0].listeners.sync({ anna: [valid()], bruno: [valid({ v: 2 })], carla: [{ html: "<b>" }] });
  assert.deepEqual(Object.keys(h.last().members.g1), ["anna"]);
  h.hub.stop();
});

await test("canale caduto: esce, rientra dopo 5 s, poi 10 s; rientrato rimanda lo stato", async () => {
  const h = harness();
  h.hub.setGroups(["g1"]);
  h.hub.setLocal({ timer: working, subject: null, rooms: {} });
  h.status("g1", "joined");
  await h.settle();
  h.open("g1")[0].listeners.sync({ anna: [valid()] });
  h.status("g1", "error");
  assert.equal(h.last().channels.g1, "error");
  assert.deepEqual(h.last().members.g1, {}, "canale caduto: nessuno risulta presente");
  assert.equal(h.channels[0].left, true);
  await h.advance(4_999);
  assert.equal(h.channels.length, 1);
  await h.advance(1);
  assert.equal(h.channels.length, 2, "rientra dopo 5 s");
  h.status("g1", "closed");
  await h.advance(9_999);
  assert.equal(h.channels.length, 2);
  await h.advance(1);
  assert.equal(h.channels.length, 3, "poi dopo 10 s");
  h.status("g1", "joined");
  await h.settle();
  assert.equal(h.channels[2].tracked.length, 1, "rientrato: manda subito");
  h.status("g1", "error");
  await h.advance(5_000);
  assert.equal(h.channels.length, 4, "dopo un rientro riuscito le attese ripartono da 5 s");
  h.hub.stop();
});

await test("errori ripetuti dallo stesso canale non accumulano tentativi", async () => {
  const h = harness();
  h.hub.setGroups(["g1"]);
  const ch = h.channels[0];
  ch.listeners.status("error");
  ch.listeners.status("closed");
  ch.listeners.status("error");
  await h.advance(5_000);
  assert.equal(h.channels.length, 2);
  h.status("g1", "error");
  await h.advance(10_000);
  assert.equal(h.channels.length, 3, "il secondo tentativo dopo 10 s, non di più");
  h.hub.stop();
});

await test("rientro automatico di Realtime (SUBSCRIBED di nuovo sullo stesso canale): rimanda lo stato", async () => {
  const h = harness();
  h.hub.setGroups(["g1"]);
  h.hub.setLocal({ timer: working, subject: null, rooms: {} });
  h.status("g1", "joined");
  await h.settle();
  h.status("g1", "joined");
  await h.settle();
  assert.equal(h.channels[0].tracked.length, 2, "il server ha perso lo stato: va rimandato");
  h.hub.stop();
});

await test("gruppo tolto mentre aspetta di rientrare: non rientra", async () => {
  const h = harness();
  h.hub.setGroups(["g1"]);
  h.status("g1", "error");
  h.hub.setGroups([]);
  await h.advance(60_000);
  assert.equal(h.channels.length, 1);
  h.hub.stop();
});

await test("invio fallito: si riprova al cambio successivo anche se lo stato torna uguale", async () => {
  const h = harness();
  h.hub.setGroups(["g1"]);
  h.status("g1", "joined");
  h.channels[0].failTrack = true;
  h.hub.setLocal({ timer: working, subject: null, rooms: {} });
  await h.settle();
  h.channels[0].failTrack = false;
  h.hub.setLocal({ timer: working, subject: null, rooms: {} });
  await h.settle();
  // il primo è lo stato "fermo" mandato appena entrati; poi quello rifiutato, rimandato
  assert.deepEqual(h.channels[0].tracked.map((p) => p.phase), ["idle", "work"]);
  h.hub.stop();
});

await test("dopo stop nessun evento arriva più all'app", async () => {
  const h = harness();
  h.hub.setGroups(["g1"]);
  const ch = h.channels[0];
  h.hub.stop();
  const count = h.snapshots.length;
  ch.listeners.sync({ anna: [valid()] });
  ch.listeners.status("error");
  await h.advance(60_000);
  assert.equal(h.snapshots.length, count);
  assert.equal(h.channels.length, 1);
});

console.log(`OK: ${passed} prove superate`);
