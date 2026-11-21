import { useState } from "react";
import { MdClose } from "react-icons/md";
import type { Todo } from "../lib/types";

/* "Da fare prima" (mockup): caselle con il testo, fatte barrate; × per togliere, una riga in fondo per aggiungere. */

function TodoList({ todos, onChange }: { todos: Todo[]; onChange: (todos: Todo[]) => void }) {
  const [draft, setDraft] = useState("");

  function add() {
    const text = draft.trim();
    if (!text) return;
    onChange([...todos, { text, done: false }]);
    setDraft("");
  }

  return (
    <div className="cal-todos">
      <h2 className="cal-panel-h2">Da fare prima</h2>
      {todos.map((t, i) => (
        <div key={`${i}:${t.text}`} className={`cal-todo${t.done ? " cal-todo--done" : ""}`}>
          <input
            type="checkbox"
            aria-label={t.text}
            checked={t.done}
            onChange={(e) => onChange(todos.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))}
          />
          <input
            type="text"
            className="cal-field cal-todo-text"
            aria-label="Testo"
            defaultValue={t.text}
            onBlur={(e) => {
              const text = e.target.value.trim();
              if (!text) onChange(todos.filter((_, j) => j !== i));
              else if (text !== t.text) onChange(todos.map((x, j) => (j === i ? { ...x, text } : x)));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <button type="button" className="cal-mini-remove" aria-label={`Togli "${t.text}"`} onClick={() => onChange(todos.filter((_, j) => j !== i))}>
            <MdClose aria-hidden="true" />
          </button>
        </div>
      ))}
      <form
        className="cal-todo cal-todo--new"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <span className="cal-todo-plus" aria-hidden="true">
          +
        </span>
        <input
          type="text"
          className="cal-field cal-todo-text"
          placeholder="Aggiungi una cosa da fare"
          aria-label="Nuova cosa da fare"
          maxLength={200}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
        />
      </form>
    </div>
  );
}

export default TodoList;
