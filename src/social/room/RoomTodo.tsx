import { useState, type FormEvent } from "react";
import { useSettings } from "../../core/settings/useSettings";
import { ChevronIcon, EyeIcon, LockIcon, SmallCloseIcon, SmallPlusIcon } from "../groups/components/icons";
import { TODO_TEXT_MAX, type TodoItem } from "../modules/todo/payload";
import { useTodo } from "../modules/todo/useTodo";
import "./RoomTodo.css";

function TodoRow({ item, onToggle, onRemove }: { item: TodoItem; onToggle: () => void; onRemove: () => void }) {
  return (
    <div className={`rtd-item${item.done ? " is-done" : ""}`}>
      <label className="rtd-check">
        <input type="checkbox" checked={item.done} onChange={onToggle} />
        <span className="rtd-text">{item.text}</span>
      </label>
      <button type="button" className="rtd-remove" aria-label={`Elimina: ${item.text}`} onClick={onRemove}>
        <SmallCloseIcon />
      </button>
    </div>
  );
}

/**
 * La scheda Da fare della Stanza comune (stanza-comune.html): il foglietto della sessione, uno solo e su questo
 * computer. Le voci fatte si sbarrano, stanno sotto "Fatte (n)" e spariscono da sole il giorno dopo.
 * `onOpenSharing`: apre "Cosa vedono gli altri", dove si sceglie se mostrarlo ai gruppi.
 */
function RoomTodo({ onOpenSharing }: { onOpenSharing: () => void }) {
  const { settings } = useSettings();
  const { items, loaded, add, toggle, remove } = useTodo();
  const [draft, setDraft] = useState("");
  const [doneOpen, setDoneOpen] = useState(false);
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const report = (e: unknown) => console.error("Foglietto Da fare non aggiornato:", e);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    add(text).catch(report);
  }

  const row = (item: TodoItem) => (
    <TodoRow
      key={item.id}
      item={item}
      onToggle={() => toggle(item.id, !item.done).catch(report)}
      onRemove={() => remove(item.id).catch(report)}
    />
  );

  return (
    <div className="rtd">
      <div className="rtd-top">
        <span className="rtd-who">
          {settings.groupsShareTodo ? <EyeIcon /> : <LockIcon />}
          <span>
            {settings.groupsShareTodo ? "La vedono i tuoi gruppi, solo mentre sei connesso." : "Solo tu vedi questa lista."}{" "}
            <button type="button" className="rtd-link" onClick={onOpenSharing}>
              Cosa vedono gli altri
            </button>
          </span>
        </span>
        <form className="rtd-add" onSubmit={submit}>
          <label className="rtd-field">
            <span className="rtd-sr">Nuova cosa da fare</span>
            <input
              type="text"
              className="grp-field rtd-input"
              maxLength={TODO_TEXT_MAX}
              placeholder="Aggiungi una cosa da fare"
              value={draft}
              autoComplete="off"
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <button type="submit" className="rtd-plus" aria-label="Aggiungi">
            <SmallPlusIcon />
          </button>
        </form>
      </div>
      <div className="rtd-list">
        {open.map(row)}
        {loaded && open.length === 0 && <span className="rtd-empty">Niente in sospeso. Aggiungi qui sopra quello che vuoi fare mentre studi.</span>}
        {done.length > 0 && (
          <>
            <button type="button" className="rtd-done-toggle" aria-expanded={doneOpen} onClick={() => setDoneOpen(!doneOpen)}>
              <span className={`rtd-chevron${doneOpen ? " is-open" : ""}`}>
                <ChevronIcon />
              </span>
              Fatte ({done.length})
            </button>
            {doneOpen && done.map(row)}
          </>
        )}
      </div>
    </div>
  );
}

export default RoomTodo;
