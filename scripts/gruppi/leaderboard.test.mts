/*
 * Prove della classifica di studio dei Gruppi, dei totali per periodo e del codice invito (funzioni pure, nessun server).
 * Lancio (da questa cartella del repo):
 *   npx rolldown scripts/gruppi/leaderboard.test.mts --file node_modules/.tmp/gruppi-leaderboard.test.mjs --platform node
 *   node node_modules/.tmp/gruppi-leaderboard.test.mjs
 */
import assert from "node:assert/strict";
import { formatInviteCode, isInviteCodeComplete, normalizeInviteCode } from "../../src/core/cloud/inviteCode";
import {
  buildLeaderboard,
  formatStudyTime,
  studyingCount,
  visibleRows,
  type LeaderboardInput,
} from "../../src/social/modules/study/leaderboard";
import type { StudyPresence } from "../../src/social/modules/study/presence/payload";
import { aggregateTotals, fetchFrom, monthCoverage } from "../../src/social/modules/study/totals/aggregate";

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

const NOW = 1_800_000_000_000;

function studying(sinceSeconds: number, accumulated = 0): StudyPresence {
  return {
    v: 1,
    phase: "work",
    mode: "stopwatch",
    runningSince: NOW - sinceSeconds * 1000,
    phaseTotalSeconds: 0,
    accumulatedSeconds: accumulated,
    changedAt: NOW - sinceSeconds * 1000,
  };
}

function input(over: Partial<LeaderboardInput> = {}): LeaderboardInput {
  return {
    members: [
      { userId: "a", username: "anna" },
      { userId: "b", username: "bruno" },
      { userId: "c", username: "carla" },
    ],
    meId: "b",
    saved: {},
    live: {},
    serverNow: NOW,
    ...over,
  };
}

test("ordina per tempo, a pari tempo per nome", () => {
  const rows = buildLeaderboard(input({ saved: { a: 60, b: 600, c: 60 } }));
  assert.deepEqual(rows.map((r) => r.username), ["bruno", "anna", "carla"]);
});

test("a pari tempo stessa posizione (1, 2, 2, 4)", () => {
  const rows = buildLeaderboard(
    input({
      members: [...input().members, { userId: "d", username: "dario" }],
      saved: { a: 100, b: 50, c: 50, d: 10 },
    })
  );
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 2, 4]);
});

test("la sessione in corso si somma ai totali salvati", () => {
  const rows = buildLeaderboard(input({ saved: { a: 100 }, live: { a: studying(30, 20) } }));
  const anna = rows.find((r) => r.userId === "a")!;
  assert.equal(anna.seconds, 150);
  assert.equal(anna.kind, "studying");
});

test("le pause non contano e chi non è connesso è offline", () => {
  const paused: StudyPresence = { ...studying(0, 500), runningSince: null };
  const brk: StudyPresence = { ...studying(100), phase: "break", mode: "pomodoro", phaseTotalSeconds: 300 };
  const rows = buildLeaderboard(input({ live: { a: paused, b: brk } }));
  const by = Object.fromEntries(rows.map((r) => [r.userId, r]));
  assert.equal(by.a.seconds, 500, "in pausa a metà: conta il già fatto");
  assert.equal(by.a.kind, "paused");
  assert.equal(by.b.seconds, 0, "pausa del pomodoro: niente");
  assert.equal(by.b.kind, "break");
  assert.equal(by.c.kind, "offline");
});

test("segna me", () => {
  const rows = buildLeaderboard(input());
  assert.deepEqual(rows.filter((r) => r.isMe).map((r) => r.userId), ["b"]);
});

test("studyingCount conta solo chi studia col timer in corsa", () => {
  const paused: StudyPresence = { ...studying(0, 10), runningSince: null };
  assert.equal(studyingCount(buildLeaderboard(input({ live: { a: studying(5), b: paused } }))), 1);
});

const many = buildLeaderboard({
  members: Array.from({ length: 8 }, (_, i) => ({ userId: `u${i}`, username: `utente${i}` })),
  meId: "u6",
  saved: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`u${i}`, 1000 - i * 10])),
  live: {},
  serverNow: NOW,
});

test("visibleRows: io tra i primi → i primi così come sono", () => {
  const rows = visibleRows(many.map((r) => ({ ...r, isMe: r.userId === "u2" })), 5);
  assert.deepEqual(rows.map((r) => r.userId), ["u0", "u1", "u2", "u3", "u4"]);
});

