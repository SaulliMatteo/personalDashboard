import type { Subject } from "../data/studyRepository";

/*
 * Piano settimanale delle materie. Funzioni pure (la data si passa sempre da fuori), così
 * si provano con node: scripts/studio/schedule.test.mts.
 */

type Plan = Pick<Subject, "studyDays" | "dailyGoalMinutes">;

/** I giorni nell'ordine della settimana italiana: l'indice è il bit in `studyDays`. */
export const WEEKDAYS = [
  { initial: "L", short: "lun", name: "lunedì" },
  { initial: "M", short: "mar", name: "martedì" },
  { initial: "M", short: "mer", name: "mercoledì" },
  { initial: "G", short: "gio", name: "giovedì" },
  { initial: "V", short: "ven", name: "venerdì" },
  { initial: "S", short: "sab", name: "sabato" },
  { initial: "D", short: "dom", name: "domenica" },
] as const;

/** Indice del giorno nella settimana italiana: 0 = lunedì … 6 = domenica. */
function weekdayIndex(date: Date): number {
  // Date.getDay() conta da domenica (0 = domenica, 1 = lunedì…): spostando di 6 (mod 7) lunedì va a 0 e domenica a 6.
  return (date.getDay() + 6) % 7;
}

/** Bit del giorno locale di `date` in `studyDays`: lunedì = 1<<0 … domenica = 1<<6. */
export function weekdayBit(date: Date): number {
  return 1 << weekdayIndex(date);
}

/** Vero se la materia va studiata quel giorno; nessun giorno scelto (0) = ogni giorno. */
export function isScheduledOn(subject: Plan, date: Date): boolean {
  return subject.studyDays === 0 || (subject.studyDays & weekdayBit(date)) !== 0;
}

/**
 * Obiettivo del giorno in secondi: somma degli obiettivi delle materie previste quel giorno.
 * Se nessuna ne ha uno (somma 0) vale `fallbackMinutes`, l'impostazione generale.
 */
export function todayGoalSeconds(subjects: readonly Plan[], date: Date, fallbackMinutes: number): number {
  const minutes = subjects.filter((s) => isScheduledOn(s, date)).reduce((sum, s) => sum + s.dailyGoalMinutes, 0);
  return (minutes > 0 ? minutes : Math.max(0, fallbackMinutes)) * 60;
}

/** Quanti giorni a settimana conta la materia (0 = ogni giorno = 7). */
export function daysPerWeek(studyDays: number): number {
  if (studyDays === 0) return 7;
  return WEEKDAYS.filter((_, i) => (studyDays & (1 << i)) !== 0).length;
}

/** "lun, mer"; stringa vuota se nessun giorno è scelto. */
export function daysLabel(studyDays: number): string {
  return WEEKDAYS.filter((_, i) => (studyDays & (1 << i)) !== 0)
    .map((d) => d.short)
    .join(", ");
}

/** Nome del giorno di `date`, es. "mercoledì". */
export function dayName(date: Date): string {
  return WEEKDAYS[weekdayIndex(date)].name;
}

/**
 * Vero se la materia sta tra quelle "di oggi" (card e dettaglio): prevista quel giorno, oppure già studiata
 * (il totale deve tornare con le righe) o in corso. Le altre finiscono sotto "Altre materie".
 */
export function isTodaySubject(subject: Plan, date: Date, seconds: number, isActive: boolean): boolean {
  return isScheduledOn(subject, date) || seconds > 0 || isActive;
}
