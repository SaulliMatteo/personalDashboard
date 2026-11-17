import { addDays, clock, durationText, isSameDay, startOfDay, weekDays, weekdayIndex } from "./dates";
import type { StudyState } from "./studyProgress";
import type { RepeatRule } from "./types";

/* Testi in italiano del Calendario (titoli, giorni, orari), puri. */

export const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
] as const;
export const WEEKDAYS_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;
export const WEEKDAYS_LONG = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"] as const;

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function weekday(d: Date): string {
  return WEEKDAYS_LONG[(d.getDay() + 6) % 7];
}

/** "Novembre" e "2026" (l'anno a parte: nel titolo è più chiaro). */
export function monthTitle(year: number, month: number): { main: string; year: string } {
  return { main: capitalize(MONTHS[month]), year: String(year) };
}

/** "9 – 15 novembre", "28 dicembre – 3 gennaio" (anno a parte: quello della domenica). */
export function weekTitle(day: Date): { main: string; year: string } {
  const days = weekDays(day);
  const a = days[0];
  const b = days[6];
  const main =
    a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()]}`
      : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
  return { main, year: String(b.getFullYear()) };
}

/** "Mercoledì 11 novembre" (anno a parte). */
export function dayTitle(day: Date): { main: string; year: string } {
  return { main: `${capitalize(weekday(day))} ${day.getDate()} ${MONTHS[day.getMonth()]}`, year: String(day.getFullYear()) };
}

/** "Giovedì 12 novembre", con l'anno solo se non è quello di `now`. */
export function longDate(day: Date | number, now: Date | number): string {
  const d = new Date(day);
  const withYear = d.getFullYear() !== new Date(now).getFullYear();
  return `${capitalize(weekday(d))} ${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;
}

/** Il numero nella cella del mese: "1 nov" il primo del mese, altrimenti solo il numero. */
export function cellDayLabel(day: Date): string {
  return day.getDate() === 1 ? `${day.getDate()} ${MONTHS[day.getMonth()].slice(0, 3)}` : String(day.getDate());
}

/** "15:00 – 16:30" */
export function rangeText(start: number, end: number): string {
  return `${clock(start)} – ${clock(end)}`;
}

/** "oggi", "domani", "ieri" o "giovedì 12" rispetto a `now`. */
export function relativeDay(day: Date | number, now: Date | number): string {
  const d = startOfDay(day);
  if (isSameDay(d, now)) return "oggi";
  if (isSameDay(d, addDays(startOfDay(now), 1))) return "domani";
  if (isSameDay(d, addDays(startOfDay(now), -1))) return "ieri";
  return `${weekday(d)} ${d.getDate()}`;
}

/**
 * Riga di stato di una sessione pianificata, come nel mockup: "Fatte 1h 52m su 2h", "Fatta 1h 08m su 1h",
 * "In corso · 1h 20m", "In programma · 2h", "Non fatta · 2h".
 */
export function studyStatusText(state: StudyState, doneSeconds: number, plannedSeconds: number): string {
  const planned = durationText(plannedSeconds);
  if (state === "running") return `In corso · ${durationText(doneSeconds)}`;
  if (state === "done") {
    // come nel mockup: "Fatta" = sessione completata (almeno il previsto), "Fatte" = ore fatte, meno del previsto
    const word = doneSeconds >= plannedSeconds ? "Fatta" : "Fatte";
    return `${word} ${durationText(doneSeconds)} su ${planned}`;
  }
  if (state === "missed") return `Non fatta · ${planned}`;
  return `In programma · ${planned}`;
}

const FREQ_EVERY: Record<RepeatRule["freq"], [string, string]> = {
  day: ["Ogni giorno", "giorni"],
  week: ["Ogni settimana", "settimane"],
  month: ["Ogni mese", "mesi"],
  year: ["Ogni anno", "anni"],
};

/** "Ogni mercoledì", "Ogni lun, mer", "Ogni 2 settimane", "Ogni giorno" (null = non si ripete). */
export function repeatText(rule: RepeatRule | null, start: number): string | null {
  if (!rule) return null;
  if (rule.freq === "week") {
    const mask = (rule.weekdays & 0x7f) || (1 << weekdayIndex(start));
    const days = [0, 1, 2, 3, 4, 5, 6].filter((i) => mask & (1 << i));
    if (rule.interval === 1) {
      if (days.length === 7) return "Ogni giorno";
      if (days.length === 1) return `Ogni ${WEEKDAYS_LONG[days[0]]}`;
      return `Ogni ${days.map((i) => WEEKDAYS_SHORT[i].toLowerCase()).join(", ")}`;
    }
    return `Ogni ${rule.interval} settimane (${days.map((i) => WEEKDAYS_SHORT[i].toLowerCase()).join(", ")})`;
  }
  const [one, many] = FREQ_EVERY[rule.freq];
  return rule.interval === 1 ? one : `Ogni ${rule.interval} ${many}`;
}

export { durationText };