test("visibleRows: io fuori dai primi → i primi 4 + me", () => {
  const rows = visibleRows(many, 5);
  assert.deepEqual(rows.map((r) => r.userId), ["u0", "u1", "u2", "u3", "u6"]);
  assert.equal(rows[4].rank, 7, "la mia posizione vera");
});

test("visibleRows: senza me (o limite 0)", () => {
  const rows = visibleRows(many.map((r) => ({ ...r, isMe: false })), 3);
  assert.deepEqual(rows.map((r) => r.userId), ["u0", "u1", "u2"]);
  assert.deepEqual(visibleRows(many, 0), []);
});

test("formatStudyTime", () => {
  assert.equal(formatStudyTime(0), "0m");
  assert.equal(formatStudyTime(59), "0m");
  assert.equal(formatStudyTime(45 * 60), "45m");
  assert.equal(formatStudyTime(2 * 3600 + 5 * 60 + 30), "2h 05m");
});

test("codice invito: normalizza minuscole, trattini e spazi", () => {
  assert.equal(normalizeInviteCode(" k7qm-3xrq "), "K7QM3XRQ");
  assert.equal(normalizeInviteCode("k7 qm 3x rq"), "K7QM3XRQ");
});

test("codice invito: formato a gruppi di 4, anche mentre si scrive", () => {
  assert.equal(formatInviteCode("k7qm3xrq"), "K7QM-3XRQ");
  assert.equal(formatInviteCode("k7q"), "K7Q");
  assert.equal(formatInviteCode("k7qm"), "K7QM");
  assert.equal(formatInviteCode("k7qm3"), "K7QM-3");
  assert.equal(formatInviteCode("k7qm3xrqzz"), "K7QM-3XRQ", "oltre 8 si taglia");
});

test("codice invito: completo solo con 8 caratteri dell'alfabeto", () => {
  assert.equal(isInviteCodeComplete("K7QM-3XRQ"), true);
  assert.equal(isInviteCodeComplete("K7QM-3XR"), false);
  assert.equal(isInviteCodeComplete("K7QM-3XR0"), false, "lo 0 non c'è");
  assert.equal(isInviteCodeComplete("K7QM-3XRI"), false, "la I non c'è");
});

// ---- Totali per periodo (oggi, settimana, mese) ----
const DAYS = { today: "2026-10-25", weekStart: "2026-10-19", monthStart: "2026-10-01" };
const row = (userId: string, day: string, seconds: number) => ({ userId, day, seconds });

test("totali: da dove leggere è il più vecchio tra lunedì e il primo del mese", () => {
  assert.equal(fetchFrom(DAYS), "2026-10-01");
  assert.equal(fetchFrom({ today: "2026-11-02", weekStart: "2026-10-26", monthStart: "2026-11-01" }), "2026-10-26");
});

test("totali: oggi, settimana e mese sommati per utente", () => {
  const t = aggregateTotals(
    [row("a", "2026-10-01", 100), row("a", "2026-10-19", 50), row("a", "2026-10-25", 10), row("b", "2026-10-20", 7), row("a", "2026-10-26", 999)],
    DAYS
  );
  assert.deepEqual(t.today, { a: 10 });
  assert.deepEqual(t.week, { a: 60, b: 7 });
  assert.deepEqual(t.month, { a: 160, b: 7 });
  assert.deepEqual(t.firstDay, { a: "2026-10-01", b: "2026-10-20" });
});

test("totali: con lunedì nel mese prima, la settimana conta anche quei giorni ma il mese no", () => {
  const days = { today: "2026-11-02", weekStart: "2026-10-26", monthStart: "2026-11-01" };
  const t = aggregateTotals([row("a", "2026-10-27", 30), row("a", "2026-11-01", 20)], days);
  assert.deepEqual(t.week, { a: 50 });
  assert.deepEqual(t.month, { a: 20 });
  assert.equal(monthCoverage(t.firstDay.a, days.monthStart).kind, "full");
});

test("mese: completo, parziale (dal primo giorno con dati) o senza dati, mai uno zero finto", () => {
  assert.deepEqual(monthCoverage("2026-10-01", "2026-10-01"), { kind: "full" });
  assert.deepEqual(monthCoverage("2026-09-28", "2026-10-01"), { kind: "full" });
  assert.deepEqual(monthCoverage("2026-10-12", "2026-10-01"), { kind: "partial", from: "2026-10-12" });
  assert.deepEqual(monthCoverage(undefined, "2026-10-01"), { kind: "none" });
});

console.log(`OK: ${passed} prove superate`);
