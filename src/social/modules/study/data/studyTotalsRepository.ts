import { getDatabase, getMeta, setMeta } from "../../../../core/db";
import type { SessionSpan } from "../sync/plan";

/*
 * Lettura (solo lettura) delle sessioni del widget Studio per i Gruppi. Il modulo non importa il widget:
 * legge la stessa tabella con gli stessi confini (sessione assegnata al giorno in cui finisce).
 */

export async function getSessionSpansBetween(startMs: number, endMs: number): Promise<SessionSpan[]> {
  const db = await getDatabase();
  const rows = await db.select<{ ended_at: number; duration_seconds: number }[]>(
    `SELECT ended_at, duration_seconds FROM study_sessions WHERE ended_at >= ? AND ended_at < ?`,
    [startMs, endMs]
  );
  return rows.map((r) => ({ endedAt: r.ended_at, durationSeconds: r.duration_seconds }));
}

/** Ultimo invio riuscito dei totali (ms), per account: un altro account su questo computer riparte da capo. */
function lastSyncKey(userId: string): string {
  return `groups_study_last_sync:${userId}`;
}

export async function loadLastSync(userId: string): Promise<number | null> {
  const value = Number(await getMeta(lastSyncKey(userId)));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function saveLastSync(userId: string, at: number): Promise<void> {
  await setMeta(lastSyncKey(userId), String(at));
}
