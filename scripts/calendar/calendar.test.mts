/*
 * Prove della logica pura del Calendario (src/widgets/calendar/lib/): date e griglia del mese, ricorrenze (anche col
 * cambio d'ora), disposizione di mese e settimana, studio fatto contro pianificato, promemoria, lettura dei JSON.
 * Fuso fisso Europe/Rome (cambio d'ora: 29/3 e 25/10/2026). I file importano senza estensione, quindi prima il bundle
 * (dalla cartella del repo):
 *   npx rolldown scripts/calendar/calendar.test.mts --file node_modules/.tmp/calendar.test.mjs --platform node
 *   node node_modules/.tmp/calendar.test.mjs
 */
process.env.TZ = "Europe/Rome";

import assert from "node:assert/strict";
import {
  addDays,
  atMinutes,
  dayKey,
  durationText,
  monthGrid,
  parseDayKey,
  parseTime,
  startOfWeek,
  weekDays,
} from "../../src/widgets/calendar/lib/dates";
import { busyDays, countToday, nearDay, upcoming } from "../../src/widgets/calendar/lib/agenda";
import { repeatText, studyStatusText, weekTitle } from "../../src/widgets/calendar/lib/format";
import { entriesByDay, fitCell, occurrenceDays, rowsThatFit } from "../../src/widgets/calendar/lib/monthLayout";
import {
  expandEvent,
  expandEvents,
  hasOccurrencesFrom,
  isSeriesStart,
  rotateWeekdays,
  shiftSeries,
  splitSeriesAt,
  withExdate,
} from "../../src/widgets/calendar/lib/recurrence";
import { dueReminders, isReminderDone, nextReminderAt, recoverableReminders, reminderAt, reminderBody, reminderLabel, remindersBetween } from "../../src/widgets/calendar/lib/reminders";
import { calendarCues } from "../../src/widgets/calendar/lib/cues";
import { parseProps, parseReminders, parseRepeat, parseTodos } from "../../src/widgets/calendar/lib/serialize";
import { isComplete, liveSpan, matchStudy, studyState } from "../../src/widgets/calendar/lib/studyProgress";
import type { CalendarEvent, RepeatRule } from "../../src/widgets/calendar/lib/types";
import {
  DAY_HOUR_PX,
  WEEK_HOUR_PX,
  blockBox,
  layoutColumns,
  limitColumns,
  moveRange,
  nowLineTop,
  rangeFromDrag,
  resizeRange,
  segmentInDay,
} from "../../src/widgets/calendar/lib/weekLayout";

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
const H = 60 * MIN;
const at = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

