import { getDatabase } from "../../../../core/db";
import { TODO_TEXT_MAX, type TodoItem } from "../payload";

/*
 * Il foglietto Da fare della sessione (tabella group_todos, migrazione 12): uno solo, su questo computer. Ai gruppi
 * arriva solo dal vivo e solo se condiviso (TodoProvider).
 */

interface TodoRow {
  id: number;
  text: string;
  done_at: number | null;
}

/** Le voci, le più nuove in cima (come il mockup: una voce aggiunta va sopra). */
export async function listTodos(): Promise<TodoItem[]> {
  const db = await getDatabase();
  const rows = await db.select<TodoRow[]>(`SELECT id, text, done_at FROM group_todos ORDER BY created_at DESC, id DESC`);
  return rows.map((r) => ({ id: r.id, text: r.text, done: r.done_at !== null, doneAt: r.done_at }));
}

export async function addTodo(text: string, now: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`INSERT INTO group_todos (text, done_at, created_at) VALUES (?, NULL, ?)`, [text.slice(0, TODO_TEXT_MAX), now]);
}

export async function setTodoDone(id: number, done: boolean, now: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE group_todos SET done_at = ? WHERE id = ?`, [done ? now : null, id]);
}

export async function deleteTodo(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM group_todos WHERE id = ?`, [id]);
}

/** Toglie le voci fatte prima di `before` (l'inizio di oggi): il foglietto riparte pulito ogni giorno. */
export async function purgeDoneBefore(before: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM group_todos WHERE done_at IS NOT NULL AND done_at < ?`, [before]);
}
