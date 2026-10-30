/*
 * Prove del piano settimanale dello Studio: giorni (lunedì = bit 0 … domenica = bit 6), "nessun giorno = ogni giorno",
 * obiettivo del giorno con la riserva dell'impostazione, cambio dell'ora legale. Funzioni pure. Lancio (da questa
 * cartella del repo):
 *   npx rolldown scripts/studio/schedule.test.mts --file node_modules/.tmp/studio-schedule.test.mjs --platform node
 *   node node_modules/.tmp/studio-schedule.test.mjs
 */
// Fuso fisso: il cambio dell'ora legale provato sotto è quello italiano (domenica 25 ottobre 2026).
process.env.TZ = "Europe/Rome";

import assert from "node:assert/strict";
import {
  dayName,
  daysLabel,
  daysPerWeek,
  isScheduledOn,
  todayGoalSeconds,
  weekdayBit,
} from "../../src/widgets/study/lib/schedule";

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

const MON = 1 << 0;
const TUE = 1 << 1;
const WED = 1 << 2;
const SUN = 1 << 6;

// Lunedì 26 ottobre 2026 … domenica 1 novembre 2026 (ora locale).
const monday = new Date(2026, 9, 26, 10, 0);
const tuesday = new Date(2026, 9, 27, 10, 0);
const wednesday = new Date(2026, 9, 28, 10, 0);
const sunday = new Date(2026, 10, 1, 10, 0);

await test("lunedì è il bit 0 e domenica il bit 6 (Date.getDay() conta da domenica)", () => {
  assert.equal(monday.getDay(), 1);
  assert.equal(sunday.getDay(), 0);
  assert.equal(weekdayBit(monday), MON);
  assert.equal(weekdayBit(tuesday), TUE);
  assert.equal(weekdayBit(sunday), SUN);
  assert.equal(dayName(monday), "lunedì");
  assert.equal(dayName(sunday), "domenica");
});

await test("studyDays = 0: la materia c'è ogni giorno", () => {
  const always = { studyDays: 0, dailyGoalMinutes: 0 };
  for (let i = 0; i < 7; i++) assert.equal(isScheduledOn(always, new Date(2026, 9, 26 + i, 12)), true);
  assert.equal(daysPerWeek(0), 7);
  assert.equal(daysLabel(0), "");
});

await test("solo i giorni scelti", () => {
  const archi = { studyDays: MON | WED, dailyGoalMinutes: 60 };
  assert.equal(isScheduledOn(archi, monday), true);
  assert.equal(isScheduledOn(archi, tuesday), false);
  assert.equal(isScheduledOn(archi, wednesday), true);
  assert.equal(isScheduledOn(archi, sunday), false);
  assert.equal(isScheduledOn({ studyDays: SUN, dailyGoalMinutes: 0 }, sunday), true);
  assert.equal(daysLabel(MON | WED), "lun, mer");
  assert.equal(daysLabel(TUE), "mar");
  assert.equal(daysLabel(127), "lun, mar, mer, gio, ven, sab, dom");
  assert.equal(daysPerWeek(MON | WED), 2);
});

await test("obiettivo del giorno: somma delle materie previste, altrimenti la riserva", () => {
  const subjects = [
    { studyDays: TUE, dailyGoalMinutes: 90 }, // Analisi: solo martedì
    { studyDays: MON | WED, dailyGoalMinutes: 60 }, // Architettura
    { studyDays: 0, dailyGoalMinutes: 30 }, // ogni giorno
    { studyDays: 0, dailyGoalMinutes: 0 }, // ogni giorno, senza obiettivo
  ];
  assert.equal(todayGoalSeconds(subjects, monday, 240), (60 + 30) * 60);
  assert.equal(todayGoalSeconds(subjects, tuesday, 240), (90 + 30) * 60);
  assert.equal(todayGoalSeconds(subjects, sunday, 240), 30 * 60);
  // Nessuna materia di oggi ha un obiettivo: vale l'impostazione generale (anche 0).
  const noGoals = [{ studyDays: 0, dailyGoalMinutes: 0 }, { studyDays: TUE, dailyGoalMinutes: 90 }];
  assert.equal(todayGoalSeconds(noGoals, monday, 240), 240 * 60);
  assert.equal(todayGoalSeconds(noGoals, monday, 0), 0);
  assert.equal(todayGoalSeconds([], monday, 45), 45 * 60);
});

await test("domenica del cambio dell'ora legale (25 ottobre 2026, giornata di 25 ore)", () => {
  const start = new Date(2026, 9, 25); // mezzanotte locale
  const lateNight = new Date(2026, 9, 25, 23, 30);
  const afterChange = new Date(2026, 9, 25, 3, 30);
  for (const d of [start, afterChange, lateNight]) {
    assert.equal(weekdayBit(d), SUN);
    assert.equal(dayName(d), "domenica");
  }
  // Inizio del giorno + 24 h è ancora domenica (23:00): il giorno va sempre preso dalla data locale, mai sommando ore.
  assert.equal(weekdayBit(new Date(start.getTime() + 24 * 60 * 60 * 1000)), SUN);
  const nextDay = new Date(start);
  nextDay.setDate(nextDay.getDate() + 1);
  assert.equal(weekdayBit(nextDay), MON);
  const sub = { studyDays: SUN, dailyGoalMinutes: 50 };
  assert.equal(todayGoalSeconds([sub], lateNight, 0), 50 * 60);
  assert.equal(todayGoalSeconds([sub], nextDay, 0), 0);
});

console.log(`schedule: ${passed} prove superate`);
