import { useMemo } from "react";
import { useNow } from "../../../core/hooks/useNow";
import { useCalendarData } from "../hooks/useCalendarData";
import { busyDays, countToday, upcoming } from "../lib/agenda";
import { addDays, monthGrid, startOfDay } from "../lib/dates";

/*
 * Dati delle card e del mini del Calendario, senza UI (come useStudyCard): il mese di oggi con i giorni occupati,
 * gli impegni di oggi e i prossimi. Legge dal mese di oggi fino a 8 giorni avanti (anche oltre la fine del mese).
 */
export function useCalendarCard(limit = 3) {
  // l'ora la dà useNow (niente new Date() durante il disegno): a mezzanotte cambiano giorno e, se serve, mese
  const clockNow = useNow();
  const year = clockNow.getFullYear();
  const month = clockNow.getMonth();
  const todayMs = startOfDay(clockNow).getTime();
  const grid = useMemo(() => monthGrid(year, month), [year, month]);
  const from = grid[0].getTime();
  const to = Math.max(addDays(grid[41], 1).getTime(), addDays(todayMs, 8).getTime());
  const data = useCalendarData(from, to);
  const nowMs = data.now.getTime();

  const next = useMemo(() => upcoming(data.occurrences, nowMs, limit), [data.occurrences, nowMs, limit]);
  const todayCount = useMemo(() => countToday(data.occurrences, nowMs), [data.occurrences, nowMs]);
  const busy = useMemo(() => busyDays(data.occurrences, data.notes), [data.occurrences, data.notes]);

  return { data, grid, year, month, next, todayCount, busy, now: data.now };
}
