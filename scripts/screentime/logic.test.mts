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
import { blockTargets, dueNotices, emptyExtensions, emptyNoticeState, extensionEnd, isBlocking, parseExtensions, parseNoticeState, type ScreenLimit } from "../../src/widgets/screentime/lib/limits";
import { dailyTotals, limitApps, limitUsage, summarize, type UsageRow } from "../../src/widgets/screentime/lib/summary";
import { byDevice, devicesIn, parseDeviceFilter } from "../../src/widgets/screentime/lib/devices";
import { formatDayLabel, formatDelta, formatDuration, formatShort, formatWeekLabel, weekdayShort } from "../../src/widgets/screentime/lib/format";
import { dayMoments, deltaWords, mixWords, moodWord, pickAlert } from "../../src/widgets/screentime/lib/widgetText";

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
  return { startMs: start, endMs: end, appKey: "code", appLabel: "VS Code", category: "coding", counted: true, ...over };
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

test("righe uguali si sommano; via dal PC non conta; app separate", () => {
  const rows = segmentsToDeltas([
    seg(at(10), at(10, 10)),
    seg(at(10, 10), at(10, 20), { counted: false }),
    seg(at(10, 20), at(10, 30)),
    seg(at(10, 30), at(10, 45), { appKey: "chrome", appLabel: "Chrome", category: "browser" }),
  ]);
  const code = rows.find((r) => r.appKey === "code")!;
  assert.equal(code.seconds, 1200);
  assert.equal(code.firstAt, at(10));
  assert.equal(code.lastAt, at(10, 30));
  assert.equal(rows.find((r) => r.appKey === "chrome")!.seconds, 900);
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

const limit = (over: Partial<ScreenLimit>): ScreenLimit => ({ id: 1, kind: "app", target: "chrome", label: "Chrome", minutes: 60, warn: true, block: false, ...over });

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
  device: "computer", local: true, day: "2026-11-13", hour: 9, appKey: "code", appLabel: "VS Code", category: "coding", seconds: 3600, firstAt: at(9), lastAt: at(10), ...over,
});

test("riepilogo: classi, ore, app dalla più usata", () => {
  const rows = [
    row({}),
    row({ hour: 10, appKey: "chrome", appLabel: "Chrome", category: "browser", seconds: 1800, firstAt: at(10), lastAt: at(10, 30) }),
    row({ hour: 10, appKey: "spotify", appLabel: "Spotify", category: "music", seconds: 600, firstAt: at(10, 30), lastAt: at(10, 40) }),
    row({ hour: 11, appKey: "discord", appLabel: "Discord", category: "chat", seconds: 300, firstAt: at(11), lastAt: at(11, 5) }),
  ];
  const ctx = { manual: new Map(), classes: DEFAULT_CLASSES };
  const s = summarize(rows, ctx);
  assert.equal(s.total, 6300);
  assert.deepEqual(s.byClass, { focus: 3600, fun: 600, neutral: 2100 });
  assert.deepEqual(s.hours[10], { focus: 0, fun: 600, neutral: 1800 });
  assert.deepEqual(s.apps.map((a) => [a.key, a.seconds, a.cls]), [["code", 3600, "focus"], ["chrome", 1800, "neutral"], ["spotify", 600, "fun"], ["discord", 300, "neutral"]]);
  assert.equal(s.firstAt, at(9));
  assert.equal(s.lastAt, at(11, 5));

  const withChoice = summarize(rows, { manual: new Map([["chrome", "video" as const]]), classes: DEFAULT_CLASSES });
  assert.equal(withChoice.byClass.fun, 2400, "la scelta a mano vale anche per i giorni salvati");

  const totals = dailyTotals([...rows, row({ day: "2026-11-12", seconds: 100 })], ctx);
  assert.equal(totals.get("2026-11-12")!.total, 100);
  assert.equal(totals.get("2026-11-13")!.byClass.focus, 3600);

  assert.equal(limitUsage(rows, limit({}), ctx.manual), 1800);
  assert.equal(limitUsage(rows, limit({ kind: "category", target: "coding" }), ctx.manual), 3600);
});

