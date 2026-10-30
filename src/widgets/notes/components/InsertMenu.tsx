import type { InsertItem } from "../lib/insertItems";
import "./InsertMenu.css";

interface InsertMenuProps {
  items: InsertItem[];
  active: number;
  /** Posizione (px, rispetto alla finestra) sotto il cursore. */
  left: number;
  top: number;
  onPick: (item: InsertItem) => void;
  onHover: (index: number) => void;
}

/** Menu "inserisci" aperto da "/" a inizio riga: frecce per scegliere, Invio per inserire, Esc per chiudere. */
function InsertMenu({ items, active, left, top, onPick, onHover }: InsertMenuProps) {
  return (
    <div
      className="nq-slash"
      role="listbox"
      aria-label="Inserisci"
      style={{ left, top }}
      // Il click non deve togliere il cursore dalla pagina (la voce si inserisce lì).
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.length === 0 && <p className="nq-slash-empty">Nessuna voce. Esc per chiudere.</p>}
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={i === active}
          className="nq-slash-opt"
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(item)}
        >
          {item.icon}
          <span>{item.label}</span>
          {item.hint && <small>{item.hint}</small>}
        </button>
      ))}
    </div>
  );
}

export default InsertMenu;
