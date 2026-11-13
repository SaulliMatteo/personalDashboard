import { getDatabase } from "../../../core/db/client";
import type { UsageDelta } from "../lib/aggregate";
import type { LimitKind, ScreenLimit } from "../lib/limits";
import type { Session } from "../lib/sessions";
import type { UsageRow } from "../lib/summary";

/**
 * Tutto l'SQL di Tempo al PC (tabelle della migrazione 27). Solo dati di questo computer: niente sync.
 * Nessun titolo di finestra arriva qui: solo app, sito, categoria e secondi.
 */

interface UsageDbRow {
  day: string;
  hour: number;
  app_key: string;
  site: string;
  app_label: string;
  category: string;
  seconds: number;
  first_at: number;
  last_at: number;
}

const toUsage = (r: UsageDbRow): UsageRow => ({
  day: r.day,
  hour: r.hour,
  appKey: r.app_key,
  site: r.site,
  appLabel: r.app_label,
  category: r.category,
  seconds: r.seconds,
  firstAt: r.first_at,
  lastAt: r.last_at,
});

/** Somma i secondi nuovi (una riga per giorno, ora, app e sito). */
export async function addUsage(deltas: UsageDelta[]): Promise<void> {
  if (deltas.length === 0) return;
  const db = await getDatabase();
  for (const d of deltas) {
    await db.execute(
      `INSERT INTO screentime_usage (day, hour, app_key, site, app_label, category, seconds, first_at, last_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(day, hour, app_key, site) DO UPDATE SET
         seconds = seconds + excluded.seconds,
         app_label = excluded.app_label,
         category = excluded.category,
         first_at = MIN(first_at, excluded.first_at),
         last_at = MAX(last_at, excluded.last_at)`,
      [d.day, d.hour, d.appKey, d.site, d.appLabel, d.category, d.seconds, d.firstAt, d.lastAt]
    );
  }
}

/** Righe dei giorni da `fromDay` a `toDay` compresi ("YYYY-MM-DD"). */
export async function usageBetween(fromDay: string, toDay: string): Promise<UsageRow[]> {
  const db = await getDatabase();
  const rows = await db.select<UsageDbRow[]>(
    `SELECT day, hour, app_key, site, app_label, category, seconds, first_at, last_at
     FROM screentime_usage WHERE day >= ? AND day <= ?`,
    [fromDay, toDay]
  );
  return rows.map(toUsage);
}

/** Primo giorno con dati (per sapere fin dove si può tornare indietro). */
export async function firstUsageDay(): Promise<string | null> {
  const db = await getDatabase();
  const rows = await db.select<{ day: string | null }[]>(`SELECT MIN(day) AS day FROM screentime_usage`);
  return rows[0]?.day ?? null;
}

/** Scrive (o riscrive) una sessione: quella in corso si aggiorna a ogni giro con lo stesso inizio. */
export async function saveSessions(sessions: Session[]): Promise<void> {
  if (sessions.length === 0) return;
  const db = await getDatabase();
  for (const s of sessions) {
    await db.execute(
      `INSERT INTO screentime_sessions (start_at, end_at) VALUES (?, ?)
       ON CONFLICT(start_at) DO UPDATE SET end_at = MAX(end_at, excluded.end_at)`,
      [s.startAt, s.endAt]
    );
  }
}

/** Sessioni che toccano l'intervallo [fromMs, toMs). */
export async function sessionsBetween(fromMs: number, toMs: number): Promise<Session[]> {
  const db = await getDatabase();
  const rows = await db.select<{ start_at: number; end_at: number }[]>(
    `SELECT start_at, end_at FROM screentime_sessions WHERE end_at > ? AND start_at < ? ORDER BY start_at`,
    [fromMs, toMs]
  );
  return rows.map((r) => ({ startAt: r.start_at, endAt: r.end_at }));
}

/** L'ultima sessione salvata (per continuarla dopo un riavvio dell'app entro la pausa). */
export async function lastSession(): Promise<Session | null> {
  const db = await getDatabase();
  const rows = await db.select<{ start_at: number; end_at: number }[]>(
    `SELECT start_at, end_at FROM screentime_sessions ORDER BY start_at DESC LIMIT 1`
  );
  return rows[0] ? { startAt: rows[0].start_at, endAt: rows[0].end_at } : null;
}

/** Toglie i dati più vecchi di `beforeDay` (si tengono ~13 mesi). */
export async function pruneBefore(beforeDay: string, beforeMs: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM screentime_usage WHERE day < ?`, [beforeDay]);
  await db.execute(`DELETE FROM screentime_sessions WHERE end_at < ?`, [beforeMs]);
}

// ----------------------------------------------------------------- limiti

interface LimitDbRow {
  id: number;
  kind: string;
  target: string;
  label: string;
  minutes: number;
  warn: number;
}

export async function listLimits(): Promise<ScreenLimit[]> {
  const db = await getDatabase();
  const rows = await db.select<LimitDbRow[]>(`SELECT id, kind, target, label, minutes, warn FROM screentime_limits ORDER BY created_at, id`);
  return rows
    .filter((r) => r.kind === "app" || r.kind === "site" || r.kind === "category")
    .map((r) => ({ id: r.id, kind: r.kind as LimitKind, target: r.target, label: r.label, minutes: r.minutes, warn: r.warn !== 0 }));
}

/** Un limite per bersaglio: se c'è già, cambia minuti e avviso. */
export async function saveLimit(limit: Omit<ScreenLimit, "id">, now: number): Promise<void> {
  const db = await getDatabase();
  const existing = await db.select<{ id: number }[]>(`SELECT id FROM screentime_limits WHERE kind = ? AND target = ?`, [limit.kind, limit.target]);
  if (existing[0]) {
    await db.execute(`UPDATE screentime_limits SET minutes = ?, warn = ?, label = ? WHERE id = ?`, [limit.minutes, limit.warn ? 1 : 0, limit.label, existing[0].id]);
  } else {
    await db.execute(
      `INSERT INTO screentime_limits (kind, target, label, minutes, warn, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [limit.kind, limit.target, limit.label, limit.minutes, limit.warn ? 1 : 0, now]
    );
  }
}

export async function deleteLimit(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM screentime_limits WHERE id = ?`, [id]);
}
