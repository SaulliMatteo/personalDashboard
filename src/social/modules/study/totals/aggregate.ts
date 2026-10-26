import type { MemberDayTotal } from "../../../../core/cloud/studyTotalsApi";

/*
 * Dai totali giornalieri del server alle somme delle classifiche. Puro (lo prova scripts/gruppi/leaderboard.test.mts).
 */

/** I giorni ("AAAA-MM-GG", locali) che delimitano i periodi. */
export interface PeriodDays {
  today: string;
  /** Lunedì di questa settimana. */
  weekStart: string;
  /** Primo del mese. */
  monthStart: string;
}

export interface AggregatedTotals {
  /** utente → secondi di oggi, della settimana, del mese. */
  today: Record<string, number>;
  week: Record<string, number>;
  month: Record<string, number>;
  /** utente → il primo giorno con un totale tra quelli letti. */
  firstDay: Record<string, string>;
}

/** Da quale giorno leggere: il più vecchio tra lunedì e il primo del mese. */
export function fetchFrom(days: PeriodDays): string {
  return days.weekStart < days.monthStart ? days.weekStart : days.monthStart;
}

export function aggregateTotals(rows: MemberDayTotal[], days: PeriodDays): AggregatedTotals {
  const out: AggregatedTotals = { today: {}, week: {}, month: {}, firstDay: {} };
  const add = (map: Record<string, number>, id: string, s: number) => (map[id] = (map[id] ?? 0) + s);
  for (const r of rows) {
    if (r.day > days.today) continue;
    if (r.day === days.today) add(out.today, r.userId, r.seconds);
    if (r.day >= days.weekStart) add(out.week, r.userId, r.seconds);
    if (r.day >= days.monthStart) add(out.month, r.userId, r.seconds);
    const first = out.firstDay[r.userId];
    if (first === undefined || r.day < first) out.firstDay[r.userId] = r.day;
  }
  return out;
}

/**
 * Quanto del mese si conosce di un utente. Ogni invio manda anche i giorni a zero, quindi il primo giorno con un
 * totale è l'inizio dei suoi dati: chi usa i Gruppi da poco ha il mese solo da lì ("partial"), chi non ha mai
 * inviato niente non ha dati ("none", non uno zero).
 */
export type MonthCoverage = { kind: "full" } | { kind: "partial"; from: string } | { kind: "none" };

export function monthCoverage(firstDay: string | undefined, monthStart: string): MonthCoverage {
  if (firstDay === undefined) return { kind: "none" };
  return firstDay > monthStart ? { kind: "partial", from: firstDay } : { kind: "full" };
}
