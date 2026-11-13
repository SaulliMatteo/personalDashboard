/*
 * Prove della logica pura di Tempo al PC (widgets/screentime/lib/): divisione per ore e giorni, sessioni e promemoria
 * della pausa, classi e serie del focus, avvisi dei limiti, riepilogo del giorno. Orari nell'ora locale.
 * Lancio (dalla cartella del repo):
 *   npx rolldown scripts/screentime/logic.test.mts --file node_modules/.tmp/st-logic.test.mjs --platform node
 *   node node_modules/.tmp/st-logic.test.mjs
 */
import assert from "node:assert/strict";
import { countedIntervals, dayBounds, dayKey, segmentsToDeltas, shiftDay, weekStart } from "../../src/widgets/screentime/lib/aggregate";
import type { ClassifiedSegment } from "../../src/widgets/screentime/lib/classify";
import { BREAK_MS, breakReminderStep, breakStats, continuousMinutes, extendSessions, longestGap } from "../../src/widgets/screentime/lib/sessions";
import { DEFAULT_CLASSES, focusStreak, parseFocusClasses, serializeFocusClasses } from "../../src/widgets/screentime/lib/focus";
import { dueNotices, emptyNoticeState, parseNoticeState, type ScreenLimit } from "../../src/widgets/screentime/lib/limits";
import { dailyTotals, limitUsage, summarize, type UsageRow } from "../../src/widgets/screentime/lib/summary";
import { formatDayLabel, formatDelta, formatDuration, formatShort, formatWeekLabel, weekdayShort } from "../../src/widgets/screentime/lib/format";

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
const at = (h: number, m = 0, day = 13) => new Date(2026, 10, day, h, m).getTime();

function seg(start: number, end: number, over: Partial<ClassifiedSegment> = {}): ClassifiedSegment {
  return { startMs: start, endMs: end, appKey: "code", appLabel: "VS Code", site: "", category: "coding", counted: true, ...over };
}

test("un segmento dentro un'ora: una riga", () => {
  const rows = segmentsToDeltas([seg(at(9, 10), at(9, 40))]);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].day, rows[0].hour, rows[0].seconds], ["2026-11-13", 9, 1800]);
  assert.equal(rows[0].firstAt, at(9, 10));
  assert.equal(rows[0].lastAt, at(9, 40));
});

test("spezzato sui cambi d'ora e sulla mezzanotte", () => {
  const rows = segmentsToDeltas([seg(at(23, 50, 12), at(0, 20, 13))]);
  assert.deepEqual(
    rows.map((r) => [r.day, r.hour, r.seconds]),
    [["2026-11-12", 23, 600], ["2026-11-13", 0, 1200]]
  );
});

test("righe uguali si sommano; via dal PC non conta; app e siti separati", () => {
  const rows = segmentsToDeltas([
    seg(at(10), at(10, 10)),
    seg(at(10, 10), at(10, 20), { counted: false }),
    seg(at(10, 20), at(10, 30)),
    seg(at(10, 30), at(10, 45), { appKey: "chrome", appLabel: "Chrome", site: "YouTube", category: "video" }),
  ]);
  const code = rows.find((r) => r.appKey === "code")!;
  assert.equal(code.seconds, 1200);
  assert.equal(code.firstAt, at(10));
  assert.equal(code.lastAt, at(10, 30));
  assert.equal(rows.find((r) => r.site === "YouTube")!.seconds, 900);
  assert.equal(rows.length, 2);
  assert.deepEqual(countedIntervals([seg(at(11), at(11, 5)), seg(at(10), at(10, 5), { counted: false }), seg(at(9), at(9, 5))]), [
    [at(9), at(9, 5)],
    [at(11), at(11, 5)],
  ]);
  assert.equal(dayKey(at(0, 0, 1)), "2026-11-01");
});

test("sessioni: una pausa di 5 minuti divide, meno no", () => {
  let r = extendSessions(null, [[at(9), at(9, 30)], [at(9, 34), at(10)]]);
  assert.deepEqual(r.current, { startAt: at(9), endAt: at(10) });
  assert.equal(r.closed.length, 0);
  r = extendSessions(r.current, [[at(10, 5), at(10, 20)]]);
  assert.deepEqual(r.closed, [{ startAt: at(9), endAt: at(10) }]);
  assert.deepEqual(r.current, { startAt: at(10, 5), endAt: at(10, 20) });
  assert.equal(BREAK_MS, 5 * MIN);
});

