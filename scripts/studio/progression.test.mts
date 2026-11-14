/*
 * Prove della progressione dello Studio (src/widgets/study/lib/progression.ts): frammenti e nuclei, livelli, Prove
 * superate e fallite, livello che non scende, Serie e gradi attorno alla mezzanotte, obiettivo a 0, tratti, giorni col
 * cambio dell'ora legale. Funzioni pure. Lancio (da questa cartella del repo):
 *   npx rolldown scripts/studio/progression.test.mts --file node_modules/.tmp/studio-progression.test.mjs --platform node
 *   node node_modules/.tmp/studio-progression.test.mjs
 */
// Fuso fisso: il cambio dell'ora legale provato sotto è quello italiano (domenica 25 ottobre 2026).
process.env.TZ = "Europe/Rome";

import assert from "node:assert/strict";
import {
  computeProgression,
  coresOf,
  currentStreak,
  dayStartsBetween,
  fragmentsForCores,
  gradeOf,
  secondsPerDay,
  traitsOf,
  type ProgressDay,
} from "../../src/widgets/study/lib/progression";

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

const GOAL = 60 * 60; // 1 h al giorno
const DAY0 = new Date(2026, 0, 5).getTime(); // lunedì 5 gennaio 2026

/** Giorni consecutivi da DAY0, con i secondi dati e lo stesso obiettivo. */
function days(seconds: readonly number[], goal = GOAL): ProgressDay[] {
  const starts = dayStartsBetween(DAY0, new Date(2026, 0, 5 + seconds.length - 1).getTime());
  return seconds.map((s, i) => ({ dayStart: starts[i], seconds: s, goalSeconds: goal }));
}

const run = (seconds: readonly number[], opts: { goal?: number; hasGoal?: boolean; storedLevel?: number } = {}) =>
  computeProgression({
    days: days(seconds, opts.goal ?? GOAL),
    hasGoal: opts.hasGoal ?? (opts.goal ?? GOAL) > 0,
    storedLevel: opts.storedLevel ?? 1,
    recentSessions: [],
  });

const MIN = 60;

test("frammenti e nuclei: 999, 1000, 1001", () => {
  assert.deepEqual(coresOf(999), { full: 0, fill: 999, cap: 1000 });
  assert.deepEqual(coresOf(1000), { full: 1, fill: 0, cap: 2000 });
  assert.deepEqual(coresOf(1001), { full: 1, fill: 1, cap: 2000 });
  assert.equal(run([999 * MIN]).level, 1);
  assert.equal(run([1000 * MIN]).level, 2);
  assert.equal(run([1001 * MIN]).fragments, 1001);
  // i secondi sotto il minuto non fanno un frammento
  assert.equal(run([59]).fragments, 0);
});

test("i frammenti in eccesso passano al nucleo dopo", () => {
  assert.equal(fragmentsForCores(3), 6000);
  assert.deepEqual(coresOf(6500), { full: 3, fill: 500, cap: 4000 });
  assert.deepEqual(coresOf(fragmentsForCores(7) + 5000), { full: 7, fill: 0, cap: 0 });
  const p = run([2480 * MIN]);
  assert.equal(p.fullCores, 1);
  assert.equal(p.coreFill, 1480);
  assert.equal(p.coreCap, 2000);
});

test("Prova: si apre il giorno dopo i nuclei pieni e si supera con 5 giorni su 7", () => {
  // giorno 0: 3000 frammenti (2 nuclei pieni); poi 5 giorni da 1 h
  const p = run([3000 * MIN, GOAL, GOAL, GOAL, GOAL, GOAL]);
  assert.equal(p.level, 3);
  assert.equal(p.next?.level, 4);
  // con solo 4 giorni riusciti è ancora in corso
  const q = run([3000 * MIN, GOAL, GOAL, GOAL, GOAL]);
  assert.equal(q.level, 2);
  assert.equal(q.trial?.status, "running");
  assert.equal(q.trial?.hits, 4);
  assert.deepEqual(q.trial?.days, ["hit", "hit", "hit", "hit", "future", "future", "future"]);
});

test("Prova: il giorno della saturazione non conta, la Prova si apre domani", () => {
  const p = run([3000 * MIN]);
  assert.equal(p.level, 2);
  assert.equal(p.trial?.status, "opens");
});

