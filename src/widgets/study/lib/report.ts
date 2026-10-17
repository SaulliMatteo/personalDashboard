import {
  buildBuckets as buildGenericBuckets,
  periodRange,
  type Bucket as GenericBucket,
  type PeriodRange,
  type ReportPeriod,
} from "../../../core/report/periods";
import type { StudySession } from "../data/studyRepository";

/**
 * Il report di Studio usa la logica dei periodi condivisa (core/report/periods.ts):
 * qui resta solo l'adattamento alle sessioni di studio, dove il "gruppo" è la materia.
 */
export { periodRange };
export type { PeriodRange, ReportPeriod };

export interface Bucket extends Omit<GenericBucket, "byGroup"> {
  /** subjectId -> secondi in questa barra. */
  bySubject: Record<number, number>;
}

export function buildBuckets(
  period: ReportPeriod,
  range: PeriodRange,
  sessions: StudySession[],
  now: Date = new Date()
): Bucket[] {
  const items = sessions.map((s) => ({ endedAt: s.endedAt, durationSeconds: s.durationSeconds, groupId: s.subjectId }));
  return buildGenericBuckets(period, range, items, now).map(({ byGroup, ...rest }) => ({ ...rest, bySubject: byGroup }));
}
