/*
 * Il foglietto Da fare nella presenza (versione 1) e la sua validazione. Puro (lo prova scripts/gruppi/todo.test.mts).
 * Si manda sempre `{ v: 1 }`; le voci solo con "Mostra la mia lista Da fare": così spegnendo sparisce subito.
 */

export const TODO_PRESENCE_VERSION = 1;
/** Lunghezza massima di una voce (come il campo del mockup). */
export const TODO_TEXT_MAX = 140;
/** Voci mandate al massimo: prima quelle da fare. */
export const TODO_SHARED_MAX = 30;

export interface TodoItem {
  id: number;
  text: string;
  done: boolean;
  /** quando è stata sbarrata (ms, ora locale) */
  doneAt: number | null;
}

/** Una voce come la vedono gli altri. */
export interface SharedTodo {
  text: string;
  done: boolean;
}

export interface TodoPresence {
  v: 1;
  items?: SharedTodo[];
}

/** Le voci nell'ordine in cui si mostrano agli altri: prima da fare, poi fatte (ognuna nel suo ordine). */
export function sharedOrder(items: readonly TodoItem[]): SharedTodo[] {
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  return open.concat(done).map((i) => ({ text: i.text, done: i.done }));
}

export function buildTodoPresence(items: readonly TodoItem[], share: boolean): TodoPresence {
  if (!share) return { v: 1 };
  return { v: 1, items: sharedOrder(items).slice(0, TODO_SHARED_MAX).map((i) => ({ text: i.text.slice(0, TODO_TEXT_MAX), done: i.done })) };
}

// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001F\u007F‎‏‪-‮⁦-⁩]/g;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Le voci di un payload ricevuto; null se non ce ne sono (non condivise) o il payload non è valido. */
export function parseTodoPresence(raw: unknown): SharedTodo[] | null {
  if (!isRecord(raw) || raw.v !== TODO_PRESENCE_VERSION || !Array.isArray(raw.items)) return null;
  if (raw.items.length === 0 || raw.items.length > TODO_SHARED_MAX) return null;
  const items: SharedTodo[] = [];
  for (const item of raw.items) {
    if (!isRecord(item) || typeof item.text !== "string" || typeof item.done !== "boolean") return null;
    if (item.text.length > TODO_TEXT_MAX) return null;
    const text = item.text.replace(UNSAFE_CHARS, " ").trim();
    if (!text) return null;
    items.push({ text, done: item.done });
  }
  return items;
}

/** Lo stato di un canale: utente → voci condivise. Con più dispositivi vale il primo che condivide. */
export function parseTodoChannelState(state: Record<string, unknown[]>): Record<string, SharedTodo[]> {
  const members: Record<string, SharedTodo[]> = {};
  for (const [userId, entries] of Object.entries(state)) {
    for (const entry of entries) {
      const items = parseTodoPresence(entry);
      if (items) {
        members[userId] = items;
        break;
      }
    }
  }
  return members;
}

/** Quante sono fatte, su quante. */
export function todoProgress(items: readonly { done: boolean }[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}

/** Inizio del giorno locale di `now`: le voci fatte prima si tolgono. */
export function startOfDay(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Inizio del giorno dopo (per ripulire a mezzanotte). */
export function nextMidnight(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}
