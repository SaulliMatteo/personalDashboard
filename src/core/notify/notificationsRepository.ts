import { getDatabase } from "../db/client";
import { INBOX_MAX, parseOpen, type InboxItem } from "./inboxStore";
import type { NotificationOpen } from "./notifier";

/** SQL della campanella (tabella `app_notifications`, migrazione 25). Lo usa solo core/notify/inbox.ts. */

interface NotificationRow {
  id: number;
  kind: string;
  title: string;
  body: string;
  open_json: string | null;
  created_at: number;
  read_at: number | null;
}

const toItem = (row: NotificationRow): InboxItem => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  body: row.body,
  open: parseOpen(row.open_json),
  createdAt: row.created_at,
  readAt: row.read_at,
});

/** Le più nuove, al massimo quante se ne tengono (le altre le toglie `deleteNotifications`). */
export async function listNotifications(): Promise<InboxItem[]> {
  const db = await getDatabase();
  const rows = await db.select<NotificationRow[]>(
    `SELECT id, kind, title, body, open_json, created_at, read_at FROM app_notifications
     ORDER BY created_at DESC, id DESC LIMIT ?`,
    [INBOX_MAX * 2]
  );
  return rows.map(toItem);
}

export interface NewNotification {
  kind: string;
  title: string;
  body: string;
  open: NotificationOpen | null;
  createdAt: number;
}

export async function insertNotification(n: NewNotification): Promise<InboxItem> {
  const db = await getDatabase();
  const result = await db.execute(
    `INSERT INTO app_notifications (kind, title, body, open_json, created_at, read_at) VALUES (?, ?, ?, ?, ?, NULL)`,
    [n.kind, n.title, n.body, n.open ? JSON.stringify(n.open) : null, n.createdAt]
  );
  if (typeof result.lastInsertId !== "number") throw new Error("Notifica salvata senza id");
  return { id: result.lastInsertId, kind: n.kind, title: n.title, body: n.body, open: n.open, createdAt: n.createdAt, readAt: null };
}

/** Segna come lette le voci indicate (null = tutte quelle non lette). */
export async function markNotificationsRead(ids: number[] | null, at: number): Promise<void> {
  const db = await getDatabase();
  if (ids === null) {
    await db.execute(`UPDATE app_notifications SET read_at = ? WHERE read_at IS NULL`, [at]);
    return;
  }
  if (ids.length === 0) return;
  await db.execute(`UPDATE app_notifications SET read_at = ? WHERE read_at IS NULL AND id IN (${ids.map(() => "?").join(", ")})`, [at, ...ids]);
}

/** Toglie le voci indicate (null = tutte). */
export async function deleteNotifications(ids: number[] | null): Promise<void> {
  const db = await getDatabase();
  if (ids === null) {
    await db.execute(`DELETE FROM app_notifications`);
    return;
  }
  if (ids.length === 0) return;
  await db.execute(`DELETE FROM app_notifications WHERE id IN (${ids.map(() => "?").join(", ")})`, ids);
}
