import type { StudySession } from "../studyRepository";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReportPeriod = "week" | "month";

export interface Bucket {
  label: string;
  start: number;
  end: number;
  seconds: number;
}

/** Quanti giorni di sessioni vanno caricati per il periodo scelto. */
export function periodDays(period: ReportPeriod): number {
  return period === "week" ? 7 : 35;
}

function buildWeekBuckets(): Bucket[] {
  const now = new Date();
  const buckets: Bucket[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const start = d.getTime();
    buckets.push({
      label: d.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", ""),
      start,
      end: start + DAY_MS,
      seconds: 0,
    });
  }
  return buckets;
}

function buildMonthBuckets(): Bucket[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weeks = 5;
  const buckets: Bucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = todayStart - i * 7 * DAY_MS + DAY_MS;
    const start = end - 7 * DAY_MS;
    buckets.push({ label: i === 0 ? "Questa sett." : `-${i} sett.`, start, end, seconds: 0 });
  }
  return buckets;
}

export function buildBuckets(period: ReportPeriod, sessions: StudySession[]): Bucket[] {
  const filled = (period === "week" ? buildWeekBuckets() : buildMonthBuckets()).map((b) => ({ ...b }));
  for (const session of sessions) {
    const bucket = filled.find((b) => session.endedAt >= b.start && session.endedAt < b.end);
    if (bucket) bucket.seconds += session.durationSeconds;
  }
  return filled;
}