test("dispositivi: stessa app su PC e telefono è una riga, divisa per dispositivo; i limiti contano solo qui", () => {
  const rows = [
    row({ appKey: "discord", appLabel: "Discord", category: "chat", seconds: 1320 }),
    row({ device: "phone", local: false, appKey: "discord", appLabel: "Discord", category: "chat", seconds: 600 }),
    row({ device: "phone", local: false, appKey: "instagram", appLabel: "Instagram", category: "social", seconds: 2880 }),
  ];
  const ctx = { manual: new Map(), classes: DEFAULT_CLASSES };
  const all = summarize(rows, ctx);
  assert.deepEqual(all.byDevice, { computer: 1320, phone: 3480 });
  assert.deepEqual(all.apps.map((a) => [a.key, a.seconds, a.byDevice]), [
    ["instagram", 2880, { computer: 0, phone: 2880 }],
    ["discord", 1920, { computer: 1320, phone: 600 }],
  ]);
  assert.equal(summarize(byDevice(rows, "computer"), ctx).total, 1320);
  assert.equal(summarize(byDevice(rows, "phone"), ctx).apps.length, 2);
  assert.deepEqual([...devicesIn(rows)].sort(), ["computer", "phone"]);
  assert.equal(limitUsage(rows, limit({ target: "discord" }), ctx.manual), 1320, "il telefono non conta per i limiti del PC");
  assert.equal(parseDeviceFilter("phone"), "phone");
  assert.equal(parseDeviceFilter("tablet"), "all");
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

test("widget: la giornata a parole e in 6 momenti", () => {
  assert.equal(moodWord({ focus: 152, fun: 30, neutral: 130 }), "concentrato");
  assert.equal(moodWord({ focus: 50, fun: 100, neutral: 150 }), "tanto svago");
  assert.equal(moodWord({ focus: 100, fun: 50, neutral: 150 }), "misto");
  assert.equal(moodWord({ focus: 0, fun: 0, neutral: 0 }), "si comincia");
  assert.deepEqual(mixWords({ focus: 152, fun: 30, neutral: 130 }), { focus: "metà focus", fun: "quasi niente svago" });
  assert.deepEqual(mixWords({ focus: 0, fun: 0, neutral: 0 }), { focus: "poco focus", fun: "quasi niente svago" });
  const hours = Array.from({ length: 24 }, (_, h) => ({ focus: h === 9 ? 3600 : 0, fun: h === 17 ? 600 : 0, neutral: h === 23 ? 60 : 0 }));
  const m = dayMoments(hours);
  assert.equal(m.length, 6);
  assert.deepEqual(m[2], { focus: 3600, fun: 0, neutral: 0 });
  assert.deepEqual(m[4], { focus: 0, fun: 600, neutral: 0 });
  assert.deepEqual(m[5], { focus: 0, fun: 0, neutral: 60 });
  assert.equal(deltaWords(2400), "40 min più di ieri");
  assert.equal(deltaWords(-3900), "1 h 5 min meno di ieri");
  assert.equal(deltaWords(20), "come ieri");
});

test("widget: un solo avviso, il più urgente", () => {
  const lim = (id: number, label: string, minutes: number): ScreenLimit => ({ id, kind: "app", target: label, label, minutes, warn: true, block: false });
  const base = { limits: [], continuousMinutes: 0, breakMinutes: 50, needsAccess: false };
  assert.equal(pickAlert(base), null);
  // sotto l'80 % niente; il più vicino a finire vince
  const limits = [
    { limit: lim(1, "Opera", 120), usedSeconds: 90 * 60 },
    { limit: lim(2, "Discord", 60), usedSeconds: 55 * 60 },
    { limit: lim(3, "Giochi", 60), usedSeconds: 10 * 60 },
  ];
  assert.deepEqual(pickAlert({ ...base, limits, continuousMinutes: 90, needsAccess: true }), { kind: "limit", label: "Discord", leftSeconds: 300 });
  assert.deepEqual(pickAlert({ ...base, limits: [{ limit: lim(1, "Opera", 60), usedSeconds: 70 * 60 }] }), { kind: "limit", label: "Opera", leftSeconds: 0 });
  // poi la pausa (solo oltre i minuti scelti, spenta con 0), poi il permesso del telefono
  assert.deepEqual(pickAlert({ ...base, continuousMinutes: 50, needsAccess: true }), { kind: "pause", minutes: 50 });
  assert.equal(pickAlert({ ...base, continuousMinutes: 49 }), null);
  assert.equal(pickAlert({ ...base, continuousMinutes: 90, breakMinutes: 0 }), null);
  assert.deepEqual(pickAlert({ ...base, needsAccess: true }), { kind: "access" });
});

test("blocco: chi blocca, proroga una volta al giorno", () => {
  const now = Date.UTC(2026, 10, 17, 15);
  const opera = limit({ id: 1, target: "opera", label: "Opera", minutes: 120, block: true });
  const giochi = limit({ id: 2, kind: "category", target: "game", label: "Giochi", minutes: 60, block: true });
  const avviso = limit({ id: 3, target: "discord", label: "Discord", minutes: 30, block: false });
  const none = emptyExtensions("d");
  // solo i limiti col blocco e finiti
  assert.equal(isBlocking(opera, 119 * 60, none, "d", now), false);
  assert.equal(isBlocking(opera, 120 * 60, none, "d", now), true);
  assert.equal(isBlocking(avviso, 99 * 60, none, "d", now), false);
  const apps = (l: ScreenLimit) => (l.kind === "app" ? [{ key: l.target, label: l.label }] : [{ key: "steam", label: "Steam" }, { key: "opera", label: "Opera" }]);
  const status = [
    { limit: opera, usedSeconds: 125 * 60 },
    { limit: giochi, usedSeconds: 90 * 60 },
    { limit: avviso, usedSeconds: 99 * 60 },
  ];
  const t = blockTargets(status, apps, none, "d", now);
  assert.deepEqual(t.map((x) => [x.key, x.limitId, x.canExtend]).sort(), [["opera", 2, true], ["steam", 2, true]]);
  // proroga in corso: quel limite non blocca; finita: blocca ma senza seconda proroga
  const ext = { day: "d", until: { 2: now + 5 * MIN } };
  assert.equal(extensionEnd(ext, 2, "d", now), now + 5 * MIN);
  const during = blockTargets(status, apps, ext, "d", now);
  assert.deepEqual(during.map((x) => [x.key, x.limitId, x.canExtend]), [["opera", 1, true]]);
  const after = blockTargets(status, apps, ext, "d", now + 6 * MIN);
  assert.equal(after.find((x) => x.key === "steam")?.canExtend, false);
  // il giorno dopo si riparte
  assert.deepEqual(parseExtensions(JSON.stringify(ext), "e"), emptyExtensions("e"));
  assert.deepEqual(parseExtensions("{rotto", "d"), emptyExtensions("d"));
  assert.equal(blockTargets(status, apps, ext, "e", now + 6 * MIN).find((x) => x.key === "steam")?.canExtend, true);
});

test("blocco: le app di una categoria", () => {
  const row = (appKey: string, category: string, local = true): UsageRow => ({
    device: "computer", local, day: "d", hour: 9, appKey, appLabel: appKey.toUpperCase(), category, seconds: 60, firstAt: 0, lastAt: 0,
  });
  const rows = [row("steam", "game"), row("code", "code"), row("__self", "game"), row("epic", "game", false), row("vlc", "video")];
  const manual = new Map([["vlc", "game" as const]]);
  const giochi = limit({ kind: "category", target: "game", label: "Giochi", block: true });
  assert.deepEqual(limitApps(giochi, rows, manual).map((a) => a.key).sort(), ["steam", "vlc"]);
  const browser = limitApps(limit({ kind: "category", target: "browser", label: "Browser", block: true }), [], new Map());
  assert.ok(browser.some((a) => a.key === "opera") && browser.some((a) => a.key === "chrome"));
  assert.deepEqual(limitApps(limit({ target: "opera", label: "Opera" }), [], new Map()), [{ key: "opera", label: "Opera" }]);
});

test("widget: l'avviso del blocco viene prima", () => {
  const now = 1_000_000;
  const lim = limit({ target: "opera", label: "Opera", minutes: 60, block: true });
  const base = { continuousMinutes: 90, breakMinutes: 50, needsAccess: false, now };
  assert.deepEqual(pickAlert({ ...base, limits: [{ limit: lim, usedSeconds: 3600, blocked: true, extendedUntil: null }] }), { kind: "blocked", label: "Opera" });
  assert.deepEqual(pickAlert({ ...base, limits: [{ limit: lim, usedSeconds: 3600, blocked: false, extendedUntil: now + 12 * MIN }] }), {
    kind: "extended",
    label: "Opera",
    leftSeconds: 720,
  });
});

console.log(`logic: ${passed} prove passate`);
