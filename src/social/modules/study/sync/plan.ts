import type { StudyDayTotal } from "../../../../core/cloud/studyTotalsApi";

/*
 * Quali giorni mandare e con quanti secondi. Puro: niente DB, niente rete, "adesso" arriva da fuori
 * (lo prova scripts/gruppi/sync.test.mts).
 */

/** Storico mandato al primo invio, e massimo comunque (gli altri vedono solo oggi e la settimana). */
export const SYNC_DAYS = 14;

/** Il server rifiuta più di un giorno intero per riga. */
const MAX_DAY_SECONDS = 86_400;

/** Una sessione di studio registrata in locale: conta nel giorno in cui finisce, come nel widget Studio. */
export interface SessionSpan {
  endedAt: number;
  durationSeconds: number;
}

/** Un giorno locale: [start, end) in ms e la chiave "AAAA-MM-GG" usata sul server. */
export interface LocalDay {
  key: string;
  start: number;
  end: number;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "AAAA-MM-GG" del giorno locale che contiene `date`. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Il giorno locale spostato di `offset` giorni da quello di `date`. Con Date: un giorno non è sempre 24 h. */
function localDay(date: Date, offset: number): LocalDay {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  return { key: dayKey(start), start: start.getTime(), end: end.getTime() };
}

/**
 * I giorni da (ri)mandare, dal più vecchio a oggi:
 *  - primo invio (`lastSyncAt` null): gli ultimi `SYNC_DAYS` giorni;
 *  - poi: dal giorno dell'ultimo invio riuscito, sempre compreso ieri (una sessione chiusa dopo
 *    mezzanotte può finire nel giorno prima, es. lo stop automatico che toglie l'assenza);
 *  - mai più di `SYNC_DAYS` giorni; un ultimo invio "nel futuro" (orologio spostato) vale come ieri.
 */
export function syncDays(now: Date, lastSyncAt: number | null, maxDays: number = SYNC_DAYS): LocalDay[] {
  const todayStart = localDay(now, 0).start;
  let back = maxDays - 1;
  if (lastSyncAt !== null && lastSyncAt <= now.getTime()) {
    const last = new Date(lastSyncAt);
    const lastStart = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();
    // giorni interi tra le due mezzanotti (arrotondato: 23 o 25 ore col cambio d'ora)
    const daysAgo = Math.round((todayStart - lastStart) / 86_400_000);
    back = Math.min(maxDays - 1, Math.max(1, daysAgo));
  } else if (lastSyncAt !== null) {
    back = 1;
  }
  const days: LocalDay[] = [];
  for (let i = back; i >= 0; i--) days.push(localDay(now, -i));
  return days;
}

/**
 * Secondi per ciascun giorno, compresi quelli a 0: così una sessione cancellata in locale (es. con la sua
 * materia) azzera anche il giorno sul server.
 */
export function dailyTotals(days: LocalDay[], sessions: SessionSpan[]): StudyDayTotal[] {
  const totals = days.map((day) => ({ day: day.key, seconds: 0 }));
  for (const session of sessions) {
    const index = days.findIndex((day) => session.endedAt >= day.start && session.endedAt < day.end);
    if (index >= 0) totals[index].seconds += Math.max(0, Math.round(session.durationSeconds));
  }
  for (const total of totals) total.seconds = Math.min(MAX_DAY_SECONDS, total.seconds);
  return totals;
}
