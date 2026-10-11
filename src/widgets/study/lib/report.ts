import type { StudySession } from "../data/studyRepository";

export type ReportPeriod = "week" | "month";

export interface Bucket {
  label: string;
  start: number;
  end: number;
  seconds: number;
  bySubject: Record<number, number>;
  /** True per il giorno/settimana che contiene "adesso": viene evidenziato nel grafico. */
  isCurrent: boolean;
}

/** Inizio (ms) del giorno locale spostato di offsetDays. Via Date(y,m,d+n) per restare corretto anche nei cambi ora legale. */
function dayStart(offsetDays: number): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays).getTime();
}

/** Quanti giorni copre il periodo scelto. */
export function periodDays(period: ReportPeriod): number {
  return period === "week" ? 7 : 35;
}

/** Intervallo [start, end) da caricare dal DB per il periodo. */
export function reportRange(period: ReportPeriod): { start: number; end: number } {
  return { start: dayStart(-(periodDays(period) - 1)), end: dayStart(1) };
}

function buildWeekBuckets(): Bucket[] {
  const buckets: Bucket[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = dayStart(-i);
    buckets.push({
      label: new Date(start).toLocaleDateString("it-IT", { weekday: "short" }).replace(".", ""),
      start,
      end: dayStart(-i + 1),
      seconds: 0,
      bySubject: {},
      isCurrent: i === 0,
    });
  }
  return buckets;
}

function buildMonthBuckets(): Bucket[] {
  const buckets: Bucket[] = [];
  for (let i = 4; i >= 0; i--) {
    const end = dayStart(1 - i * 7);
    const start = dayStart(1 - i * 7 - 7);
    buckets.push({
      label: i === 0 ? "Questa sett." : `-${i} sett.`,
      start,
      end,
      seconds: 0,
      bySubject: {},
      isCurrent: i === 0,
    });
  }
  return buckets;
}

export function buildBuckets(period: ReportPeriod, sessions: StudySession[]): Bucket[] {
  const buckets = period === "week" ? buildWeekBuckets() : buildMonthBuckets();
  for (const session of sessions) {
    const bucket = buckets.find((b) => session.endedAt >= b.start && session.endedAt < b.end);
    if (!bucket) continue;
    bucket.seconds += session.durationSeconds;
    bucket.bySubject[session.subjectId] = (bucket.bySubject[session.subjectId] ?? 0) + session.durationSeconds;
  }
  return buckets;
}
