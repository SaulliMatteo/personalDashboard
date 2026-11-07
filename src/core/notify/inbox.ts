import { useEffect, useSyncExternalStore } from "react";
import { pruneInbox, sortInbox, unreadCount, type InboxItem } from "./inboxStore";
import { deleteNotifications, insertNotification, listNotifications, markNotificationsRead } from "./notificationsRepository";
import type { AppNotificationKind, NotificationOpen } from "./notifier";

/**
 * La campanella della dashboard: la cronologia delle notifiche dell'app, solo su questo dispositivo.
 * Ci finiscono tutte quelle di sistema (`sendAppNotification` le registra da sé) e quelle minori che non meritano un
 * avviso di sistema (`postInAppNotification`: chi entra in un gruppo, chi ha studiato, un aggiornamento trovato).
 * Stato a livello di modulo (come core/updater/useUpdater.ts): la lista è la stessa per la campanella del desktop e
 * per quella del telefono, e una notifica che arriva prima che la campanella sia montata non si perde.
 */

export interface InboxNotification {
  kind: AppNotificationKind;
  title: string;
  body: string;
  open?: NotificationOpen;
}

interface InboxState {
  /** false finché la lista non è stata letta dal DB. */
  loaded: boolean;
  items: InboxItem[];
  unread: number;
}

let state: InboxState = { loaded: false, items: [], unread: 0 };
const listeners = new Set<() => void>();

function setItems(items: InboxItem[]) {
  const sorted = sortInbox(items);
  state = { loaded: true, items: sorted, unread: unreadCount(sorted) };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;

/** Le scritture una alla volta, nell'ordine: una notifica che arriva mentre si svuota non riappare a metà. */
let queue: Promise<void> = Promise.resolve();
function enqueue(task: () => Promise<void>): Promise<void> {
  const run = () =>
    task().catch((error) => {
      console.error("Campanella delle notifiche:", error);
    });
  queue = queue.then(run, run);
  return queue;
}

let loadStarted = false;
function ensureLoaded(): Promise<void> {
  if (loadStarted) return queue;
  loadStarted = true;
  return enqueue(async () => {
    const { kept, removed } = pruneInbox(await listNotifications(), Date.now());
    if (removed.length > 0) await deleteNotifications(removed);
    setItems(kept);
  });
}

/** Mette una voce nella campanella, senza notifica di sistema. `at`: quando è successo (default adesso). */
export function postInAppNotification(n: InboxNotification, at: number = Date.now()): Promise<void> {
  void ensureLoaded();
  return enqueue(async () => {
    const item = await insertNotification({ kind: n.kind, title: n.title, body: n.body, open: n.open ?? null, createdAt: at });
    const { kept, removed } = pruneInbox([item, ...state.items], Date.now());
    if (removed.length > 0) await deleteNotifications(removed);
    setItems(kept);
  });
}

function markRead(ids: number[] | null) {
  const now = Date.now();
  const touched = ids === null ? null : new Set(ids);
  const next = state.items.map((item) => (item.readAt === null && (touched === null || touched.has(item.id)) ? { ...item, readAt: now } : item));
  setItems(next);
  return enqueue(() => markNotificationsRead(ids, now));
}

function remove(ids: number[] | null) {
  const gone = ids === null ? null : new Set(ids);
  setItems(gone === null ? [] : state.items.filter((item) => !gone.has(item.id)));
  return enqueue(() => deleteNotifications(ids));
}

/** Segna come lette le voci indicate, fuori da un componente (es. alla chiusura del pannello). */
export function markInboxRead(ids: number[]): void {
  if (ids.length > 0) void markRead(ids);
}

/** Lista, numero dei non letti e azioni della campanella. */
export function useInbox() {
  const current = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    void ensureLoaded();
  }, []);
  return {
    ...current,
    markRead: (id: number) => void markRead([id]),
    markAllRead: () => void markRead(null),
    remove: (id: number) => void remove([id]),
    clear: () => void remove(null),
  };
}
