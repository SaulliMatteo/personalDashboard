import { addDays, dayKey, isSameDay, startOfDay } from "./dates";
import type { NoteLink, Occurrence } from "./types";

/*
 * Cosa mostrano card e mini (pure): i prossimi impegni, quanti oggi, i giorni del mese con qualcosa (puntini).
 */

/** I prossimi `limit` elementi non ancora finiti, in ordine; quelli di tutto il giorno solo se sono di oggi in poi. */
export function upcoming(occurrences: readonly Occurrence[], now: number, limit: number): Occurrence[] {
  const today = startOfDay(now).getTime();
  return occurrences
    .filter((o) => o.end > now && (!o.event.allDay || o.start >= today))
    .sort((a, b) => a.start - b.start || Number(b.event.allDay) - Number(a.event.allDay) || a.event.id - b.event.id)
    .slice(0, limit);
}

/** Quanti elementi (eventi, sessioni e promemoria) cadono oggi. */
export function countToday(occurrences: readonly Occurrence[], now: number): number {
  const from = startOfDay(now).getTime();
  const to = addDays(from, 1).getTime();
  // un promemoria dura zero: conta se cade oggi, anche a mezzanotte
  return occurrences.filter((o) => o.start < to && (o.end > from || o.start >= from)).length;
}

/** I giorni ("YYYY-MM-DD") che hanno almeno un elemento o una nota collegata: il puntino nella mini griglia. */
export function busyDays(occurrences: readonly Occurrence[], notes: readonly NoteLink[]): Set<string> {
  const days = new Set<string>();
  for (const o of occurrences) {
    let d = startOfDay(o.start);
    const last = o.end > o.start ? o.end - 1 : o.start;
    for (let i = 0; i < 60 && d.getTime() <= last; i++) {
      days.add(dayKey(d));
      d = addDays(d, 1);
    }
  }
  for (const n of notes) if (n.day) days.add(n.day);
  return days;
}

/** "oggi", "domani" o null (più avanti: il chiamante scrive il giorno). */
export function nearDay(at: number, now: number): "oggi" | "domani" | null {
  if (isSameDay(at, now)) return "oggi";
  if (isSameDay(at, addDays(startOfDay(now), 1))) return "domani";
  return null;
}
