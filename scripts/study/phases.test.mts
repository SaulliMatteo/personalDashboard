/*
 * Prove dei passaggi di fase del pomodoro (widgets/study/timer/phases.ts): fine fase, recupero di più fasi finite
 * con l'app congelata (orari veri, pausa lunga, fasi che non partono da sole), cronometro, materia mancante,
 * catena per le notifiche pianificate. Funzioni pure. Lancio (dalla cartella del repo):
 *   node scripts/study/phases.test.mts
 */
import assert from "node:assert/strict";
import { IDLE_TIMER, advanceTo, nextPhase, phaseEndAt, upcomingEnds, type PhaseTimings } from "../../src/widgets/study/timer/phases.ts";

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

const MIN = 60_000;
const T: PhaseTimings = { workSeconds: 25 * 60, shortBreakSeconds: 5 * 60, longBreakSeconds: 15 * 60, cyclesBeforeLongBreak: 4 };
const T0 = 1_800_000_000_000;

function work(runningSince: number | null, remainingSeconds = 25 * 60, cycleCount = 0) {
  return { subjectId: 7, phase: "work" as const, remainingSeconds, phaseTotalSeconds: 25 * 60, runningSince, cycleCount };
}

test("fine fase: avvio + secondi rimasti; ferma, cronometro e riposo non finiscono", () => {
  assert.equal(phaseEndAt(work(T0)), T0 + 25 * MIN);
  assert.equal(phaseEndAt(work(T0, 60)), T0 + MIN);
  assert.equal(phaseEndAt(work(null)), null);
  assert.equal(phaseEndAt({ ...work(T0, 300), phaseTotalSeconds: 0 }), null);
  assert.equal(phaseEndAt(IDLE_TIMER), null);
});

test("prima della fine non succede nulla (stesso oggetto)", () => {
  const s = work(T0);
  const r = advanceTo(s, T, true, T0 + 25 * MIN - 1);
  assert.equal(r.state, s);
  assert.equal(r.ends.length, 0);
});

test("una fase finita: sessione all'orario vero, la pausa parte dalla fine, non da adesso", () => {
  const r = advanceTo(work(T0), T, true, T0 + 27 * MIN);
  assert.equal(r.ends.length, 1);
  assert.equal(r.ends[0].kind, "pomodoroDone");
  assert.equal(r.ends[0].at, T0 + 25 * MIN);
  assert.equal(r.state.phase, "short_break");
  assert.equal(r.state.runningSince, T0 + 25 * MIN);
  assert.equal(r.state.cycleCount, 1);
});

test("senza avvio automatico ci si ferma dopo una fase, anche se è passata un'ora", () => {
  const r = advanceTo(work(T0), T, false, T0 + 60 * MIN);
  assert.equal(r.ends.length, 1);
  assert.equal(r.state.phase, "short_break");
  assert.equal(r.state.runningSince, null);
  assert.equal(r.state.remainingSeconds, 5 * 60);
});

test("con avvio automatico si recuperano tutte le fasi: studio, pausa, studio... e la pausa lunga al quarto", () => {
  // 4 pomodori da 25 + 3 pause brevi da 5 = 115 min, poi la pausa lunga (15) finisce a 130
  const r = advanceTo(work(T0), T, true, T0 + 131 * MIN);
  assert.deepEqual(
    r.ends.map((e) => [e.kind, (e.at - T0) / MIN]),
    [
      ["pomodoroDone", 25],
      ["breakOver", 30],
      ["pomodoroDone", 55],
      ["breakOver", 60],
      ["pomodoroDone", 85],
      ["breakOver", 90],
      ["pomodoroDone", 115],
      ["breakOver", 130],
    ]
  );
  assert.equal(r.ends[6].to.phase, "long_break");
  assert.equal(r.state.phase, "work");
  assert.equal(r.state.runningSince, T0 + 130 * MIN);
  assert.equal(r.state.cycleCount, 4);
  // la sessione registrata è la fase che finisce: durata piena, materia giusta
  assert.equal(r.ends[0].from.phaseTotalSeconds, 25 * 60);
  assert.equal(r.ends[0].from.subjectId, 7);
});

test("il conto dei cicli continua da dove era (pausa lunga al momento giusto dopo una ripresa)", () => {
  const r = advanceTo(work(T0, 25 * 60, 3), T, true, T0 + 26 * MIN);
  assert.equal(r.state.phase, "long_break");
  assert.equal(r.state.cycleCount, 4);
});

test("fase ripresa dopo una pausa: conta solo il tempo rimasto", () => {
  // messa in pausa con 10 minuti rimasti, ripresa a T0
  const r = advanceTo(work(T0, 600), T, false, T0 + 10 * MIN);
  assert.equal(r.ends.length, 1);
  assert.equal(r.ends[0].at, T0 + 10 * MIN);
});

test("studio senza materia: si torna a riposo senza avvisi", () => {
  const r = advanceTo({ ...work(T0), subjectId: null }, T, true, T0 + 30 * MIN);
  assert.equal(r.state, IDLE_TIMER);
  assert.equal(r.ends.length, 0);
  assert.equal(nextPhase({ ...work(T0), subjectId: null }, T, true, T0), null);
});

test("cronometro: non finisce mai", () => {
  const s = { ...work(T0, 0), phaseTotalSeconds: 0 };
  assert.equal(advanceTo(s, T, true, T0 + 1000 * MIN).ends.length, 0);
  assert.equal(upcomingEnds(s, T, true, 8).length, 0);
});

test("prossime fine fase: una sola senza avvio automatico, la catena con", () => {
  assert.deepEqual(
    upcomingEnds(work(T0), T, false, 8).map((e) => (e.at - T0) / MIN),
    [25]
  );
  assert.deepEqual(
    upcomingEnds(work(T0), T, true, 5).map((e) => (e.at - T0) / MIN),
    [25, 30, 55, 60, 85]
  );
  assert.equal(upcomingEnds(work(null), T, true, 8).length, 0);
});

test("pausa in corso: finisce e riparte lo studio sulla stessa materia", () => {
  const brk = { subjectId: 7, phase: "short_break" as const, remainingSeconds: 300, phaseTotalSeconds: 300, runningSince: T0, cycleCount: 1 };
  const r = advanceTo(brk, T, false, T0 + 6 * MIN);
  assert.equal(r.ends[0].kind, "breakOver");
  assert.equal(r.state.phase, "work");
  assert.equal(r.state.subjectId, 7);
  assert.equal(r.state.remainingSeconds, 25 * 60);
  assert.equal(r.state.cycleCount, 1);
});

console.log(`phases: ${passed} prove passate`);
