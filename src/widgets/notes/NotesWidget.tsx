import { useEffect, useState } from "react";
import { MdOutlineDescription } from "react-icons/md";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { listNotes, type NoteSummary } from "./data/notesRepository";
import { formatWhen } from "./lib/html";
import "./NotesWidget.css";

/** Widget in dashboard: quante note ci sono e le ultime modificate. Il click apre il Quaderno. */
function NotesWidget({ w, h }: WidgetProps) {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listNotes()
      .then((all) => {
        if (cancelled) return;
        setNotes(all.filter((n) => n.deletedAt === null));
        setReady(true);
      })
      .catch((error) => console.error("Errore nel caricamento delle note:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const isLarge = w >= 2 && h >= 2;

  return (
    <WidgetFrame>
      <article className={`widget notes-widget${isLarge ? " notes-widget--large" : ""}`}>
        {isLarge ? (
          <>
            <header className="notes-widget-head">
              <span className="notes-widget-icon">
                <MdOutlineDescription />
              </span>
              <div>
                <strong>Quaderno</strong>
                <span>{ready ? `${notes.length} ${notes.length === 1 ? "nota" : "note"}` : ""}</span>
              </div>
            </header>
            {ready && notes.length === 0 ? (
              <p className="notes-widget-empty">Nessuna nota ancora. Apri il Quaderno per iniziare.</p>
            ) : (
              <ul className="notes-widget-list">
                {notes.slice(0, 4).map((note) => (
                  <li key={note.id}>
                    <span className="notes-widget-title">{note.title || "Senza titolo"}</span>
                    <span className="notes-widget-when">{formatWhen(note.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="notes-widget-small">
            <span className="notes-widget-icon">
              <MdOutlineDescription />
            </span>
            <strong>{ready ? notes.length : "–"}</strong>
            <span>note</span>
          </div>
        )}
      </article>
    </WidgetFrame>
  );
}

export default NotesWidget;
