/** Durate di Tempo al PC, in italiano. Gli input sono secondi. */

/** "5 h 12 min", "47 min", "0 min". */
export function formatDuration(seconds: number): string {
  const min = Math.floor(Math.max(0, seconds) / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "5 h 12", "47 min": per le colonne strette. */
export function formatShort(seconds: number): string {
  const min = Math.floor(Math.max(0, seconds) / 60);
  const h = Math.floor(min / 60);
  return h ? `${h} h ${String(min % 60).padStart(2, "0")}` : `${min} min`;
}

/** Ore e minuti separati, per il numero grande ("5", "12") o solo minuti ("47"). */
export function splitHours(seconds: number): { hours: number; minutes: number } {
  const min = Math.floor(Math.max(0, seconds) / 60);
  return { hours: Math.floor(min / 60), minutes: min % 60 };
}

/** "+40 min da ieri", "−1 h 5 min da ieri", "come ieri". */
export function formatDelta(seconds: number, what: string): string {
  const min = Math.round(seconds / 60);
  if (Math.abs(min) < 1) return `come ${what}`;
  const sign = min > 0 ? "+" : "−";
  return `${sign}${formatDuration(Math.abs(min) * 60)} da ${what}`;
}

/** "17:24" */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}
