/*
 * Prove della presenza dello Studio (payload e gestione dei canali, con il limite di invii del server e la via rapida
 * in broadcast), con orologio, timer e canali finti.
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
import { PRESENCE_MAX_TRACKS, PRESENCE_WINDOW_MS, type PresenceHubOptions } from "../../src/social/presence/presenceHub";

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
    { room: 1, seat: 8 },
    { room: 1, seat: -1 },
    { room: 1, seat: 2.5 },
    { phase: "idle", runningSince: SERVER },
  ];
  for (const overrides of bad) assert.equal(parsePresence(valid(overrides), SERVER), null, JSON.stringify(overrides));
  assert.equal(parsePresence(null, SERVER), null);
  assert.equal(parsePresence("ciao", SERVER), null);
  assert.equal(parsePresence([], SERVER), null);
});

await test("posto scelto: solo insieme alla sala, validato in uscita e in entrata", () => {
  assert.equal(buildPresence(working, { offsetMs: 0, now: NOW, subject: null, room: 2, seat: 7 }).seat, 7);
  assert.equal("seat" in buildPresence(working, { offsetMs: 0, now: NOW, subject: null, room: null, seat: 3 }), false);
  assert.equal("seat" in buildPresence(working, { offsetMs: 0, now: NOW, subject: null, room: 2, seat: 8 }), false);
  assert.equal("seat" in buildPresence(working, { offsetMs: 0, now: NOW, subject: null, room: 2, seat: null }), false);
  assert.equal(parsePresence(valid({ room: 1, seat: 4 }), SERVER)?.seat, 4);
  const noRoom = parsePresence(valid({ seat: 4 }), SERVER);
  assert.ok(noRoom, "un posto senza sala non rende non valido il resto");
  assert.equal("seat" in (noRoom ?? {}), false);
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
  /** messaggi mandati in broadcast */
  sent: Record<string, unknown>[];
  left: boolean;
  failTrack: boolean;
}

