import { getMeta, setMeta } from "../../../core/db/meta";
import { usageEvents } from "./screentimeApi";
import { eventsToSegments, lostRange } from "../lib/androidEvents";
import { classifyPhoneSegments } from "../lib/androidApps";
import type { ClassifiedSegment } from "../lib/classify";

/**
 * Lettura della cronologia di Android per Tempo allo schermo sul telefono. Si legge da dove si era arrivati
 * (`screentime_android_cursor` in `meta`) fino ad adesso; il tratto ancora aperto (di solito la dashboard stessa) si
 * conta alla lettura dopo. Alla prima lettura si prende quello che Android ha ancora (circa una settimana).
 * Se l'app non si apre per più giorni di quanti Android ne tenga, quei giorni si perdono: si segnano in
 * `screentime_android_gaps` e la pagina lo dice.
 */

const CURSOR_META = "screentime_android_cursor";
const GAPS_META = "screentime_android_gaps";
/** Prima lettura: fin dove si chiede (Android risponde con quello che ha). */
const FIRST_READ_MS = 30 * 86_400_000;
/** Si ricordano gli ultimi buchi, non tutti. */
const MAX_GAPS = 12;

export interface PhoneGap {
  from: number;
  to: number;
}

export interface PhoneRead {
  segments: ClassifiedSegment[];
  /** Da salvare con `commitPhoneRead` solo dopo aver scritto i segmenti nel DB. */
  cursor: number;
  gap: PhoneGap | null;
}

/** Legge gli eventi dall'ultima volta fino a `now`, senza salvare niente. */
export async function readPhoneUsage(now: number): Promise<PhoneRead> {
  const saved = Number(await getMeta(CURSOR_META));
  const cursor = Number.isFinite(saved) && saved > 0 && saved <= now ? saved : null;
  const batch = await usageEvents(cursor ?? now - FIRST_READ_MS, now);
  const { segments, openSince } = eventsToSegments(batch, now);
  return { segments: classifyPhoneSegments(segments, batch), cursor: openSince ?? now, gap: lostRange(cursor, batch.oldest) };
}

/** Dopo il salvataggio dei segmenti: la prossima lettura parte da qui, e il buco (se c'è) si ricorda. */
export async function commitPhoneRead(read: PhoneRead): Promise<void> {
  await setMeta(CURSOR_META, String(read.cursor));
  if (read.gap) await setMeta(GAPS_META, JSON.stringify([...(await phoneGaps()), read.gap].slice(-MAX_GAPS)));
}

/** I periodi che il telefono non ha potuto contare. */
export async function phoneGaps(): Promise<PhoneGap[]> {
  try {
    const parsed: unknown = JSON.parse((await getMeta(GAPS_META)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((g): g is PhoneGap => typeof g?.from === "number" && typeof g?.to === "number" && g.to > g.from);
  } catch {
    return [];
  }
}
