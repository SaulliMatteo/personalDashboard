import type { NotificationOpen } from "./notifier";

/**
 * La campanella della dashboard, la parte pura (niente DB, niente React; prova: scripts/notify/inbox.test.mts):
 * quali notifiche tenere, quante non lette, come dividerle per giorno e come leggere `open` salvato.
 */

/** Una voce della campanella, come sta nella tabella `app_notifications` (migrazione 25). */
export interface InboxItem {
  id: number;
  kind: string;
  title: string;
  body: string;
  /** Dove porta il clic; null = da nessuna parte. */
  open: NotificationOpen | null;
  createdAt: number;
  /** null = non letta. */
  readAt: number | null;
}

/** Si tengono al massimo le ultime 200, e non più vecchie di 30 giorni. */
export const INBOX_MAX = 200;
export const INBOX_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

/** Le più nuove prima; a parità di istante la più recente (id più alto). */
export function sortInbox(items: InboxItem[]): InboxItem[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
}

/** Divide le voci in quelle da tenere (ordinate) e gli id da cancellare (oltre il limite o troppo vecchie). */
export function pruneInbox(items: InboxItem[], now: number): { kept: InboxItem[]; removed: number[] } {
  const kept: InboxItem[] = [];
  const removed: number[] = [];
  for (const item of sortInbox(items)) {
    if (kept.length < INBOX_MAX && now - item.createdAt <= INBOX_MAX_AGE_MS) kept.push(item);
    else removed.push(item.id);
  }
  return { kept, removed };
}

export function unreadCount(items: InboxItem[]): number {
  return items.reduce((n, item) => (item.readAt === null ? n + 1 : n), 0);
}

/** Il numero sul pallino: oltre 99 si scrive "99+". */
export function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

const dayStart = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Etichetta del giorno di una voce: "Oggi", "Ieri", oppure "3 novembre" (con l'anno se non è quello di adesso). */
export function dayLabel(at: number, now: number): string {
  const today = dayStart(now);
  const day = dayStart(at);
  if (day === today) return "Oggi";
  // un giorno prima a mezzanotte (con l'ora legale la differenza non è sempre 24 ore)
  const yesterday = dayStart(today - 12 * 60 * 60_000);
  if (day === yesterday) return "Ieri";
  const date = new Date(at);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("it-IT", sameYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
}

/** Voci (già ordinate) raggruppate per giorno, nell'ordine in cui arrivano. */
export function groupInboxByDay(items: InboxItem[], now: number): { label: string; items: InboxItem[] }[] {
  const groups: { label: string; items: InboxItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt, now);
    const last = groups.at(-1);
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/** Legge `open_json` salvato; tutto ciò che non è una destinazione conosciuta diventa null. */
export function parseOpen(json: string | null): NotificationOpen | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") return null;
    if (raw.type === "room") return { type: "room" };
    if (raw.type === "widget" && typeof raw.widgetId === "string" && raw.widgetId !== "") return { type: "widget", widgetId: raw.widgetId };
    if (raw.type === "settings" && typeof raw.section === "string" && raw.section !== "") return { type: "settings", section: raw.section };
    if (raw.type === "friends") return typeof raw.userId === "string" && raw.userId !== "" ? { type: "friends", userId: raw.userId } : { type: "friends" };
    return null;
  } catch {
    return null;
  }
}
