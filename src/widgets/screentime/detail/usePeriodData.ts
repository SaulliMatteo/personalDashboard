import { useEffect, useMemo, useState } from "react";
import * as repo from "../data/screentimeRepository";
import { dayBounds, shiftDay, weekStart } from "../lib/aggregate";
import type { Session } from "../lib/sessions";
import { dailyTotals, type ClassSeconds, type UsageRow } from "../lib/summary";
import { useScreenTime } from "../useScreenTime";

export type PeriodMode = "day" | "week";

/** Giorni guardati all'indietro per la media dei 7 giorni e la serie del focus. */
const HISTORY_DAYS = 60;

export interface DayTotal {
  day: string;
  total: number;
  byClass: ClassSeconds;
}

export interface PeriodData {
  loading: boolean;
  /** Righe del giorno scelto, o della settimana intera. */
  rows: UsageRow[];
  /** Sessioni del giorno scelto (vuote nella settimana). */
  sessions: Session[];
  /** I 7 giorni della settimana (lunedì → domenica), anche quelli vuoti. */
  week: DayTotal[];
  /** Dal giorno scelto all'indietro: [0] = il giorno scelto. Per la serie del focus e la media. */
  history: DayTotal[];
  /** Primo giorno con dati: non si torna più indietro di così. */
  firstDay: string | null;
  /** App e siti usati negli ultimi due mesi, dal più usato: le scelte del dialog dei limiti. */
  recentApps: Array<{ target: string; label: string }>;
  recentSites: Array<{ target: string; label: string }>;
}

function recent(rows: UsageRow[], pick: (r: UsageRow) => [string, string] | null) {
  const seconds = new Map<string, { target: string; label: string; seconds: number }>();
  for (const r of rows) {
    const p = pick(r);
    if (!p) continue;
    const cur = seconds.get(p[0]) ?? { target: p[0], label: p[1], seconds: 0 };
    cur.seconds += r.seconds;
    seconds.set(p[0], cur);
  }
  return [...seconds.values()].sort((a, b) => b.seconds - a.seconds).map(({ target, label }) => ({ target, label }));
}

/**
 * I dati che la pagina di Tempo al PC legge dal DB per il giorno o la settimana scelti. Oggi le righe vengono dal
 * provider (sempre fresche); gli altri giorni si rileggono quando cambia la scelta o quando il provider salva
 * (`revision`), così una categoria cambiata a mano si vede subito anche nei giorni passati.
 */
export function usePeriodData(mode: PeriodMode, day: string, today: string): PeriodData {
  const { todayRows, revision, classify } = useScreenTime();
  const [stored, setStored] = useState<{ key: string; rows: UsageRow[]; sessions: Session[]; historyRows: UsageRow[]; firstDay: string | null } | null>(null);

  const from = mode === "week" ? weekStart(day) : day;
  const to = mode === "week" ? shiftDay(from, 6) : day;
  const historyFrom = shiftDay(mode === "week" ? to : day, -HISTORY_DAYS);
  const key = `${mode}|${day}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [rangeStart] = dayBounds(from);
        const [, rangeEnd] = dayBounds(to);
        const [historyRows, sessions, firstDay] = await Promise.all([
          repo.usageBetween(historyFrom, to),
          mode === "day" ? repo.sessionsBetween(rangeStart, rangeEnd) : Promise.resolve<Session[]>([]),
          repo.firstUsageDay(),
        ]);
        if (cancelled) return;
        const rows = historyRows.filter((r) => r.day >= from && r.day <= to);
        setStored({ key, rows, sessions, historyRows, firstDay });
      } catch (error) {
        console.error("Tempo al PC: lettura della pagina non riuscita", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, from, to, historyFrom, mode, revision]);

  return useMemo<PeriodData>(() => {
    const ready = stored?.key === key ? stored : null;
    // Oggi: le righe del provider sono più nuove di quelle lette qui (salvate al massimo 30 s fa).
    const withToday = (rows: UsageRow[]) => (to >= today && from <= today ? [...rows.filter((r) => r.day !== today), ...todayRows] : rows);
    const rows = withToday(ready?.rows ?? []);
    const historyRows = withToday(ready?.historyRows ?? []);
    const totals = dailyTotals(historyRows, classify);
    const at = (d: string): DayTotal => {
      const t = totals.get(d);
      return { day: d, total: t?.total ?? 0, byClass: t?.byClass ?? { focus: 0, fun: 0, neutral: 0 } };
    };
    const week = Array.from({ length: 7 }, (_, i) => at(shiftDay(weekStart(day), i)));
    const last = mode === "week" ? (to > today ? today : to) : day;
    const history = Array.from({ length: HISTORY_DAYS }, (_, i) => at(shiftDay(last, -i)));
    return {
      loading: !ready,
      rows,
      sessions: ready?.sessions ?? [],
      week,
      history,
      firstDay: ready?.firstDay ?? null,
      recentApps: recent(historyRows, (r) => [r.appKey, r.appLabel]),
      recentSites: recent(historyRows, (r) => (r.site ? [r.site, r.site] : null)),
    };
  }, [stored, key, todayRows, today, from, to, classify, day, mode]);
}
