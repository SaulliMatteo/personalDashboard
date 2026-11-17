import { addDays, minutesOfDay, startOfDay, startOfWeek, weekdayIndex } from "./dates";
import type { CalendarEvent, Occurrence, RepeatRule } from "./types";

/*
 * Ricorrenze: una serie è UNA riga con la regola; le occorrenze si calcolano qui, al volo, solo nell'intervallo
 * che si guarda. Pure (niente orologio). Ogni occorrenza tiene l'ora del giorno dell'inizio anche col cambio
 * d'ora (si costruisce con new Date(a, m, g, h, min), mai sommando millisecondi).
 * "Solo questa" = l'occorrenza va negli `exdates` e diventa una riga sua (eccezione, con series_id);
 * "questa e le successive" = la serie si spezza in due con splitSeriesAt.
 */

/** Oltre questo numero di candidati si smette (una serie giornaliera di 100 anni ne ha ~36500). */
const MAX_STEPS = 50_000;

/** Giorno del mese / mese che non esiste (31 aprile, 29 febbraio non bisestile): si salta senza contarlo. */
function sameCalendarDay(d: Date, day: number, month?: number): boolean {
  return d.getDate() === day && (month === undefined || d.getMonth() === month);
}

/**
 * Gli inizi della serie in ordine, finché l'inizio è < `before`; ognuno con `n` = posizione nella serie
 * (1 = la prima), contando anche quelle saltate negli exdates (come COUNT di iCalendar).
 */
function* seriesStarts(startAt: number, rule: RepeatRule, before: number): Generator<{ start: number; n: number }> {
  const start = new Date(startAt);
  const interval = Math.max(1, Math.floor(rule.interval) || 1);
  const [h, mi, s] = [start.getHours(), start.getMinutes(), start.getSeconds()];
  const limit = Math.min(before, rule.until === null ? Infinity : rule.until + 1);
  const maxCount = rule.count === null ? Infinity : Math.max(0, rule.count);
  let n = 0;

  const emit = function* (at: Date): Generator<{ start: number; n: number }, boolean> {
    const t = at.getTime();
    if (t < startAt) return true; // prima dell'inizio (settimana del primo giorno): non è nella serie
    if (t >= limit || n >= maxCount) return false;
    n++;
    yield { start: t, n };
    return true;
  };

  for (let k = 0; k < MAX_STEPS; k++) {
    if (rule.freq === "day") {
      if (!(yield* emit(addDays(start, k * interval)))) return;
    } else if (rule.freq === "week") {
      const mask = (rule.weekdays & 0x7f) || (1 << weekdayIndex(start));
      const monday = addDays(startOfWeek(start), k * interval * 7);
      for (let i = 0; i < 7; i++) {
        if (!(mask & (1 << i))) continue;
        const day = addDays(monday, i);
        if (!(yield* emit(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi, s)))) return;
      }
    } else if (rule.freq === "month") {
      const d = new Date(start.getFullYear(), start.getMonth() + k * interval, start.getDate(), h, mi, s);
      if (!sameCalendarDay(d, start.getDate())) {
        if (d.getTime() >= limit) return;
        continue;
      }
      if (!(yield* emit(d))) return;
    } else {
      const d = new Date(start.getFullYear() + k * interval, start.getMonth(), start.getDate(), h, mi, s);
      if (!sameCalendarDay(d, start.getDate(), start.getMonth())) {
        if (d.getTime() >= limit) return;
        continue;
      }
      if (!(yield* emit(d))) return;
    }
  }
}

/** Fine dell'occorrenza che inizia a `start`: stessi giorni se "tutto il giorno", altrimenti stessa durata. */
export function occurrenceEnd(event: Pick<CalendarEvent, "startAt" | "endAt" | "allDay">, start: number): number {
  if (event.allDay) {
    const days = Math.max(1, Math.round((startOfDay(event.endAt).getTime() - startOfDay(event.startAt).getTime()) / 86_400_000));
    return addDays(startOfDay(start), days).getTime();
  }
  return start + Math.max(0, event.endAt - event.startAt);
}

/** Le occorrenze dell'evento che toccano [rangeStart, rangeEnd). Senza regola: l'evento stesso, se lo tocca. */
export function expandEvent(event: CalendarEvent, rangeStart: number, rangeEnd: number): Occurrence[] {
  const occurrence = (start: number, end: number, recurring: boolean): Occurrence => ({
    event,
    start,
    end,
    key: `${event.id}:${start}`,
    recurring,
  });
  if (!event.repeat) {
    const touches = event.startAt < rangeEnd && (event.endAt > rangeStart || (event.endAt === event.startAt && event.startAt >= rangeStart));
    return touches ? [occurrence(event.startAt, event.endAt, false)] : [];
  }
  const skipped = new Set(event.repeat.exdates);
  const out: Occurrence[] = [];
  for (const { start } of seriesStarts(event.startAt, event.repeat, rangeEnd)) {
    if (skipped.has(start)) continue;
    const end = occurrenceEnd(event, start);
    if (end > rangeStart || (end === start && start >= rangeStart)) out.push(occurrence(start, end, true));
  }
  return out;
}

