import { useRef, useState, type CSSProperties } from "react";
import { MdClose } from "react-icons/md";
import Popover from "../../../ui/Popover";
import { createCategory, deleteCategory } from "../data/calendarRepository";
import { notifyCalendarChanged } from "../data/calendarChanges";
import { EVENT_COLORS } from "../lib/palette";
import type { CalendarCategory } from "../lib/types";
import ColorPicker from "./ColorPicker";

/* "Categoria" del pannello: chip della categoria; il clic apre l'elenco, "Nessuna" e "Nuova categoria". */

interface CategoryPickerProps {
  value: number | null;
  categories: CalendarCategory[];
  onChange: (id: number | null) => void;
}

function CategoryPicker({ value, categories, onChange }: CategoryPickerProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(EVENT_COLORS[0]);
  const current = categories.find((c) => c.id === value) ?? null;

  async function create() {
    const n = name.trim();
    if (!n) return;
    const id = await createCategory(n, color);
    setName("");
    onChange(id);
    notifyCalendarChanged();
    setOpen(false);
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={current ? "cal-panel-chip" : "cal-panel-value cal-panel-value--empty"}
        style={current ? ({ "--item": current.color } as CSSProperties) : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {current ? (
          <>
            <i className="cal-mark cal-mark--event" aria-hidden="true" />
            {current.name}
          </>
        ) : (
          "Nessuna"
        )}
      </button>
      {open && (
        <Popover anchor={ref} onClose={() => setOpen(false)} className="cal-mini-pop" label="Categoria">
          <div className="cal-mini-list" role="listbox" aria-label="Categorie">
            <button type="button" role="option" aria-selected={value === null} className="cal-mini-option" onClick={() => (onChange(null), setOpen(false))}>
              Nessuna
            </button>
            {categories.map((c) => (
              <div key={c.id} className="cal-mini-row">
                <button
                  type="button"
                  role="option"
                  aria-selected={value === c.id}
                  className="cal-mini-option"
                  style={{ "--item": c.color } as CSSProperties}
                  onClick={() => (onChange(c.id), setOpen(false))}
                >
                  <i className="cal-mark cal-mark--event" aria-hidden="true" />
                  {c.name}
                </button>
                <button
                  type="button"
                  className="cal-mini-remove"
                  aria-label={`Elimina la categoria ${c.name}`}
                  title="Elimina la categoria (gli eventi restano, senza categoria)"
                  onClick={async () => {
                    await deleteCategory(c.id);
                    if (value === c.id) onChange(null);
                    notifyCalendarChanged();
                  }}
                >
                  <MdClose aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <form
            className="cal-mini-form cal-mini-form--column"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <input
              type="text"
              className="cal-field"
              placeholder="Nuova categoria"
              aria-label="Nome della nuova categoria"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <ColorPicker value={color} onChange={(c) => c && setColor(c)} />
            <button type="submit" className="cal-btn-primary" disabled={!name.trim()}>
              Crea
            </button>
          </form>
        </Popover>
      )}
    </>
  );
}

export default CategoryPicker;
