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

const WEEKDAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

function parts(day: string): { y: number; m: number; d: number; weekday: number } {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d, weekday: new Date(y, m - 1, d, 12).getDay() };
}

/** "Oggi, venerdì 13 novembre", "Ieri, giovedì 12 novembre", "mercoledì 11 novembre" (con l'anno se non è quello di oggi). */
export function formatDayLabel(day: string, today: string, yesterday: string): string {
  const p = parts(day);
  const year = p.y !== parts(today).y ? ` ${p.y}` : "";
  const base = `${WEEKDAYS[p.weekday]} ${p.d} ${MONTHS[p.m - 1]}${year}`;
  if (day === today) return `Oggi, ${base}`;
  if (day === yesterday) return `Ieri, ${base}`;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** "9 – 15 novembre", "27 ottobre – 2 novembre", "29 dicembre 2025 – 4 gennaio 2026". */
export function formatWeekLabel(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  if (a.y !== b.y) return `${a.d} ${MONTHS[a.m - 1]} ${a.y} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]}`;
  return `${a.d} – ${b.d} ${MONTHS[b.m - 1]}`;
}

/** "lun", "mar"… */
export function weekdayShort(day: string): string {
  return WEEKDAYS_SHORT[parts(day).weekday];
}

/** "lunedì", "martedì"… */
export function weekdayName(day: string): string {
  return WEEKDAYS[parts(day).weekday];
}
