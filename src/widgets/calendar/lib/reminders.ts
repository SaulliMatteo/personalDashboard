import { addDays, clock, parseTime, startOfDay, MINUTE } from "./dates";
import { capitalize, relativeDay } from "./format";
import type { Occurrence, Reminder } from "./types";

/*
 * Promemoria: quando suonano, pure. Sul desktop il provider li manda finché l'app è aperta; quelli scaduti ad app
 * chiusa escono all'apertura solo se l'impegno non è ancora iniziato (recoverableReminders).
 */

/** L'istante del promemoria per l'occorrenza che inizia a `start` (null se il promemoria non è valido). */
export function reminderAt(reminder: Reminder, start: number): number | null {
  if (reminder.type === "offset") return start - Math.max(0, reminder.minutes) * MINUTE;
  const minutes = parseTime(reminder.time);
  if (minutes === null) return null;
  const day = addDays(startOfDay(start), -Math.max(0, reminder.days));
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes).getTime();
}

export interface DueReminder {
  /** Unica: occorrenza + posizione del promemoria (per non mandarlo due volte). */
  key: string;
  at: number;
  occurrence: Occurrence;
  reminder: Reminder;
}

/** Il promemoria (tipo) suona sempre alla sua ora, oltre agli avvisi in anticipo. */
const AT_TIME: Reminder = { type: "offset", minutes: 0 };

/** Promemoria (tipo) già spuntato come fatto: non suona più. */
export function isReminderDone(o: Occurrence): boolean {
  return o.event.kind === "reminder" && o.event.done.includes(o.start);
}

function allReminders(occurrences: readonly Occurrence[]): DueReminder[] {
  return occurrences.flatMap((occurrence) => {
    if (isReminderDone(occurrence)) return [];
    const own = occurrence.event.reminders.flatMap((reminder, i) => {
      const at = reminderAt(reminder, occurrence.start);
      return at === null ? [] : [{ key: `${occurrence.key}#${i}`, at, occurrence, reminder }];
    });
    if (occurrence.event.kind !== "reminder" || occurrence.event.reminders.some((r) => r.type === "offset" && r.minutes === 0)) return own;
    return [...own, { key: `${occurrence.key}#ora`, at: occurrence.start, occurrence, reminder: AT_TIME }];
  });
}

/** I promemoria con l'istante in (from, to], in ordine. */
export function remindersBetween(occurrences: readonly Occurrence[], from: number, to: number): DueReminder[] {
  return allReminders(occurrences)
    .filter((r) => r.at > from && r.at <= to)
    .sort((a, b) => a.at - b.at);
}

/** Scaduti tra l'ultimo controllo e adesso ma ancora utili: l'impegno non è ancora iniziato. */
export function recoverableReminders(occurrences: readonly Occurrence[], lastCheck: number, now: number): DueReminder[] {
  return remindersBetween(occurrences, lastCheck, now).filter((r) => r.occurrence.start > now);
}

/** Il prossimo istante in cui suona qualcosa dopo `now` (null = niente). */
export function nextReminderAt(occurrences: readonly Occurrence[], now: number): number | null {
  let next: number | null = null;
  for (const r of allReminders(occurrences)) if (r.at > now && (next === null || r.at < next)) next = r.at;
  return next;
}

/** Testo del promemoria come nel mockup: "Il giorno prima, 20:00", "07:30", "10 minuti prima". */
export function reminderLabel(reminder: Reminder): string {
  if (reminder.type === "offset") {
    const m = reminder.minutes;
    if (m === 0) return "All'inizio";
    if (m % 1440 === 0) return m === 1440 ? "1 giorno prima" : `${m / 1440} giorni prima`;
    if (m % 60 === 0) return m === 60 ? "1 ora prima" : `${m / 60} ore prima`;
    return m === 1 ? "1 minuto prima" : `${m} minuti prima`;
  }
  if (reminder.days === 0) return reminder.time;
  if (reminder.days === 1) return `Il giorno prima, ${reminder.time}`;
  return `${reminder.days} giorni prima, ${reminder.time}`;
}

/** Un promemoria arrivato in ritardo di così (il controllo gira ogni poco) esce lo stesso, anche a impegno iniziato. */
export const REMINDER_LATE_MS = 2 * MINUTE;

/** Fin dove guardare avanti per i promemoria: il più lontano è "2 giorni prima alle…" (fino a 3 giorni prima). */
export const REMINDER_HORIZON_MS = 4 * 24 * 60 * MINUTE;

/**
 * Cosa mandare adesso: i promemoria tra l'ultimo controllo e ora. Quelli puntuali (in ritardo al massimo di
 * REMINDER_LATE_MS) sempre; quelli più vecchi (app chiusa nel frattempo) solo se l'impegno non è ancora iniziato.
 * Senza un ultimo controllo valido (primo avvio, orologio tornato indietro) non esce niente di vecchio.
 */
export function dueReminders(occurrences: readonly Occurrence[], lastCheck: number | null, now: number): DueReminder[] {
  const from = lastCheck === null || lastCheck > now ? now : lastCheck;
  return remindersBetween(occurrences, from, now).filter((r) => r.at >= now - REMINDER_LATE_MS || r.occurrence.start > now);
}

function minutesText(m: number): string {
  return m === 1 ? "1 minuto" : `${m} minuti`;
}

/**
 * Testo della notifica: "Tra 10 minuti · 14:30 – 15:30", "Adesso · 14:30 – 15:30", "Domani alle 09:00",
 * "Giovedì 12 · tutto il giorno".
 */
export function reminderBody(occurrence: Occurrence, now: number): string {
  const { start, end, event } = occurrence;
  if (event.kind === "reminder") {
    const minutes = Math.round((start - now) / MINUTE);
    const lead = minutes <= 0 ? "Adesso" : minutes < 60 ? `Tra ${minutesText(minutes)}` : `${capitalize(relativeDay(start, now))} alle ${clock(start)}`;
    const desc = event.description.trim().split("\n")[0];
    return desc ? `${lead} · ${desc}` : lead;
  }
  if (event.allDay) return `${capitalize(relativeDay(start, now))} · tutto il giorno`;
  const range = `${clock(start)} – ${clock(end)}`;
  const minutes = Math.round((start - now) / MINUTE);
  if (minutes <= 0) return `Adesso · ${range}`;
  if (minutes < 60) return `Tra ${minutesText(minutes)} · ${range}`;
  return `${capitalize(relativeDay(start, now))} alle ${clock(start)}`;
}
