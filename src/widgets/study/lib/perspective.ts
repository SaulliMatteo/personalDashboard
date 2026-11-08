import { periodRange, type PeriodRange } from "../../../core/report/periods";

/*
 * Scheda Prospettiva: quanto pesa il tempo studiato rispetto alle 24 ore e al tempo da sveglio.
 * Funzioni pure (`now` si passa da fuori), provate da scripts/studio/perspective.test.mts.
 */

/** "day" vive solo qui: ReportPeriod è condiviso con i Gruppi e con buildBuckets, che il giorno non lo conoscono. */
export type PerspectivePeriod = "day" | "week" | "month";

/** Massimo delle ore di sonno (come l'impostazione studySleepHours): almeno 8 ore da sveglio, mai una divisione per zero. */
export const SLEEP_HOURS_MAX = 16;

const SECONDS_PER_HOUR = 3600;

/**
 * Il periodo `offset` periodi fa (0 = quello in corso). Settimana e mese vengono da periodRange
 * (contano i giorni trascorsi, oggi compreso); il giorno conta sempre come giornata intera.
 */
export function perspectiveRange(period: PerspectivePeriod, offset: number, now: Date): PeriodRange {
  if (period !== "day") return periodRange(period, offset, now);
  // Come periodRange: un offset positivo vale 0, il futuro non si mostra.
  const o = Math.min(0, Math.trunc(offset));
  // new Date(anno, mese, giorno): un giorno di calendario anche quando dura 23 o 25 ore (ora legale).
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + o);
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + o + 1);
  return {
    start: startDate.getTime(),
    end: endDate.getTime(),
    title: startDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }),
    days: 1,
    elapsedDays: 1,
  };
}

/** Ore di sonno valide: tra 0 e 16 (un valore non numerico vale 0). */
export function clampSleepHours(sleepHours: number): number {
  return Number.isFinite(sleepHours) ? Math.min(SLEEP_HOURS_MAX, Math.max(0, sleepHours)) : 0;
}

/** Ore da sveglio in un giorno. */
export function awakeHours(sleepHours: number): number {
  return 24 - clampSleepHours(sleepHours);
}

/** Quota del tempo studiato su `days` giorni interi e sul loro tempo da sveglio (0..1, mai oltre 1). */
export function perspectiveShares(
  studiedSeconds: number,
  days: number,
  sleepHours: number
): { ofDay: number; ofAwake: number } {
  const share = (hoursPerDay: number) => {
    const total = days * hoursPerDay * SECONDS_PER_HOUR;
    return total > 0 ? Math.min(1, Math.max(0, studiedSeconds / total)) : 0;
  };
  return { ofDay: share(24), ofAwake: share(awakeHours(sleepHours)) };
}

/** 0..1 -> "17%"; "<1%" se c'è qualcosa ma arrotonderebbe a 0. */
export function formatShare(value: number): string {
  const percent = Math.round(value * 100);
  return value > 0 && percent === 0 ? "<1%" : `${percent}%`;
}
