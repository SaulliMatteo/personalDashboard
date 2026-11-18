import { addDays, dayKey, startOfDay } from "./dates";
import type { NoteLink, Occurrence } from "./types";

/*
 * Cosa sta in ogni giorno (vista mese, riga "giorno" della settimana, card): pure.
 * Ordine nel giorno: prima "tutto il giorno", poi gli orari in ordine, in fondo le note collegate.
 */

export type DayEntry = { kind: "occurrence"; occurrence: Occurrence } | { kind: "note"; link: NoteLink };

/** I giorni (chiavi) che un'occorrenza tocca: la fine è esclusa (finire a mezzanotte non tocca il giorno dopo). */
export function occurrenceDays(o: Pick<Occurrence, "start" | "end">): string[] {
  const days: string[] = [];
  let day = startOfDay(o.start);
  const last = o.end > o.start ? o.end - 1 : o.start;
  for (let i = 0; i < 400 && day.getTime() <= last; i++) {
    days.push(dayKey(day));
    day = addDays(day, 1);
  }
  return days;
}

function entryRank(e: DayEntry): number {
  if (e.kind === "note") return 2;
  return e.occurrence.event.allDay ? 0 : 1;
}

function tieBreak(a: DayEntry, b: DayEntry): number {
  if (a.kind === "occurrence" && b.kind === "occurrence") {
    return a.occurrence.start - b.occurrence.start || a.occurrence.event.id - b.occurrence.event.id;
  }
  if (a.kind === "note" && b.kind === "note") return a.link.id - b.link.id;
  return 0;
}

/** Gli elementi di ciascuno dei giorni dati (giorni senza nulla: lista vuota), già in ordine. */
export function entriesByDay(days: readonly Date[], occurrences: readonly Occurrence[], notes: readonly NoteLink[]): Map<string, DayEntry[]> {
  const map = new Map<string, DayEntry[]>(days.map((d) => [dayKey(d), []]));
  for (const occurrence of occurrences) {
    for (const key of occurrenceDays(occurrence)) map.get(key)?.push({ kind: "occurrence", occurrence });
  }
  for (const link of notes) if (link.day) map.get(link.day)?.push({ kind: "note", link });
  for (const list of map.values()) {
    list.sort((a, b) => entryRank(a) - entryRank(b) || tieBreak(a, b));
  }
  return map;
}

/**
 * Quanti elementi entrano in una cella con `rows` righe: se non ci stanno tutti, l'ultima riga diventa "+N altro"
 * (nel mockup: 3 righe = 2 elementi + "+1 altro").
 */
export function fitCell<T>(entries: readonly T[], rows = 3): { shown: T[]; more: number } {
  if (entries.length <= rows) return { shown: [...entries], more: 0 };
  const shown = entries.slice(0, Math.max(0, rows - 1));
  return { shown, more: entries.length - shown.length };
}

/** Misure della cella del mese (mockup): 6 px di margine, numero alto 18, elementi alti 20, 3 px tra le righe. */
export const MONTH_CELL = { padding: 6, number: 18, item: 20, gap: 3, maxRows: 3 } as const;

/**
 * Quante righe (elementi o "+N altro") entrano sotto il numero in una cella alta `cellHeight` px: al massimo 3 come
 * nel mockup, meno se la finestra è bassa (così l'ultima riga visibile è "+N altro" e non un elemento tagliato).
 */
export function rowsThatFit(cellHeight: number): number {
  const free = cellHeight - 2 * MONTH_CELL.padding - MONTH_CELL.number;
  const rows = Math.floor(free / (MONTH_CELL.item + MONTH_CELL.gap));
  return Math.max(1, Math.min(MONTH_CELL.maxRows, rows));
}