test("Prova fallita con 3 giorni mancati: ne riparte una il giorno dopo", () => {
  // 3 mancati (ieri compreso), oggi niente
  const failed = run([3000 * MIN, 0, 0, 0]);
  assert.equal(failed.level, 2);
  assert.equal(failed.trial?.status, "running");
  assert.equal(failed.trial?.failures, 0);
  // il terzo mancato fissa il fallimento: la nuova Prova parte il giorno dopo
  const again = run([3000 * MIN, 0, 0, 0, GOAL]);
  assert.equal(again.trial?.failures, 1);
  assert.equal(again.trial?.status, "running");
  assert.equal(again.trial?.hits, 1);
  // e si può superare
  const ok = run([3000 * MIN, 0, 0, 0, GOAL, GOAL, GOAL, GOAL, GOAL]);
  assert.equal(ok.level, 3);
});

test("oggi non è mancato finché non finisce", () => {
  const p = run([3000 * MIN, GOAL, 0, 0, 0]);
  // ieri e l'altro ieri mancati (2), oggi ancora aperto
  assert.equal(p.trial?.misses, 2);
  assert.equal(p.trial?.days[3], "today");
});

test("il livello non scende mai sotto quello salvato", () => {
  const p = run([10 * MIN], { storedLevel: 4 });
  assert.equal(p.level, 4);
  assert.equal(p.next?.level, 5);
  // la Prova del livello dopo parte solo con i suoi nuclei pieni (4)
  assert.equal(p.trial, null);
});

test("obiettivo a 0: la Prova non parte", () => {
  const p = run([3000 * MIN, 5 * MIN, 5 * MIN], { goal: 0 });
  assert.equal(p.level, 2);
  assert.equal(p.trial?.status, "needsGoal");
});

test("Serie e gradi: oggi non rompe la serie finché non finisce", () => {
  assert.equal(currentStreak(days([GOAL, GOAL, GOAL, 0]), true), 3);
  assert.equal(currentStreak(days([GOAL, GOAL, GOAL, GOAL]), true), 4);
  assert.equal(currentStreak(days([GOAL, 0, GOAL, 10]), true), 1);
  assert.equal(gradeOf(0), 0);
  assert.equal(gradeOf(1), 1);
  assert.equal(gradeOf(9), 3);
  assert.equal(gradeOf(100), 7);
  const p = run([GOAL, GOAL, GOAL, GOAL, GOAL, GOAL, GOAL, GOAL, GOAL]);
  assert.equal(p.streak, 9);
  assert.equal(p.grade, 3);
  assert.equal(p.nextGradeIn, 5);
});

test("un giorno senza obiettivo (riposo previsto) non rompe la serie", () => {
  const ds = days([GOAL, GOAL, 0]);
  ds[1] = { ...ds[1], seconds: 0, goalSeconds: 0 };
  assert.equal(currentStreak(ds, true), 2);
});

test("sessione a cavallo della mezzanotte: conta nel giorno in cui finisce", () => {
  const starts = dayStartsBetween(DAY0, DAY0 + 2 * 86_400_000);
  const end = new Date(2026, 0, 6, 0, 30).getTime();
  assert.deepEqual(secondsPerDay(starts, [{ endedAt: end, durationSeconds: 3600 }]), [0, 3600, 0]);
});

test("giorni col cambio dell'ora legale", () => {
  const starts = dayStartsBetween(new Date(2026, 9, 24, 12).getTime(), new Date(2026, 9, 27, 9).getTime());
  assert.equal(starts.length, 4);
  for (const s of starts) {
    const d = new Date(s);
    assert.equal(d.getHours() + d.getMinutes(), 0);
  }
  // domenica 25 ottobre dura 25 ore
  assert.equal(starts[2] - starts[1], 25 * 3_600_000);
});

test("tratti: Costante, Nottambulo, Mattiniero", () => {
  const ds = days(Array(8).fill(GOAL));
  const at = (h: number, m: number, minutes: number) => {
    const start = new Date(2026, 0, 6, h, m).getTime();
    return { startedAt: start, endedAt: start + minutes * 60_000 };
  };
  assert.deepEqual(traitsOf(ds, true, [at(23, 0, 60), at(15, 0, 60)]), ["Costante", "Nottambulo"]);
  assert.deepEqual(traitsOf(ds, true, [at(6, 0, 60), at(15, 0, 60)]), ["Costante", "Mattiniero"]);
  // troppo poco studio: gli orari non contano
  assert.deepEqual(traitsOf(days([GOAL]), true, [at(23, 0, 30)]), []);
});

console.log(`progression: ${passed} prove superate`);
