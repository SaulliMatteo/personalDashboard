import { useEffect, useState } from "react";
import { listNotes, type NoteSummary } from "../data/notesRepository";
import { relativeWhen } from "../lib/html";
import "./NotesMini.css";

/** Mini da intestazione: quante note ci sono e l'ultima modificata. */
function NotesMini() {
  const [notes, setNotes] = useState<NoteSummary[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listNotes()
      .then((all) => {
        if (cancelled) return;
        setNotes(all.filter((n) => n.deletedAt === null).sort((a, b) => b.updatedAt - a.updatedAt));
      })
      .catch((error) => {
        console.error("Errore nel caricamento delle note:", error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="notes-mini notes-mini--error" role="alert" title="Impossibile caricare le note (dettagli nella console)">
        <span className="notes-mini-num">!</span>
        <span className="notes-mini-text">
          <span className="notes-mini-title">Note non disponibili</span>
          <span>errore di caricamento</span>
        </span>
      </div>
    );
  }

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
