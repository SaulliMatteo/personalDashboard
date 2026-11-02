/**
 * Consigli del widget YouTube: logica pura (niente DB, niente React), orologio e random iniettati.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Giorni di rinvio dopo l'n-esimo "Non ora": 3, 6, 12, 24, 48, poi sempre 60. */
export function snoozeDays(snoozeCount: number): number {
  const n = Math.max(1, Math.floor(snoozeCount));
  return Math.min(60, 3 * 2 ** (n - 1));
}

/** Fino a quando (ms) resta nascosto un video rinviato per l'n-esima volta. */
export function snoozeUntil(snoozeCount: number, now: number): number {
  return now + snoozeDays(snoozeCount) * DAY_MS;
}