/** Tutte le occorrenze nell'intervallo, in ordine: prima per inizio, a parità prima "tutto il giorno", poi le più lunghe. */
export function expandEvents(events: readonly CalendarEvent[], rangeStart: number, rangeEnd: number): Occurrence[] {
  return events
    .flatMap((e) => expandEvent(e, rangeStart, rangeEnd))
    .sort(
      (a, b) =>
        a.start - b.start ||
        Number(b.event.allDay) - Number(a.event.allDay) ||
        b.end - b.start - (a.end - a.start) ||
        a.event.id - b.event.id
    );
}

/** È un inizio di questa serie (anche se saltato)? */
export function isSeriesStart(event: Pick<CalendarEvent, "startAt" | "repeat">, at: number): boolean {
  if (!event.repeat) return at === event.startAt;
  for (const { start } of seriesStarts(event.startAt, event.repeat, at + 1)) if (start === at) return true;
  return false;
}

/** La regola con l'occorrenza `start` saltata ("elimina solo questa", o spostata in un'eccezione). */
export function withExdate(rule: RepeatRule, start: number): RepeatRule {
  return rule.exdates.includes(start) ? rule : { ...rule, exdates: [...rule.exdates, start].sort((a, b) => a - b) };
}

/**
 * "Questa e le successive" dall'occorrenza `at`: la serie vecchia finisce prima di `at` (`head`, null se `at` è
 * la prima: allora cambia tutta la serie) e una nuova parte da `at` (`tail`). Con `count` le occorrenze si
 * dividono tra le due; gli exdates vanno a chi li contiene.
 */
export function splitSeriesAt(event: Pick<CalendarEvent, "startAt" | "repeat">, at: number): { head: RepeatRule | null; tail: RepeatRule } {
  const rule = event.repeat;
  if (!rule) throw new Error("splitSeriesAt: l'evento non si ripete");
  let before = 0;
  for (const { start } of seriesStarts(event.startAt, rule, at)) if (start < at) before++;
  const tail: RepeatRule = {
    ...rule,
    count: rule.count === null ? null : Math.max(1, rule.count - before),
    exdates: rule.exdates.filter((x) => x >= at),
  };
  if (before === 0) return { head: null, tail };
  const head: RepeatRule =
    rule.count === null
      ? { ...rule, until: at - 1, exdates: rule.exdates.filter((x) => x < at) }
      : { ...rule, count: before, exdates: rule.exdates.filter((x) => x < at) };
  return { head, tail };
}

/** La serie ha ancora occorrenze che finiscono dopo `at`? (una serie rimasta vuota si può togliere) */
export function hasOccurrencesFrom(event: CalendarEvent, at: number): boolean {
  if (!event.repeat) return event.endAt > at;
  const skipped = new Set(event.repeat.exdates);
  for (const { start } of seriesStarts(event.startAt, event.repeat, Infinity)) {
    if (!skipped.has(start) && occurrenceEnd(event, start) > at) return true;
  }
  return false;
}

/** Di quanti giorni di calendario e minuti dell'orologio si sposta `from` per arrivare a `to`. */
export function wallDelta(from: number, to: number): { days: number; minutes: number } {
  const days = Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
  return { days, minutes: Math.round(minutesOfDay(to) - minutesOfDay(from)) };
}

/** L'istante spostato di `days` giorni di calendario e `minutes` minuti d'orologio (stabile col cambio d'ora). */
export function shiftInstant(at: number, days: number, minutes: number): number {
  const d = addDays(at, days);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes() + minutes, d.getSeconds()).getTime();
}

/** I giorni della settimana ruotati di `days` (lun → mar con days = 1). 0 resta 0 ("il giorno dell'inizio"). */
export function rotateWeekdays(mask: number, days: number): number {
  const shift = ((days % 7) + 7) % 7;
  const m = mask & 0x7f;
  return ((m << shift) | (m >> (7 - shift))) & 0x7f;
}

/**
 * "Sposta tutte": l'occorrenza a `from` va a `to`, e con lei tutta la serie (inizio, fine, giorni della settimana,
 * occorrenze saltate e fine della serie). `newDuration` cambia anche la durata (ms; ignorata per "tutto il giorno").
 */
export function shiftSeries(
  event: Pick<CalendarEvent, "startAt" | "endAt" | "allDay" | "repeat">,
  from: number,
  to: number,
  newDuration?: number
): { startAt: number; endAt: number; repeat: RepeatRule | null } {
  const { days, minutes } = wallDelta(from, to);
  const startAt = shiftInstant(event.startAt, days, minutes);
  const endAt =
    newDuration !== undefined && !event.allDay ? startAt + Math.max(0, newDuration) : shiftInstant(event.endAt, days, minutes);
  const rule = event.repeat;
  if (!rule) return { startAt, endAt, repeat: null };
  return {
    startAt,
    endAt,
    repeat: {
      ...rule,
      weekdays: rule.freq === "week" ? rotateWeekdays(rule.weekdays, days) : rule.weekdays,
      until: rule.until === null ? null : shiftInstant(rule.until, days, minutes),
      exdates: rule.exdates.map((x) => shiftInstant(x, days, minutes)),
    },
  };
}
