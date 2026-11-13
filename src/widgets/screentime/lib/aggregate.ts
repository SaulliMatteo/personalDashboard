import type { ClassifiedSegment } from "./classify";

/** Una riga da sommare nel DB: secondi di un'app (e sito) in un'ora di un giorno locale. */
export interface UsageDelta {
  day: string;
  hour: number;
  appKey: string;
  site: string;
  appLabel: string;
  category: string;
  seconds: number;
  firstAt: number;
  lastAt: number;
}

/** "YYYY-MM-DD" nell'ora locale. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Inizio dell'ora locale successiva a `ms` (cambi d'ora legale compresi: lo calcola Date). */
function nextHourStart(ms: number): number {
  const d = new Date(ms);
  d.setMinutes(60, 0, 0);
  return d.getTime();
}

/**
 * Segmenti contati → righe per ora, spezzati sui cambi d'ora e di giorno. Righe uguali (stessa ora, app e sito)
 * si sommano. I segmenti "via dal PC" non producono righe. I secondi si arrotondano per riga, alla fine.
 */
export function segmentsToDeltas(segments: ClassifiedSegment[]): UsageDelta[] {
  const byKey = new Map<string, UsageDelta & { ms: number }>();
  for (const seg of segments) {
    if (!seg.counted || seg.endMs <= seg.startMs) continue;
    let from = seg.startMs;
    while (from < seg.endMs) {
      const to = Math.min(seg.endMs, nextHourStart(from));
      const day = dayKey(from);
      const hour = new Date(from).getHours();
      const key = `${day}|${hour}|${seg.appKey}|${seg.site}`;
      const row = byKey.get(key);
      if (row) {
        row.ms += to - from;
        row.firstAt = Math.min(row.firstAt, from);
        row.lastAt = Math.max(row.lastAt, to);
        row.appLabel = seg.appLabel;
        row.category = seg.category;
      } else {
        byKey.set(key, {
          day, hour, appKey: seg.appKey, site: seg.site, appLabel: seg.appLabel, category: seg.category,
          seconds: 0, firstAt: from, lastAt: to, ms: to - from,
        });
      }
      from = to;
    }
  }
  return [...byKey.values()]
    .map(({ ms, ...row }) => ({ ...row, seconds: Math.round(ms / 1000) }))
    .filter((row) => row.seconds > 0);
}

/** Tratti contati (inizio, fine) in ordine: servono alle sessioni senza pausa. */
export function countedIntervals(segments: ClassifiedSegment[]): Array<[number, number]> {
  return segments
    .filter((s) => s.counted && s.endMs > s.startMs)
    .map((s) => [s.startMs, s.endMs] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}