test("minuti senza pausa e promemoria a gradini", () => {
  const s = { startAt: at(9), endAt: at(9, 50) };
  assert.equal(continuousMinutes(s, at(9, 51)), 50);
  assert.equal(continuousMinutes(s, at(9, 56)), 0);
  assert.equal(continuousMinutes(null, at(9)), 0);
  assert.equal(breakReminderStep(49, 50, 0), null);
  assert.equal(breakReminderStep(50, 50, 0), 1);
  assert.equal(breakReminderStep(70, 50, 1), null);
  assert.equal(breakReminderStep(100, 50, 1), 2);
  assert.equal(breakReminderStep(500, 0, 0), null);
  const stats = breakStats([{ startAt: at(14), endAt: at(15) }, { startAt: at(9), endAt: at(11) }, { startAt: at(11, 10), endAt: at(12) }]);
  assert.equal(stats.breaks, 2);
  assert.deepEqual(stats.longest, { startAt: at(9), endAt: at(11) });
});

test("classi del focus: default, scelte, testo corto", () => {
  assert.equal(parseFocusClasses("").coding, "focus");
  const c = parseFocusClasses("chat=focus;video=neutral;sbagliata=fun;game=boh");
  assert.equal(c.chat, "focus");
  assert.equal(c.video, "neutral");
  assert.equal(c.game, "fun");
  assert.equal(serializeFocusClasses(c), "chat=focus;video=neutral");
  assert.equal(serializeFocusClasses(DEFAULT_CLASSES), "");
});

test("serie del focus: i giorni senza PC non la rompono, oggi conta se già raggiunto", () => {
  const goal = 4 * 3600;
  const d = (total: number, focus: number) => ({ total: total * 3600, focus: focus * 3600 });
  assert.equal(focusStreak([d(3, 1), d(6, 5), d(0, 0), d(7, 4.5), d(5, 2)], goal), 2);
  assert.equal(focusStreak([d(6, 4), d(6, 5)], goal), 2);
  assert.equal(focusStreak([d(6, 5)], 0), 0);
});

const limit = (over: Partial<ScreenLimit>): ScreenLimit => ({ id: 1, kind: "site", target: "YouTube", label: "YouTube", minutes: 60, warn: true, ...over });

test("limiti: 80 % una volta, poi lo scadere; giorno nuovo riparte", () => {
  const l = limit({});
  let state = emptyNoticeState("2026-11-13");
  let r = dueNotices([l], () => 40 * 60, state, "2026-11-13");
  assert.equal(r.notices.length, 0);
  r = dueNotices([l], () => 49 * 60, r.state, "2026-11-13");
  assert.deepEqual(r.notices.map((n) => n.level), ["near"]);
  r = dueNotices([l], () => 55 * 60, r.state, "2026-11-13");
  assert.equal(r.notices.length, 0);
  r = dueNotices([l], () => 60 * 60, r.state, "2026-11-13");
  assert.deepEqual(r.notices.map((n) => n.level), ["over"]);
  r = dueNotices([l], () => 90 * 60, r.state, "2026-11-13");
  assert.equal(r.notices.length, 0);
  state = r.state;
  r = dueNotices([l], () => 50 * 60, state, "2026-11-14");
  assert.deepEqual(r.notices.map((n) => n.level), ["near"]);
  assert.equal(r.state.day, "2026-11-14");
});

test("limiti: già superato alla prima occhiata = solo lo scadere; senza avviso all'80 %", () => {
  const r = dueNotices([limit({}), limit({ id: 2, warn: false, minutes: 100 })], () => 85 * 60, emptyNoticeState("d"), "d");
  assert.deepEqual(r.notices.map((n) => [n.limit.id, n.level]), [[1, "over"]]);
  assert.equal(parseNoticeState("rotto"), null);
  assert.deepEqual(parseNoticeState(JSON.stringify(r.state)), r.state);
});

const row = (over: Partial<UsageRow>): UsageRow => ({
  day: "2026-11-13", hour: 9, appKey: "code", site: "", appLabel: "VS Code", category: "coding", seconds: 3600, firstAt: at(9), lastAt: at(10), ...over,
});

