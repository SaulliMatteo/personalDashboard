import { createContext, useContext } from "react";
import type { SharedTodo, TodoItem } from "./payload";

/* Contesto e hook separati dal provider (TodoProvider.tsx), come per le impostazioni. */

export interface TodoValue {
  /** Il proprio foglietto (su questo computer), le voci più nuove in cima. */
  items: TodoItem[];
  /** false finché non arriva la prima lettura dal database. */
  loaded: boolean;
  add: (text: string) => Promise<void>;
  toggle: (id: number, done: boolean) => Promise<void>;
  remove: (id: number) => Promise<void>;
  /** gruppo → utente → foglietto, dei compagni connessi che lo condividono (in sola lettura). */
  shared: Record<string, Record<string, SharedTodo[]>>;
}

export const TodoContext = createContext<TodoValue | undefined>(undefined);

export function useTodo() {
  const ctx = useContext(TodoContext);
  if (!ctx) throw new Error("useTodo deve essere usato dentro <TodoProvider>");
  return ctx;
}
