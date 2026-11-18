import { useEffect, useState, type RefObject } from "react";
import Popover from "../../../ui/Popover";
import { searchNoteRefs, type NoteRef } from "../../../core/notes/noteRefsRepository";
import "./NotePicker.css";

/*
 * Scelta di una nota del Quaderno da collegare: ricerca per titolo (vuota = le più recenti). Legge da core/notes:
 * il Calendario non importa il widget Quaderno.
 */

interface NotePickerProps {
  anchor: RefObject<HTMLElement | null>;
  /** Note già collegate qui (non si propongono di nuovo). */
  exclude?: readonly number[];
  onPick: (note: NoteRef) => void;
  onClose: () => void;
}

function NotePicker({ anchor, exclude = [], onPick, onClose }: NotePickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteRef[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      searchNoteRefs(query, 30)
        .then((r) => !cancelled && setResults(r))
        .catch((error) => console.error("Calendario: note non lette", error));
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  const shown = (results ?? []).filter((n) => !exclude.includes(n.id));
  return (
    <Popover anchor={anchor} onClose={onClose} className="cal-notepick" label="Collega una nota">
      <input
        type="search"
        className="cal-notepick-search"
        placeholder="Cerca una nota del Quaderno"
        aria-label="Cerca una nota"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && shown[0]) {
            e.preventDefault();
            onPick(shown[0]);
          }
        }}
      />
      <div className="cal-notepick-list" role="listbox" aria-label="Note">
        {results === null ? (
          <p className="cal-notepick-empty">Caricamento…</p>
        ) : shown.length === 0 ? (
          <p className="cal-notepick-empty">{query.trim() ? "Nessuna nota con questo titolo." : "Nessuna nota nel Quaderno."}</p>
        ) : (
          shown.map((n) => (
            <button key={n.id} type="button" role="option" aria-selected={false} className="cal-notepick-item" onClick={() => onPick(n)}>
              <i className="cal-mark cal-mark--note" aria-hidden="true" />
              <span className="cal-notepick-text">
                <span>{n.title || "Nota senza titolo"}</span>
                {n.folderName && <span className="cal-notepick-folder">{n.folderName}</span>}
              </span>
            </button>
          ))
        )}
      </div>
    </Popover>
  );
}

export default NotePicker;
