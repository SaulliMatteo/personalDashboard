/*
 * Date del Calendario, pure (niente orologio: chi chiama passa "adesso").
 * Tutto in ora LOCALE e sempre con new Date(a, m, g, h, min): così il passaggio all'ora legale non sposta i giorni
 * (un giorno può durare 23 o 25 ore, non si somma mai 24 * 3600 * 1000).
 * Settimane da lunedì a domenica.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

/** "YYYY-MM-DD" del giorno locale. */
export function dayKey(at: number | Date): string {
  const d = new Date(at);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const g = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${g}`;
}

/** Mezzanotte locale del giorno "YYYY-MM-DD" (null se la chiave non è valida). */
export function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dayKey(d) === key ? d : null;
}

export function startOfDay(at: number | Date): Date {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Stessa ora del giorno, `n` giorni dopo (o prima). */
export function addDays(at: number | Date, n: number): Date {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

export function isSameDay(a: number | Date, b: number | Date): boolean {
  return dayKey(a) === dayKey(b);
}

/** 0 = lunedì … 6 = domenica. */
export function weekdayIndex(at: number | Date): number {
  return (new Date(at).getDay() + 6) % 7;
}

/** Lunedì (mezzanotte) della settimana che contiene il giorno. */
export function startOfWeek(at: number | Date): Date {
  const d = startOfDay(at);
  return addDays(d, -weekdayIndex(d));
}

/** I 7 giorni (mezzanotte) della settimana che contiene il giorno. */
export function weekDays(at: number | Date): Date[] {
  const monday = startOfWeek(at);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * La griglia del mese: sempre 6 righe × 7 giorni (42 mezzanotti), dal lunedì della settimana del giorno 1.
 * Un mese che sta in 5 righe (o 4) è completato dai giorni del mese dopo, come nel mockup.
 */
export function monthGrid(year: number, month: number): Date[] {
  const first = startOfWeek(new Date(year, month, 1));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** Minuti dalla mezzanotte locale (0..1439, con i decimali dei secondi). */
export function minutesOfDay(at: number | Date): number {
  const d = new Date(at);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** L'istante del giorno `day` alle `minutes` dalla mezzanotte (anche oltre 1440: il giorno dopo). */
export function atMinutes(day: number | Date, minutes: number): number {
  const d = startOfDay(day);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes).getTime();
}

/** "HH:MM" → minuti dalla mezzanotte (null se non valido). Accetta anche "9", "930", "9.30". */
export function parseTime(text: string): number | null {
  const t = text.trim().replace(".", ":");
  let h: number;
  let m: number;
  const colon = /^(\d{1,2}):(\d{2})$/.exec(t);
  const digits = /^(\d{1,4})$/.exec(t);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (digits) {
    const s = digits[1];
    if (s.length <= 2) {
      h = Number(s);
      m = 0;
    } else {
      h = Number(s.slice(0, s.length - 2));
      m = Number(s.slice(-2));
    }
  } else {
    return null;
  }
  if (h > 23 || m > 59) return h === 24 && m === 0 ? 1440 : null;
  return h * 60 + m;
}

/** Minuti dalla mezzanotte → "HH:MM". */
export function timeText(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "HH:MM" dell'istante. */
export function clock(at: number | Date): string {
  return timeText(minutesOfDay(at));
}

/**
 * Durata in testo come nel mockup: "45m", "2h", "1h 30m", "1h 08m" (minuti a due cifre se ci sono le ore).
 * Arrotonda al minuto.
 */
export function durationText(seconds: number): string {
  const totalMin = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Arrotonda un istante ai `step` minuti più vicini (dentro il suo giorno). */
export function snapMinutes(minutes: number, step: number): number {
  return Math.round(minutes / step) * step;
}

/** Minuti di partenza per un elemento nuovo nel giorno: l'ora piena dopo adesso se è oggi, altrimenti le 9. */
export function defaultStartMinutes(day: number | Date, now: number | Date): number {
  if (!isSameDay(day, now)) return 9 * 60;
  return Math.min(23 * 60, Math.ceil((minutesOfDay(now) + 1) / 60) * 60);
}
