/*
 * Prove della scheda Prospettiva: periodi (giorno intero, settimana a metà, mese passato), quote su 24 ore e sul
 * tempo da sveglio, sonno ai limiti, cambio dell'ora legale, "<1%". Funzioni pure. Lancio (da questa cartella del repo):
 *   npx rolldown scripts/studio/perspective.test.mts --file node_modules/.tmp/studio-perspective.test.mjs --platform node
 *   node node_modules/.tmp/studio-perspective.test.mjs
 */
// Fuso fisso: il cambio dell'ora legale provato sotto è quello italiano (domenica 25 ottobre 2026).
process.env.TZ = "Europe/Rome";

import assert from "node:assert/strict";
import { awakeHours, formatShare, perspectiveRange, perspectiveShares } from "../../src/widgets/study/lib/perspective";

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

const H = 3600;
// Mercoledì 28 ottobre 2026, di mattina.
const now = new Date(2026, 9, 28, 9, 15);

await test("giorno singolo: giornata intera anche di mattina", () => {
  const range = perspectiveRange("day", 0, now);
  assert.equal(range.start, new Date(2026, 9, 28).getTime());
  assert.equal(range.end, new Date(2026, 9, 29).getTime());
  assert.equal(range.days, 1);
  assert.equal(range.elapsedDays, 1);
  assert.equal(range.title, "mercoledì 28 ottobre");
  assert.equal(perspectiveRange("day", -1, now).start, new Date(2026, 9, 27).getTime());
  // Il futuro non si mostra: un offset positivo vale 0.
  assert.equal(perspectiveRange("day", 3, now).start, range.start);
  const { ofDay, ofAwake } = perspectiveShares(4 * H, range.elapsedDays, 8);
  assert.equal(ofDay, 4 / 24);
  assert.equal(ofAwake, 4 / 16);
  assert.equal(formatShare(ofDay), "17%");
  assert.equal(formatShare(ofAwake), "25%");
});

await test("settimana a metà: contano solo i giorni trascorsi, oggi compreso", () => {
  const range = perspectiveRange("week", 0, now);
  assert.equal(range.start, new Date(2026, 9, 26).getTime()); // lunedì
  assert.equal(range.days, 7);
  assert.equal(range.elapsedDays, 3); // lun, mar, mer
  const { ofDay, ofAwake } = perspectiveShares(12 * H, range.elapsedDays, 8);
  assert.equal(ofDay, 12 / 72);
  assert.equal(ofAwake, 12 / 48);
  // La settimana scorsa è passata: conta tutti i giorni.
  assert.equal(perspectiveRange("week", -1, now).elapsedDays, 7);
});

await test("mese passato: tutti i suoi giorni", () => {
  const september = perspectiveRange("month", -1, now);
  assert.equal(september.start, new Date(2026, 8, 1).getTime());
  assert.equal(september.days, 30);
  assert.equal(september.elapsedDays, 30);
  assert.equal(perspectiveRange("month", 0, now).elapsedDays, 28);
  assert.equal(perspectiveShares(30 * H, september.elapsedDays, 8).ofDay, 30 / (30 * 24));
});

await test("sonno 0 e 16, e valori fuori dai limiti", () => {
  const zero = perspectiveShares(6 * H, 1, 0);
  assert.equal(zero.ofDay, zero.ofAwake);
  assert.equal(perspectiveShares(6 * H, 1, 16).ofAwake, 6 / 8);
  assert.equal(awakeHours(16), 8);
  // Oltre i limiti valgono 16 e 0.
  assert.equal(perspectiveShares(6 * H, 1, 30).ofAwake, 6 / 8);
  assert.equal(perspectiveShares(6 * H, 1, -5).ofAwake, 6 / 24);
  // Mai oltre 1, e niente divisioni per zero.
  assert.equal(perspectiveShares(30 * H, 1, 16).ofAwake, 1);
  assert.deepEqual(perspectiveShares(H, 0, 8), { ofDay: 0, ofAwake: 0 });
});

await test("cambio dell'ora legale: il giorno resta un giorno di calendario", () => {
  const sunday = new Date(2026, 9, 25, 22, 0); // domenica di 25 ore
  const range = perspectiveRange("day", 0, sunday);
  assert.equal(range.start, new Date(2026, 9, 25).getTime());
  assert.equal(range.end, new Date(2026, 9, 26).getTime());
  assert.equal(range.end - range.start, 25 * H * 1000);
  assert.equal(range.title, "domenica 25 ottobre");
  assert.equal(range.elapsedDays, 1);
  // Dal lunedì dopo, un giorno indietro è ancora la domenica intera.
  assert.equal(perspectiveRange("day", -1, new Date(2026, 9, 26, 0, 30)).start, range.start);
  // La settimana con quella domenica ha comunque 7 giorni.
  assert.equal(perspectiveRange("week", 0, sunday).elapsedDays, 7);
});

await test("percentuali: arrotondate, \"<1%\" se c'è qualcosa", () => {
  assert.equal(formatShare(0), "0%");
  assert.equal(formatShare(0.004), "<1%");
  assert.equal(formatShare(0.005), "1%");
  assert.equal(formatShare(perspectiveShares(5 * 60, 1, 8).ofDay), "<1%");
  assert.equal(formatShare(1), "100%");
});

console.log(`perspective: ${passed} prove superate`);
