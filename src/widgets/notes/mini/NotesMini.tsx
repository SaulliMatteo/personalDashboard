import { useEffect, useState } from "react";
import { listNotes, type NoteSummary } from "../data/notesRepository";
import { relativeWhen } from "../lib/html";
import "./NotesMini.css";

/** Mini da intestazione: quante note ci sono e l'ultima modificata. */
function NotesMini() {
  const [notes, setNotes] = useState<NoteSummary[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    listNotes()
      .then((all) => {
        if (cancelled) return;
        setNotes(all.filter((n) => n.deletedAt === null).sort((a, b) => b.updatedAt - a.updatedAt));
      })
      .catch((error) => console.error("Errore nel caricamento delle note:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const last = notes?.[0];
  return (
    <div className="notes-mini">
      <span className="notes-mini-num">{notes ? notes.length : "–"}</span>
      <span className="notes-mini-text">
        <span className="notes-mini-title">{last ? last.title || "Senza titolo" : notes?.length === 1 ? "nota" : "note"}</span>
        {last && <span>{relativeWhen(last.updatedAt)}</span>}
      </span>
    </div>
  );
}

export default NotesMini;