function ev(partial: Partial<CalendarEvent> & Pick<CalendarEvent, "startAt" | "endAt">): CalendarEvent {
  return {
    id: 1,
    kind: "event",
    title: "x",
    allDay: false,
    categoryId: null,
    subjectId: null,
    parentId: null,
    seriesId: null,
    originalStart: null,
    color: null,
    repeat: null,
    reminders: [],
    props: {},
    todos: [],
    description: "",
    done: [],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}
const rule = (r: Partial<RepeatRule> & Pick<RepeatRule, "freq">): RepeatRule => ({
  interval: 1,
  weekdays: 0,
  until: null,
  count: null,
  exdates: [],
  ...r,
});
const keys = (list: { start: number }[]) => list.map((o) => `${dayKey(o.start)} ${new Date(o.start).toTimeString().slice(0, 5)}`);

// --- date -------------------------------------------------------------------------------------------------------

test("griglia di novembre 2026: 42 giorni da lun 26 ottobre a dom 6 dicembre (come il mockup)", () => {
  const g = monthGrid(2026, 10);
  assert.equal(g.length, 42);
  assert.equal(dayKey(g[0]), "2026-10-26");
  assert.equal(dayKey(g[6]), "2026-11-01");
  assert.equal(dayKey(g[41]), "2026-12-06");
  assert.ok(g.every((d) => d.getHours() === 0));
});

test("griglia di un mese che inizia di lunedì (giugno 2026) e febbraio 2027", () => {
  assert.equal(dayKey(monthGrid(2026, 5)[0]), "2026-06-01");
  assert.equal(dayKey(monthGrid(2027, 1)[0]), "2027-02-01");
});

test("settimana da lunedì; domenica appartiene alla settimana prima", () => {
  assert.equal(dayKey(startOfWeek(at(2026, 11, 11, 16))), "2026-11-09");
  assert.equal(dayKey(startOfWeek(at(2026, 11, 15, 23))), "2026-11-09");
  assert.deepEqual(weekDays(at(2026, 11, 11)).map(dayKey).slice(0, 2), ["2026-11-09", "2026-11-10"]);
});

test("addDays tiene l'ora anche col cambio d'ora", () => {
  const d = addDays(at(2026, 3, 28, 15, 0), 1);
  assert.equal(d.getHours(), 15);
  assert.equal(dayKey(d), "2026-03-29");
  assert.equal(new Date(at(2026, 3, 29, 15) - at(2026, 3, 28, 15)).getTime(), 23 * H);
});

test("chiavi dei giorni e orari", () => {
  assert.equal(parseDayKey("2026-02-30"), null);
  assert.equal(parseDayKey("2026-11-11")?.getDate(), 11);
  assert.equal(parseTime("15:00"), 900);
  assert.equal(parseTime("9"), 540);
  assert.equal(parseTime("930"), 570);
  assert.equal(parseTime("9.30"), 570);
  assert.equal(parseTime("24:00"), 1440);
  assert.equal(parseTime("25:00"), null);
  assert.equal(parseTime("ciao"), null);
  assert.equal(atMinutes(at(2026, 11, 11), 900), at(2026, 11, 11, 15));
});

test("durate come nel mockup", () => {
  assert.equal(durationText(112 * 60), "1h 52m");
  assert.equal(durationText(68 * 60), "1h 08m");
  assert.equal(durationText(7200), "2h");
  assert.equal(durationText(90 * 60), "1h 30m");
  assert.equal(durationText(45 * 60), "45m");
  assert.equal(durationText(0), "0m");
});

// --- ricorrenze -------------------------------------------------------------------------------------------------

test("evento singolo: dentro o fuori dall'intervallo", () => {
  const e = ev({ startAt: at(2026, 11, 11, 15), endAt: at(2026, 11, 11, 16) });
  assert.equal(expandEvent(e, at(2026, 11, 11), at(2026, 11, 12)).length, 1);
  assert.equal(expandEvent(e, at(2026, 11, 12), at(2026, 11, 13)).length, 0);
  assert.equal(expandEvent(e, at(2026, 11, 11, 16), at(2026, 11, 12)).length, 0, "finisce dove l'intervallo inizia");
});

test("ogni mercoledì (Palestra): occorrenze di novembre", () => {
  const e = ev({ startAt: at(2026, 11, 4, 18, 30), endAt: at(2026, 11, 4, 19, 30), repeat: rule({ freq: "week" }) });
  const occ = expandEvent(e, at(2026, 11, 1), at(2026, 12, 1));
  assert.deepEqual(keys(occ), ["2026-11-04 18:30", "2026-11-11 18:30", "2026-11-18 18:30", "2026-11-25 18:30"]);
  assert.equal(occ[1].end - occ[1].start, H);
  assert.equal(occ[1].key, `1:${at(2026, 11, 11, 18, 30)}`);
  assert.ok(occ.every((o) => o.recurring));
});

test("settimanale con più giorni (lun e gio) e ogni 2 settimane", () => {
  const e = ev({
    startAt: at(2026, 11, 2, 15, 30),
    endAt: at(2026, 11, 2, 17, 30),
    repeat: rule({ freq: "week", interval: 2, weekdays: 0b0001001 }),
  });
  assert.deepEqual(keys(expandEvent(e, at(2026, 11, 1), at(2026, 11, 30))), [
    "2026-11-02 15:30",
    "2026-11-05 15:30",
    "2026-11-16 15:30",
    "2026-11-19 15:30",
  ]);
});

test("settimanale che inizia a metà settimana: i giorni prima dell'inizio non contano", () => {
  const e = ev({ startAt: at(2026, 11, 11, 9), endAt: at(2026, 11, 11, 10), repeat: rule({ freq: "week", weekdays: 0b0000011, count: 3 }) });
  // lun 9 e mar 10 sono prima dell'inizio (mer 11): le prime 3 sono lun 16, mar 17, lun 23
  assert.deepEqual(keys(expandEvent(e, at(2026, 11, 1), at(2026, 12, 31))), ["2026-11-16 09:00", "2026-11-17 09:00", "2026-11-23 09:00"]);
});

test("giornaliera attraverso il cambio d'ora: sempre alle 15", () => {
  const e = ev({ startAt: at(2026, 3, 27, 15), endAt: at(2026, 3, 27, 16), repeat: rule({ freq: "day" }) });
  const occ = expandEvent(e, at(2026, 3, 27), at(2026, 3, 31));
  assert.deepEqual(keys(occ), ["2026-03-27 15:00", "2026-03-28 15:00", "2026-03-29 15:00", "2026-03-30 15:00"]);
  assert.ok(occ.every((o) => o.end - o.start === H));
  const autumn = expandEvent({ ...e, startAt: at(2026, 10, 24, 8), endAt: at(2026, 10, 24, 9) }, at(2026, 10, 24), at(2026, 10, 27));
  assert.deepEqual(keys(autumn), ["2026-10-24 08:00", "2026-10-25 08:00", "2026-10-26 08:00"]);
});

test("mensile il 31: i mesi senza 31 si saltano; annuale il 29 febbraio solo negli anni bisestili", () => {
  const m = ev({ startAt: at(2026, 1, 31, 10), endAt: at(2026, 1, 31, 11), repeat: rule({ freq: "month" }) });
  assert.deepEqual(keys(expandEvent(m, at(2026, 1, 1), at(2026, 6, 1))), ["2026-01-31 10:00", "2026-03-31 10:00", "2026-05-31 10:00"]);
  const y = ev({ startAt: at(2028, 2, 29, 0), endAt: at(2028, 3, 1, 0), allDay: true, repeat: rule({ freq: "year" }) });
  assert.deepEqual(keys(expandEvent(y, at(2028, 1, 1), at(2033, 1, 1))), ["2028-02-29 00:00", "2032-02-29 00:00"]);
});

test("fine della serie: until (compreso) e count (contando anche le saltate)", () => {
  const base = { startAt: at(2026, 11, 2, 9), endAt: at(2026, 11, 2, 10) };
  const u = ev({ ...base, repeat: rule({ freq: "day", until: at(2026, 11, 4, 9) }) });
  assert.equal(expandEvent(u, at(2026, 11, 1), at(2026, 12, 1)).length, 3);
  const c = ev({ ...base, repeat: rule({ freq: "day", count: 3, exdates: [at(2026, 11, 3, 9)] }) });
  assert.deepEqual(keys(expandEvent(c, at(2026, 11, 1), at(2026, 12, 1))), ["2026-11-02 09:00", "2026-11-04 09:00"]);
});

test("occorrenza che inizia prima dell'intervallo ma ci finisce dentro", () => {
  const e = ev({ startAt: at(2026, 11, 1, 23), endAt: at(2026, 11, 2, 1), repeat: rule({ freq: "day" }) });
  assert.deepEqual(keys(expandEvent(e, at(2026, 11, 3), at(2026, 11, 4))), ["2026-11-02 23:00", "2026-11-03 23:00"]);
});

test("tutto il giorno ripetuto: sempre da mezzanotte a mezzanotte, anche col cambio d'ora", () => {
  const e = ev({ startAt: at(2026, 3, 28), endAt: at(2026, 3, 29), allDay: true, repeat: rule({ freq: "day" }) });
  const occ = expandEvent(e, at(2026, 3, 28), at(2026, 3, 31));
  assert.ok(occ.every((o) => new Date(o.end).getHours() === 0));
  assert.equal(occ[1].end - occ[1].start, 23 * H);
});

test("exdate, inizio della serie e serie spezzata", () => {
  const e = ev({ startAt: at(2026, 11, 2, 9), endAt: at(2026, 11, 2, 10), repeat: rule({ freq: "day" }) });
  const r = withExdate(e.repeat!, at(2026, 11, 3, 9));
  assert.equal(withExdate(r, at(2026, 11, 3, 9)), r, "non si duplica");
  assert.equal(expandEvent({ ...e, repeat: r }, at(2026, 11, 3), at(2026, 11, 4)).length, 0);
  assert.ok(isSeriesStart(e, at(2026, 11, 5, 9)));
  assert.ok(!isSeriesStart(e, at(2026, 11, 5, 10)));

  const { head, tail } = splitSeriesAt({ ...e, repeat: r }, at(2026, 11, 5, 9));
  assert.equal(head?.until, at(2026, 11, 5, 9) - 1);
  assert.deepEqual(head?.exdates, [at(2026, 11, 3, 9)]);
  assert.deepEqual(tail.exdates, []);
  assert.equal(splitSeriesAt(e, e.startAt).head, null, "dalla prima: cambia tutta la serie");

  const counted = ev({ ...e, repeat: rule({ freq: "day", count: 5 }) });
  const parts = splitSeriesAt(counted, at(2026, 11, 4, 9));
  assert.equal(parts.head?.count, 2);
  assert.equal(parts.tail.count, 3);
});

test("serie con occorrenze dopo un istante", () => {
  const e = ev({ startAt: at(2026, 11, 2, 9), endAt: at(2026, 11, 2, 10), repeat: rule({ freq: "day", count: 2 }) });
  assert.ok(hasOccurrencesFrom(e, at(2026, 11, 3, 8)));
  assert.ok(!hasOccurrencesFrom(e, at(2026, 11, 3, 10)));
  assert.ok(hasOccurrencesFrom({ ...e, repeat: rule({ freq: "week" }) }, at(2040, 1, 1)));
});

test("sposta tutta la serie: giorni della settimana, saltate e fine seguono l'occorrenza", () => {
  assert.equal(rotateWeekdays(0b1000001, 1), 0b0000011, "dom → lun, lun → mar");
  assert.equal(rotateWeekdays(0b0000011, -1), 0b1000001);
  assert.equal(rotateWeekdays(0, 3), 0);
  // ogni lun e mer alle 15, spostando l'occorrenza di mer 11 a gio 12 alle 16
  const e = ev({
    startAt: at(2026, 11, 2, 15),
    endAt: at(2026, 11, 2, 16),
    repeat: rule({ freq: "week", weekdays: 0b0000101, exdates: [at(2026, 11, 4, 15)], until: at(2026, 11, 30, 15) }),
  });
  const moved = shiftSeries(e, at(2026, 11, 11, 15), at(2026, 11, 12, 16));
  assert.equal(moved.startAt, at(2026, 11, 3, 16));
  assert.equal(moved.endAt, at(2026, 11, 3, 17));
  assert.equal(moved.repeat?.weekdays, 0b0001010, "mar e gio");
  assert.deepEqual(moved.repeat?.exdates, [at(2026, 11, 5, 16)]);
  assert.equal(moved.repeat?.until, at(2026, 12, 1, 16));
  const occ = expandEvent({ ...e, ...moved }, at(2026, 11, 9), at(2026, 11, 16));
  assert.deepEqual(keys(occ), ["2026-11-10 16:00", "2026-11-12 16:00"]);
  assert.equal(shiftSeries(e, e.startAt, e.startAt, 30 * MIN).endAt, at(2026, 11, 2, 15, 30), "durata nuova");
});

test("sposta tutta la serie attraverso il cambio d'ora: resta alla stessa ora", () => {
  const e = ev({ startAt: at(2026, 3, 27, 15), endAt: at(2026, 3, 27, 16), repeat: rule({ freq: "day" }) });
  const moved = shiftSeries(e, at(2026, 3, 30, 15), at(2026, 3, 30, 17));
  assert.equal(moved.startAt, at(2026, 3, 27, 17));
  assert.deepEqual(keys(expandEvent({ ...e, ...moved }, at(2026, 3, 29), at(2026, 3, 30))), ["2026-03-29 17:00"]);
});

test("ordine: per inizio, a parità prima tutto il giorno", () => {
  const timed = ev({ id: 1, startAt: at(2026, 11, 11, 0), endAt: at(2026, 11, 11, 1) });
  const allDay = ev({ id: 2, startAt: at(2026, 11, 11), endAt: at(2026, 11, 12), allDay: true });
  const later = ev({ id: 3, startAt: at(2026, 11, 11, 9), endAt: at(2026, 11, 11, 10) });
  assert.deepEqual(expandEvents([later, timed, allDay], at(2026, 11, 11), at(2026, 11, 12)).map((o) => o.event.id), [2, 1, 3]);
});

// --- mese -------------------------------------------------------------------------------------------------------

test("giorni toccati: la fine è esclusa, gli eventi di più giorni stanno in ognuno", () => {
  assert.deepEqual(occurrenceDays({ start: at(2026, 11, 11), end: at(2026, 11, 12) }), ["2026-11-11"]);
  assert.deepEqual(occurrenceDays({ start: at(2026, 11, 11, 22), end: at(2026, 11, 13, 1) }), ["2026-11-11", "2026-11-12", "2026-11-13"]);
  assert.deepEqual(occurrenceDays({ start: at(2026, 11, 11, 9), end: at(2026, 11, 11, 9) }), ["2026-11-11"]);
});

test("giorno 11 del mockup: Matematica, Palestra, nota in fondo; tutto il giorno in cima", () => {
  const days = [new Date(at(2026, 11, 11))];
  const math = ev({ id: 1, kind: "study", startAt: at(2026, 11, 11, 15), endAt: at(2026, 11, 11, 16, 30) });
  const gym = ev({ id: 2, startAt: at(2026, 11, 11, 18, 30), endAt: at(2026, 11, 11, 19, 30) });
  const party = ev({ id: 3, startAt: at(2026, 11, 11), endAt: at(2026, 11, 12), allDay: true });
  const occ = expandEvents([gym, math, party], at(2026, 11, 11), at(2026, 11, 12));
  const list = entriesByDay(days, occ, [{ id: 9, noteId: 4, day: "2026-11-11", eventId: null }]).get("2026-11-11")!;
  assert.deepEqual(
    list.map((e) => (e.kind === "note" ? "nota" : e.occurrence.event.id)),
    [3, 1, 2, "nota"]
  );
});

test("al massimo 3 righe: con 4 elementi 2 + \"+2 altro\", con 3 tutti", () => {
  assert.deepEqual(fitCell([1, 2, 3]), { shown: [1, 2, 3], more: 0 });
  assert.deepEqual(fitCell([1, 2, 3, 4]), { shown: [1, 2], more: 2 });
});

test("righe che entrano nella cella: 3 al massimo, meno se la cella è bassa, almeno 1", () => {
  assert.equal(rowsThatFit(120), 3);
  assert.equal(rowsThatFit(99), 3, "6 + 18 + 3 × 23 + 6");
  assert.equal(rowsThatFit(98), 2);
  assert.equal(rowsThatFit(80), 2);
  assert.equal(rowsThatFit(52), 1);
  assert.equal(rowsThatFit(10), 1);
  // 3 elementi in una cella da 2 righe: 1 elemento + "+2 altro"
  assert.deepEqual(fitCell([1, 2, 3], rowsThatFit(80)), { shown: [1], more: 2 });
});

// --- settimana e giorno -----------------------------------------------------------------------------------------

test("posizioni del mockup settimana (dalle 08, 46 px/h) e giorno (dalle 13, 64 px/h)", () => {
  const week = { fromMin: 8 * 60, pxPerHour: WEEK_HOUR_PX };
  assert.deepEqual(blockBox(15.5 * 60, 17.5 * 60, week), { top: 345, height: 90 });
  assert.deepEqual(blockBox(8 * 60 + 10, 9 * 60 + 10, week), { top: 8, height: 44 });
  assert.deepEqual(blockBox(15 * 60, 16.5 * 60, week), { top: 322, height: 67 });
  assert.equal(nowLineTop(at(2026, 11, 11, 16, 20), week), 382);
  const day = { fromMin: 13 * 60, pxPerHour: DAY_HOUR_PX };
  assert.deepEqual(blockBox(15 * 60, 16.5 * 60, day), { top: 128, height: 94 });
  assert.deepEqual(blockBox(18.5 * 60, 19.5 * 60, day), { top: 352, height: 62 });
  assert.equal(blockBox(9 * 60, 9 * 60 + 5, week).height, 22, "mai più basso del minimo");
});

test("parte di un evento in un giorno", () => {
  assert.deepEqual(segmentInDay(at(2026, 11, 11, 22), at(2026, 11, 12, 2), at(2026, 11, 11)), { startMin: 1320, endMin: 1440 });
  assert.deepEqual(segmentInDay(at(2026, 11, 11, 22), at(2026, 11, 12, 2), at(2026, 11, 12)), { startMin: 0, endMin: 120 });
  assert.equal(segmentInDay(at(2026, 11, 11, 22), at(2026, 11, 12, 0), at(2026, 11, 12)), null);
});

test("colonne per i blocchi che si sovrappongono", () => {
  const cols = layoutColumns([
    { key: "a", startMin: 900, endMin: 990 },
    { key: "b", startMin: 930, endMin: 960 },
    { key: "c", startMin: 960, endMin: 1020 },
    { key: "d", startMin: 1100, endMin: 1160 },
  ]);
  assert.deepEqual(cols.get("a"), { col: 0, cols: 2, group: 0 });
  assert.deepEqual(cols.get("b"), { col: 1, cols: 2, group: 0 });
  assert.deepEqual(cols.get("c"), { col: 1, cols: 2, group: 0 }, "riusa la colonna di b, finita");
  assert.deepEqual(cols.get("d"), { col: 0, cols: 1, group: 1 });
});

test("settimana: al massimo 2 affiancati, dal terzo \"+N\"", () => {
  const items = [
    { key: "a", startMin: 900, endMin: 1020 },
    { key: "b", startMin: 900, endMin: 960 },
    { key: "c", startMin: 930, endMin: 990 },
    { key: "d", startMin: 940, endMin: 1000 },
    { key: "e", startMin: 1100, endMin: 1160 },
    { key: "f", startMin: 1100, endMin: 1160 },
  ];
  const { placed, overflow } = limitColumns(items, 2);
  assert.deepEqual(placed.get("a"), { col: 0, cols: 2, group: 0 });
  assert.deepEqual(placed.get("b"), { col: 1, cols: 2, group: 0 });
  assert.equal(placed.has("c"), false);
  assert.equal(placed.has("d"), false);
  assert.deepEqual(overflow, [{ group: 0, startMin: 930, count: 2 }]);
  assert.deepEqual(placed.get("e"), { col: 0, cols: 2, group: 1 }, "due affiancati: nessun +N");
});

test("trascinamento su vuoto, spostamento e ridimensionamento a scatti di 15 minuti", () => {
  const week = { fromMin: 8 * 60, pxPerHour: WEEK_HOUR_PX };
  assert.deepEqual(rangeFromDrag(322, 389, week), { startMin: 900, endMin: 990 }, "15:00 – 16:30 come '+ Nuova sessione'");
  assert.deepEqual(rangeFromDrag(389, 322, week), { startMin: 900, endMin: 990 }, "anche verso l'alto");
  assert.deepEqual(rangeFromDrag(330, 331, week), { startMin: 900, endMin: 960 }, "un clic: un'ora");
  assert.deepEqual(moveRange(900, 990, 22), { startMin: 915, endMin: 1005 });
  assert.deepEqual(moveRange(1380, 1440, 120), { startMin: 1380, endMin: 1440 }, "resta nel giorno");
  assert.deepEqual(resizeRange(900, 990, -200), { startMin: 900, endMin: 915 });
});

// --- studio -----------------------------------------------------------------------------------------------------

test("studio fatto: 'Fatte 1h 52m su 2h' e una sessione vera conta per una sola pianificata", () => {
  const planned = [
    { key: "fis9", subjectId: 2, start: at(2026, 11, 9, 15, 30), end: at(2026, 11, 9, 17, 30) },
    { key: "fis10", subjectId: 2, start: at(2026, 11, 10, 18, 30), end: at(2026, 11, 10, 19, 30) },
    { key: "mat", subjectId: 1, start: at(2026, 11, 9, 15, 30), end: at(2026, 11, 9, 17) },
  ];
  const spans = [
    { subjectId: 2, startedAt: at(2026, 11, 9, 15, 35), endedAt: at(2026, 11, 9, 16, 35) },
    { subjectId: 2, startedAt: at(2026, 11, 9, 16, 40), endedAt: at(2026, 11, 9, 17, 32) },
    { subjectId: 2, startedAt: at(2026, 11, 10, 18, 20), endedAt: at(2026, 11, 10, 19, 28) },
    { subjectId: 2, startedAt: at(2026, 11, 9, 8), endedAt: at(2026, 11, 9, 9) }, // fuori fascia
  ];
  const done = matchStudy(planned, spans);
  assert.equal(durationText(done.get("fis9")!), "1h 52m");
  assert.equal(durationText(done.get("fis10")!), "1h 08m");
  assert.equal(done.get("mat"), 0, "altra materia");
  assert.ok(isComplete(planned[1], done.get("fis10")!));
  assert.ok(!isComplete(planned[0], done.get("fis9")!));
});

test("una sessione a cavallo di due pianificate va a quella con più sovrapposizione", () => {
  const planned = [
    { key: "a", subjectId: 1, start: at(2026, 11, 11, 14), end: at(2026, 11, 11, 15) },
    { key: "b", subjectId: 1, start: at(2026, 11, 11, 15, 30), end: at(2026, 11, 11, 17) },
  ];
  const done = matchStudy(planned, [{ subjectId: 1, startedAt: at(2026, 11, 11, 14, 50), endedAt: at(2026, 11, 11, 16, 30) }]);
  assert.equal(done.get("a"), 0);
  assert.equal(done.get("b"), 90 * 60, "il tempo dentro la sua fascia allargata (15:00–17:30): 15:00–16:30");
});

test("stati: in programma, in corso, fatta, saltata; studio in corso adesso", () => {
  const p = { subjectId: 1, start: at(2026, 11, 11, 15), end: at(2026, 11, 11, 16, 30) };
  const now = at(2026, 11, 11, 16, 20);
  assert.equal(studyState(p, 0, at(2026, 11, 11, 10), null), "planned");
  assert.equal(studyState(p, 4800, now, 1), "running");
  assert.equal(studyState(p, 4800, now, 2), "done");
  assert.equal(studyState(p, 0, at(2026, 11, 11, 17), null), "missed");
  const live = liveSpan(
    { phase: "work", mode: "stopwatch", runningSince: at(2026, 11, 11, 16), phaseTotalSeconds: 0, accumulatedSeconds: 3600, changedAt: 0 },
    1,
    now
  );
  assert.deepEqual(live, { subjectId: 1, startedAt: at(2026, 11, 11, 15), endedAt: now });
  assert.equal(liveSpan(null, 1, now), null);
  assert.equal(liveSpan({ phase: "break", mode: "pomodoro", runningSince: now, phaseTotalSeconds: 300, accumulatedSeconds: 0, changedAt: 0 }, 1, now), null);
});

// --- promemoria -------------------------------------------------------------------------------------------------

test("promemoria: 'Il giorno prima, 20:00' e '07:30' per la verifica delle 08:10", () => {
  const start = at(2026, 11, 12, 8, 10);
  assert.equal(reminderAt({ type: "at", days: 1, time: "20:00" }, start), at(2026, 11, 11, 20));
  assert.equal(reminderAt({ type: "at", days: 0, time: "07:30" }, start), at(2026, 11, 12, 7, 30));
  assert.equal(reminderAt({ type: "offset", minutes: 10 }, start), at(2026, 11, 12, 8));
  assert.equal(reminderLabel({ type: "at", days: 1, time: "20:00" }), "Il giorno prima, 20:00");
  assert.equal(reminderLabel({ type: "at", days: 0, time: "07:30" }), "07:30");
  assert.equal(reminderLabel({ type: "offset", minutes: 60 }), "1 ora prima");
});

test("promemoria da mandare, prossimo e recupero all'apertura", () => {
  const e = ev({
    startAt: at(2026, 11, 12, 8, 10),
    endAt: at(2026, 11, 12, 9, 10),
    reminders: [
      { type: "at", days: 1, time: "20:00" },
      { type: "at", days: 0, time: "07:30" },
    ],
  });
  const occ = expandEvent(e, at(2026, 11, 1), at(2026, 12, 1));
  assert.deepEqual(remindersBetween(occ, at(2026, 11, 11, 19), at(2026, 11, 11, 20)).map((r) => r.key), [`1:${e.startAt}#0`]);
  assert.equal(nextReminderAt(occ, at(2026, 11, 11, 20)), at(2026, 11, 12, 7, 30));
  // app chiusa dalle 19 dell'11 alle 7:45 del 12: escono entrambi (la verifica non è iniziata)
  assert.equal(recoverableReminders(occ, at(2026, 11, 11, 19), at(2026, 11, 12, 7, 45)).length, 2);
  // riaperta alle 9: la verifica è già iniziata, niente
  assert.equal(recoverableReminders(occ, at(2026, 11, 11, 19), at(2026, 11, 12, 9)).length, 0);
});

test("promemoria da mandare adesso: puntuali sempre, vecchi solo se l'impegno non è iniziato", () => {
  const e = ev({
    startAt: at(2026, 11, 12, 8, 10),
    endAt: at(2026, 11, 12, 9, 10),
    reminders: [
      { type: "offset", minutes: 0 },
      { type: "offset", minutes: 10 },
    ],
  });
  const occ = expandEvent(e, at(2026, 11, 1), at(2026, 12, 1));
  // controllo ogni 20 s: alle 8:00:20 esce "10 minuti prima"
  assert.deepEqual(dueReminders(occ, at(2026, 11, 12, 8) - 20_000, at(2026, 11, 12, 8) + 20_000).map((r) => r.key), [`1:${e.startAt}#1`]);
  // "all'inizio" con un minuto di ritardo esce lo stesso
  assert.deepEqual(dueReminders(occ, at(2026, 11, 12, 8, 9), at(2026, 11, 12, 8, 11)).map((r) => r.key), [`1:${e.startAt}#0`]);
  // app riaperta alle 9: niente, l'impegno è già iniziato da un pezzo
  assert.equal(dueReminders(occ, at(2026, 11, 11), at(2026, 11, 12, 9)).length, 0);
  // riaperta alle 8:05: esce solo "10 minuti prima" (quello d'inizio non è ancora l'ora)
  assert.equal(dueReminders(occ, at(2026, 11, 11), at(2026, 11, 12, 8, 5)).length, 1);
  // primo avvio (nessun controllo) o orologio indietro: niente di vecchio
  assert.equal(dueReminders(occ, null, at(2026, 11, 12, 8, 5)).length, 0);
  assert.equal(dueReminders(occ, at(2026, 12, 1), at(2026, 11, 12, 8, 5)).length, 0);
});

test("testo della notifica del promemoria", () => {
  const [o] = expandEvent(ev({ startAt: at(2026, 11, 12, 14, 30), endAt: at(2026, 11, 12, 15, 30) }), at(2026, 11, 1), at(2026, 12, 1));
  assert.equal(reminderBody(o, at(2026, 11, 12, 14, 20)), "Tra 10 minuti · 14:30 – 15:30");
  assert.equal(reminderBody(o, at(2026, 11, 12, 14, 29)), "Tra 1 minuto · 14:30 – 15:30");
  assert.equal(reminderBody(o, at(2026, 11, 12, 14, 30)), "Adesso · 14:30 – 15:30");
  assert.equal(reminderBody(o, at(2026, 11, 11, 20)), "Domani alle 14:30");
  const [all] = expandEvent(ev({ allDay: true, startAt: at(2026, 11, 12), endAt: at(2026, 11, 13) }), at(2026, 11, 1), at(2026, 12, 1));
  assert.equal(reminderBody(all, at(2026, 11, 11, 20)), "Domani · tutto il giorno");
});

test("Companion: impegno tra poco, sessione non iniziata, sessione completata", () => {
  const meeting = ev({ id: 1, title: "Riunione", startAt: at(2026, 11, 12, 10), endAt: at(2026, 11, 12, 11) });
  const study = ev({ id: 2, kind: "study", subjectId: 7, startAt: at(2026, 11, 12, 15), endAt: at(2026, 11, 12, 16) });
  const occurrences = expandEvents([meeting, study], at(2026, 11, 12), at(2026, 11, 13));
  const sKey = `2:${study.startAt}`;
  const cues = (now: number, done = 0, live: number | null = null) =>
    calendarCues({ occurrences, doneSeconds: new Map([[sKey, done]]), liveSubjectId: live, label: (o) => o.event.title || "Studio", now }).map(
      (c) => `${c.type}:${"minutes" in c ? c.minutes : ""}`
    );
  assert.deepEqual(cues(at(2026, 11, 12, 9, 50)), []);
  assert.deepEqual(cues(at(2026, 11, 12, 9, 56)), ["calendarSoon:4"]);
  assert.deepEqual(cues(at(2026, 11, 12, 10)), []);
  // 15:05 niente; 15:10 senza studio: non iniziata; col timer acceso sulla materia no
  assert.deepEqual(cues(at(2026, 11, 12, 15, 5)), []);
  assert.deepEqual(cues(at(2026, 11, 12, 15, 10)), ["plannedStudyMissed:"]);
  assert.deepEqual(cues(at(2026, 11, 12, 15, 10), 0, 7), []);
  // finita l'ora con 60 minuti fatti: completata, fino a mezz'ora dopo la fine
  assert.deepEqual(cues(at(2026, 11, 12, 16, 5), 3600), ["plannedStudyDone:60"]);
  assert.deepEqual(cues(at(2026, 11, 12, 16, 40), 3600), []);
  assert.deepEqual(cues(at(2026, 11, 12, 16, 5), 1800), []);
  // finita senza studio (anche se inserita dopo): la si fa notare fino a mezz'ora dopo la fine
  assert.deepEqual(cues(at(2026, 11, 12, 16, 12)), ["plannedStudyMissed:"]);
  assert.deepEqual(cues(at(2026, 11, 12, 16, 31)), []);
});

test("tipo promemoria: suona alla sua ora e con gli avvisi in anticipo, non se è già fatto", () => {
  const start = at(2026, 11, 12, 8);
  const r = ev({ kind: "reminder", title: "Medicina", description: "Una pastiglia\naltro", startAt: start, endAt: start, reminders: [{ type: "offset", minutes: 10 }] });
  const occ = expandEvent(r, at(2026, 11, 1), at(2026, 12, 1));
  assert.equal(occ.length, 1);
  assert.deepEqual(remindersBetween(occ, at(2026, 11, 12), at(2026, 11, 13)).map((x) => x.at), [at(2026, 11, 12, 7, 50), start]);
  assert.equal(reminderBody(occ[0], start), "Adesso · Una pastiglia");
  assert.equal(reminderBody(occ[0], at(2026, 11, 12, 7, 50)), "Tra 10 minuti · Una pastiglia");
  assert.equal(isReminderDone(occ[0]), false);
  const done = expandEvent({ ...r, done: [start] }, at(2026, 11, 1), at(2026, 12, 1));
  assert.equal(isReminderDone(done[0]), true);
  assert.equal(remindersBetween(done, at(2026, 11, 12), at(2026, 11, 13)).length, 0);
  // ogni giorno: fatto solo quello di oggi, domani suona ancora
  const daily = expandEvent({ ...r, reminders: [], repeat: rule({ freq: "day" }), done: [start] }, at(2026, 11, 12), at(2026, 11, 14));
  assert.deepEqual(daily.map(isReminderDone), [true, false]);
  assert.deepEqual(remindersBetween(daily, at(2026, 11, 12), at(2026, 11, 14)).map((x) => x.at), [at(2026, 11, 13, 8)]);
  // nel mese e nel conteggio di oggi c'è anche se dura zero (pure a mezzanotte)
  const midnight = expandEvent(ev({ kind: "reminder", startAt: at(2026, 11, 12), endAt: at(2026, 11, 12) }), at(2026, 11, 1), at(2026, 12, 1));
  assert.deepEqual(occurrenceDays(midnight[0]), ["2026-11-12"]);
  assert.equal(countToday(midnight, at(2026, 11, 12, 10)), 1);
});

// --- testi -----------------------------------------------------------------------------------------------------

test("stato delle sessioni come nel mockup", () => {
  assert.equal(studyStatusText("done", 112 * 60, 7200), "Fatte 1h 52m su 2h");
  assert.equal(studyStatusText("done", 68 * 60, 3600), "Fatta 1h 08m su 1h");
  assert.equal(studyStatusText("running", 80 * 60, 5400), "In corso · 1h 20m");
  assert.equal(studyStatusText("planned", 0, 7200), "In programma · 2h");
  assert.equal(studyStatusText("missed", 0, 3600), "Non fatta · 1h");
});

test("ripetizioni e titolo della settimana", () => {
  const wed = at(2026, 11, 11, 18, 30);
  assert.equal(repeatText(null, wed), null);
  assert.equal(repeatText(rule({ freq: "week" }), wed), "Ogni mercoledì");
  assert.equal(repeatText(rule({ freq: "week", weekdays: 0b0000101 }), wed), "Ogni lun, mer");
  assert.equal(repeatText(rule({ freq: "week", interval: 2, weekdays: 0b0000001 }), wed), "Ogni 2 settimane (lun)");
  assert.equal(repeatText(rule({ freq: "day" }), wed), "Ogni giorno");
  assert.equal(repeatText(rule({ freq: "month", interval: 3 }), wed), "Ogni 3 mesi");
  assert.deepEqual(weekTitle(new Date(wed)), { main: "9 – 15 novembre", year: "2026" });
  assert.deepEqual(weekTitle(new Date(at(2026, 12, 30))), { main: "28 dicembre – 3 gennaio", year: "2027" });
});

// --- card --------------------------------------------------------------------------------------------------------

test("card: prossimi impegni, quanti oggi, giorni occupati", () => {
  const now = at(2026, 11, 11, 16, 20);
  const evs = [
    ev({ id: 1, kind: "study", startAt: at(2026, 11, 11, 15), endAt: at(2026, 11, 11, 16, 30) }), // in corso
    ev({ id: 2, startAt: at(2026, 11, 11, 18, 30), endAt: at(2026, 11, 11, 19, 30) }),
    ev({ id: 3, startAt: at(2026, 11, 12, 8, 10), endAt: at(2026, 11, 12, 9, 10) }),
    ev({ id: 4, startAt: at(2026, 11, 11, 9), endAt: at(2026, 11, 11, 10) }), // già finito
    ev({ id: 5, startAt: at(2026, 11, 10), endAt: at(2026, 11, 12), allDay: true }), // iniziato ieri
    ev({ id: 6, startAt: at(2026, 11, 14), endAt: at(2026, 11, 15), allDay: true }),
  ];
  const occ = expandEvents(evs, at(2026, 11, 1), at(2026, 12, 1));
  assert.deepEqual(upcoming(occ, now, 3).map((o) => o.event.id), [1, 2, 3]);
  assert.deepEqual(upcoming(occ, now, 9).map((o) => o.event.id), [1, 2, 3, 6], "niente finiti, niente 'tutto il giorno' iniziati ieri");
  assert.equal(countToday(occ, now), 4, "1, 2, 4 e il tutto il giorno che copre oggi");
  const busy = busyDays(occ, [{ id: 1, noteId: 9, day: "2026-11-20", eventId: null }]);
  assert.deepEqual([...busy].sort(), ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-14", "2026-11-20"]);
  assert.equal(nearDay(at(2026, 11, 11, 23), now), "oggi");
  assert.equal(nearDay(at(2026, 11, 12, 8), now), "domani");
  assert.equal(nearDay(at(2026, 11, 13, 8), now), null);
});

// --- JSON -------------------------------------------------------------------------------------------------------

test("JSON rovinati diventano i default", () => {
  assert.equal(parseRepeat("{rotto"), null);
  assert.equal(parseRepeat(JSON.stringify({ freq: "ogni tanto" })), null);
  assert.deepEqual(parseRepeat(JSON.stringify({ freq: "week", interval: 0, weekdays: 999, exdates: [1, "x"] })), {
    freq: "week",
    interval: 1,
    weekdays: 999 & 0x7f,
    until: null,
    count: null,
    exdates: [1],
  });
  assert.deepEqual(parseReminders(JSON.stringify([{ type: "at", days: 1, time: "25:00" }, { type: "offset", minutes: 5 }])), [
    { type: "offset", minutes: 5 },
  ]);
  assert.deepEqual(parseTodos(JSON.stringify([{ text: "a", done: 1 }, { done: true }])), [{ text: "a", done: false }]);
  assert.deepEqual(parseProps(JSON.stringify({ a: 1, b: { x: 1 }, c: "t" })), { a: 1, c: "t" });
  assert.deepEqual(parseProps("[]"), {});
});

console.log(`calendario: ${passed} prove passate`);