function harness(options: PresenceHubOptions = {}) {
  let now = NOW;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const channels: FakeChannel[] = [];
  const snapshots: PresenceSnapshot[] = [];
  const hub = new StudyPresenceHub(
    {
      now: () => now,
      join: (groupId, listeners) => {
        const ch: FakeChannel = { groupId, listeners, tracked: [], sent: [], left: false, failTrack: false };
        channels.push(ch);
        return {
          track: async (payload) => {
            if (ch.failTrack) throw new Error("x");
            ch.tracked.push(payload);
          },
          send: async (payload) => void ch.sent.push(payload),
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
    },
    options
  );
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
  h.hub.setLocal({ timer: null, subject: null, rooms: {}, seats: {} });
  assert.equal(h.channels[0].tracked.length, 0, "prima di entrare non manda");
  h.status("g1", "joined");
  await h.settle();
  assert.equal(h.channels[0].tracked.length, 1);
  assert.equal(h.channels[0].tracked[0].phase, "idle");
  h.tick(30_000);
  h.hub.setLocal({ timer: null, subject: null, rooms: {}, seats: {} });
  h.hub.setLocal({ timer: null, subject: "Fisica", rooms: {}, seats: {} });
  await h.settle();
  assert.equal(h.channels[0].tracked.length, 1, "timer fermo: niente da rimandare (né l'ora né la materia)");
  h.hub.setLocal({ timer: working, subject: "Fisica", rooms: {}, seats: {} });
  await h.settle();
  assert.equal(h.channels[0].tracked.length, 2);
  assert.equal(h.channels[0].tracked[1].subject, "Fisica");
  assert.equal(h.channels[0].tracked[1].runningSince, (working.runningSince as number) + OFFSET);
  h.hub.setLocal({ timer: working, subject: "Fisica", rooms: {}, seats: {} });
  await h.settle();
  assert.equal(h.channels[0].tracked.length, 2, "stesso stato: non rimanda");
  h.hub.stop();
});

await test("la sala è per gruppo", async () => {
  const h = harness();
  h.hub.setGroups(["g1", "g2"]);
  h.status("g1", "joined");
  h.status("g2", "joined");
  h.hub.setLocal({ timer: working, subject: null, rooms: { g2: 3 }, seats: { g2: 5 } });
  await h.settle();
  assert.equal("room" in (h.channels[0].tracked.at(-1) ?? {}), false);
  assert.equal(h.channels[1].tracked.at(-1)?.room, 3);
  assert.equal(h.channels[1].tracked.at(-1)?.seat, 5);
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
  h.hub.setLocal({ timer: working, subject: null, rooms: {}, seats: {} });
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
  h.hub.setLocal({ timer: working, subject: null, rooms: {}, seats: {} });
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
  h.hub.setLocal({ timer: working, subject: null, rooms: {}, seats: {} });
  await h.settle();
  h.channels[0].failTrack = false;
  h.hub.setLocal({ timer: working, subject: null, rooms: {}, seats: {} });
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

// ---------------------------------------------------------------- limite di invii e via rapida

const seated = (seat: number) => ({ timer: working, subject: null, rooms: { g1: 0 }, seats: { g1: seat } });

await test("limite del server: al massimo 4 invii di presenza in 30 s, poi parte l'ultimo stato", async () => {
  const h = harness();
  h.hub.setGroups(["g1"]);
  h.hub.setLocal(seated(0));
  h.status("g1", "joined");
  await h.settle();
  for (let seat = 1; seat < 7; seat++) {
    h.tick(1_000);
    h.hub.setLocal(seated(seat));
    await h.settle();
  }
  const ch = h.channels[0];
  assert.equal(ch.tracked.length, PRESENCE_MAX_TRACKS, "il quinto e i successivi aspettano");
  assert.deepEqual(ch.tracked.map((p) => p.seat), [0, 1, 2, 3]);
  await h.advance(PRESENCE_WINDOW_MS);
  assert.equal(ch.tracked.at(-1)?.seat, 6, "allo scadere della finestra parte l'ultimo, non quelli di mezzo");
  assert.equal(ch.tracked.length, PRESENCE_MAX_TRACKS + 1);
  h.hub.stop();
});

const FAST = { key: "io", instance: "istanza1" };

await test("via rapida: ogni cambio parte subito in broadcast, anche quando la presenza aspetta", async () => {
  const h = harness({ fastPath: FAST });
  h.hub.setGroups(["g1"]);
  h.hub.setLocal(seated(0));
  h.status("g1", "joined");
  await h.settle();
  for (let seat = 1; seat < 7; seat++) {
    h.tick(1_000);
    h.hub.setLocal(seated(seat));
    await h.settle();
  }
  const ch = h.channels[0];
  assert.deepEqual(ch.sent.map((m) => (m.p as Record<string, unknown>).seat), [0, 1, 2, 3, 4, 5, 6]);
  assert.ok(ch.sent.every((m) => m.k === "io" && (m.p as Record<string, unknown>)._i === "istanza1"));
  assert.equal(ch.tracked.length, PRESENCE_MAX_TRACKS);
  assert.equal(ch.tracked[0]._i, "istanza1", "anche la presenza dice quale istanza è");
  h.hub.stop();
});

await test("via rapida in arrivo: sostituisce la presenza di quel dispositivo finché la presenza non la raggiunge", async () => {
  const h = harness({ fastPath: FAST });
  h.hub.setOffset(OFFSET);
  h.hub.setGroups(["g1"]);
  h.status("g1", "joined");
  const ch = h.open("g1")[0];
  const old = valid({ room: 0, seat: 1, _i: "x1" });
  ch.listeners.sync({ anna: [old] });
  assert.equal(h.last().members.g1.anna.seat, 1);
  ch.listeners.message?.({ k: "anna", p: valid({ room: 0, seat: 4, _i: "x1" }) });
  assert.equal(h.last().members.g1.anna.seat, 4, "subito al posto nuovo");
  assert.equal("_i" in h.last().members.g1.anna, false, "il campo dell'istanza non arriva al modulo");
  ch.listeners.sync({ anna: [old] });
  assert.equal(h.last().members.g1.anna.seat, 4, "la presenza vecchia non lo riporta indietro");
  // raggiunta (anche con le chiavi in un altro ordine): il broadcast non serve più
  const { _i, ...rest } = valid({ room: 0, seat: 4 });
  ch.listeners.sync({ anna: [{ _i: "x1", ...rest }] });
  ch.listeners.sync({ anna: [valid({ room: 0, seat: 2, _i: "x1" })] });
  assert.equal(h.last().members.g1.anna.seat, 2, "dopo, vale di nuovo la presenza");
  h.hub.stop();
});

await test("via rapida in arrivo: chi non è nel canale non compare, e chi esce sparisce", async () => {
  const h = harness({ fastPath: FAST });
  h.hub.setOffset(OFFSET);
  h.hub.setGroups(["g1"]);
  h.status("g1", "joined");
  const ch = h.open("g1")[0];
  ch.listeners.message?.({ k: "dario", p: valid({ _i: "d1" }) });
  ch.listeners.sync({ anna: [valid({ _i: "x1" })] });
  ch.listeners.message?.({ k: "anna", p: valid({ seat: 3, room: 0, _i: "altro" }) });
  ch.listeners.message?.({ k: "anna", p: "testo" });
  ch.listeners.message?.(null);
  assert.deepEqual(Object.keys(h.last().members.g1), ["anna"]);
  assert.equal(h.last().members.g1.anna.seat, undefined, "un'istanza che non è nel canale non conta");
  ch.listeners.message?.({ k: "anna", p: valid({ room: 0, seat: 3, _i: "x1" }) });
  ch.listeners.sync({});
  assert.deepEqual(h.last().members.g1, {}, "uscita dal canale: via anche lo stato in broadcast");
  ch.listeners.sync({ anna: [valid({ _i: "x1" })] });
  assert.equal(h.last().members.g1.anna.seat, undefined, "rientrata: niente stato vecchio");
  h.hub.stop();
});

await test("senza via rapida i messaggi in broadcast si ignorano", async () => {
  const h = harness();
  h.hub.setOffset(OFFSET);
  h.hub.setGroups(["g1"]);
  h.status("g1", "joined");
  const ch = h.open("g1")[0];
  ch.listeners.sync({ anna: [valid({ _i: "x1" })] });
  ch.listeners.message?.({ k: "anna", p: valid({ room: 0, seat: 3, _i: "x1" }) });
  assert.equal(h.last().members.g1.anna.seat, undefined);
  assert.equal(ch.sent.length, 0);
  h.hub.stop();
});

console.log(`OK: ${passed} prove superate`);
