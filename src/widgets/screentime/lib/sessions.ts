/**
 * Sessioni al PC senza pause: una pausa è almeno `BREAK_MS` senza tempo contato (via dal PC, schermo bloccato,
 * computer spento). Puro: i tratti contati arrivano da fuori, l'ora pure.
 */
export const BREAK_MS = 5 * 60_000;

export interface Session {
  startAt: number;
  endAt: number;
}

/**
 * Aggiunge i tratti contati (in ordine) alla sessione in corso. Restituisce la sessione aggiornata e quelle chiuse
 * (da salvare tutte e due: la in corso si riscrive a ogni giro con lo stesso inizio).
 */
export function extendSessions(current: Session | null, intervals: Array<[number, number]>): { current: Session | null; closed: Session[] } {
  const closed: Session[] = [];
  let cur = current ? { ...current } : null;
  for (const [start, end] of intervals) {
    if (cur && start - cur.endAt < BREAK_MS) {
      cur.endAt = Math.max(cur.endAt, end);
    } else {
      if (cur) closed.push(cur);
      cur = { startAt: start, endAt: end };
    }
  }
  return { current: cur, closed };
}

/** Minuti al PC senza pausa fino a `now`; 0 se l'ultima sessione è già finita da una pausa intera. */
export function continuousMinutes(current: Session | null, now: number): number {
  if (!current || now - current.endAt >= BREAK_MS) return 0;
  return Math.floor((current.endAt - current.startAt) / 60_000);
}

/**
 * Il promemoria della pausa: alla soglia, poi di nuovo ogni `everyMin` minuti in più, una volta sola per gradino.
 * `remindedSteps` = gradini già avvisati in questa sessione. null = niente da mandare.
 */
export function breakReminderStep(minutes: number, everyMin: number, remindedSteps: number): number | null {
  if (everyMin <= 0 || minutes < everyMin) return null;
  const step = Math.floor(minutes / everyMin);
  return step > remindedSteps ? step : null;
}

/** Riepilogo delle pause di un giorno: sessioni di quel giorno in ordine di inizio. */
export function breakStats(sessions: Session[]): { breaks: number; longest: Session | null } {
  const sorted = [...sessions].sort((a, b) => a.startAt - b.startAt);
  let longest: Session | null = null;
  for (const s of sorted) if (!longest || s.endAt - s.startAt > longest.endAt - longest.startAt) longest = s;
  return { breaks: Math.max(0, sorted.length - 1), longest };
}
