import { STUDIED_HOURS_MAX } from "./payload";

/*
 * "ha studiato N ore": quando il proprio totale di oggi supera un'ora intera mentre l'app è aperta. Puro (lo prova
 * scripts/gruppi/chat.test.mts).
 */

/** Più di così tra due letture non è studio che avanza ma un dato appena caricato: nessun messaggio. */
export const MILESTONE_MAX_STEP_SECONDS = 120;

/** Le ore appena superate, o null. `prev`/`current` = secondi di studio di oggi in due letture vicine. */
export function crossedStudyHour(prev: number, current: number): number | null {
  const hours = Math.floor(current / 3600);
  if (hours < 1 || hours > STUDIED_HOURS_MAX) return null;
  if (hours <= Math.floor(prev / 3600)) return null;
  if (current - prev > MILESTONE_MAX_STEP_SECONDS) return null;
  return hours;
}

/** Già annunciato oggi? `last` = ultimo annuncio salvato ("AAAA-MM-GG:N"). */
export function alreadyAnnounced(last: string | null, day: string, hours: number): boolean {
  if (!last) return false;
  const [lastDay, lastHours] = last.split(":");
  return lastDay === day && Number(lastHours) >= hours;
}