test("riepilogo: classi, ore, app con i siti dentro, siti, più usati", () => {
  const rows = [
    row({}),
    row({ hour: 10, appKey: "chrome", appLabel: "Chrome", site: "YouTube", category: "video", seconds: 1800, firstAt: at(10), lastAt: at(10, 30) }),
    row({ hour: 10, appKey: "chrome", appLabel: "Chrome", site: "GitHub", category: "coding", seconds: 600, firstAt: at(10, 30), lastAt: at(10, 40) }),
    row({ hour: 11, appKey: "discord", appLabel: "Discord", category: "chat", seconds: 300, firstAt: at(11), lastAt: at(11, 5) }),
  ];
  const ctx = { manual: new Map(), classes: DEFAULT_CLASSES };
  const s = summarize(rows, ctx);
  assert.equal(s.total, 6300);
  assert.deepEqual(s.byClass, { focus: 4200, fun: 1800, neutral: 300 });
  assert.deepEqual(s.hours[10], { focus: 600, fun: 1800, neutral: 0 });
  assert.deepEqual(s.apps.map((a) => [a.key, a.seconds]), [["code", 3600], ["chrome", 2400], ["discord", 300]]);
  assert.equal(s.apps[1].cls, "fun", "il browser ha la classe del tempo più lungo");
  assert.deepEqual(s.sites.map((x) => x.label), ["YouTube", "GitHub"]);
  assert.deepEqual(s.top.map((x) => x.label), ["VS Code", "YouTube", "GitHub", "Discord"]);
  assert.equal(s.firstAt, at(9));
  assert.equal(s.lastAt, at(11, 5));

  const withChoice = summarize(rows, { manual: new Map([["web:youtube", "office" as const]]), classes: DEFAULT_CLASSES });
  assert.equal(withChoice.byClass.fun, 0, "la scelta a mano vale anche per i giorni salvati");

  const totals = dailyTotals([...rows, row({ day: "2026-11-12", seconds: 100 })], ctx);
  assert.equal(totals.get("2026-11-12")!.total, 100);
  assert.equal(totals.get("2026-11-13")!.byClass.focus, 4200);

  assert.equal(limitUsage(rows, limit({}), ctx.manual), 1800);
  assert.equal(limitUsage(rows, limit({ kind: "app", target: "chrome" }), ctx.manual), 2400);
  assert.equal(limitUsage(rows, limit({ kind: "category", target: "coding" }), ctx.manual), 4200);
});

test("durate in italiano", () => {
  assert.equal(formatDuration(312 * 60), "5 h 12 min");
  assert.equal(formatDuration(120 * 60), "2 h");
  assert.equal(formatDuration(59), "0 min");
  assert.equal(formatShort(65 * 60), "1 h 05");
  assert.equal(formatDelta(40 * 60, "ieri"), "+40 min da ieri");
  assert.equal(formatDelta(-65 * 60, "ieri"), "−1 h 5 min da ieri");
  assert.equal(formatDelta(20, "ieri"), "come ieri");
});

test("giorni: spostamenti, settimana dal lunedì, mezzanotti", () => {
  assert.equal(shiftDay("2026-11-30", 1), "2026-12-01");
  assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDay("2026-03-29", 1), "2026-03-30", "cambio dell'ora legale");
  assert.equal(weekStart("2026-11-13"), "2026-11-09", "venerdì → lunedì");
  assert.equal(weekStart("2026-11-15"), "2026-11-09", "domenica → lunedì prima");
  assert.equal(weekStart("2026-11-09"), "2026-11-09");
  const [from, to] = dayBounds("2026-11-13");
  assert.equal(from, at(0, 0, 13));
  assert.equal(to, at(0, 0, 14));
});

test("pausa più lunga tra le sessioni del giorno", () => {
  const s = [
    { startAt: at(14, 2), endAt: at(17, 24) },
    { startAt: at(8, 6), endAt: at(10, 50) },
    { startAt: at(10, 58), endAt: at(13, 10) },
  ];
  assert.deepEqual(longestGap(s, at(0), at(0, 0, 14)), { startAt: at(13, 10), endAt: at(14, 2) });
  assert.equal(longestGap([s[0]], at(0), at(0, 0, 14)), null);
  // la sessione di ieri sera tagliata a mezzanotte non crea una "pausa" dalla mezzanotte
  const cross = [{ startAt: at(23, 0, 12), endAt: at(0, 30, 13) }, { startAt: at(9), endAt: at(10) }];
  assert.deepEqual(longestGap(cross, at(0), at(0, 0, 14)), { startAt: at(0, 30), endAt: at(9) });
});

test("etichette delle date", () => {
  assert.equal(formatDayLabel("2026-11-13", "2026-11-13", "2026-11-12"), "Oggi, venerdì 13 novembre");
  assert.equal(formatDayLabel("2026-11-12", "2026-11-13", "2026-11-12"), "Ieri, giovedì 12 novembre");
  assert.equal(formatDayLabel("2026-11-11", "2026-11-13", "2026-11-12"), "Mercoledì 11 novembre");
  assert.equal(formatDayLabel("2025-12-31", "2026-01-02", "2026-01-01"), "Mercoledì 31 dicembre 2025");
  assert.equal(formatWeekLabel("2026-11-09", "2026-11-15"), "9 – 15 novembre");
  assert.equal(formatWeekLabel("2026-10-26", "2026-11-01"), "26 ottobre – 1 novembre");
  assert.equal(formatWeekLabel("2025-12-29", "2026-01-04"), "29 dicembre 2025 – 4 gennaio 2026");
  assert.equal(weekdayShort("2026-11-09"), "lun");
});

console.log(`logic: ${passed} prove passate`);
