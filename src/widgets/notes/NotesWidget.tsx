import { useEffect, useState, type MouseEvent } from "react";
import { useNav } from "../../core/nav/useNav";
import { useThemeVariant } from "../../core/theme/variants";
import WidgetFrame from "../../core/widgets/WidgetFrame";
import type { WidgetProps } from "../../core/widgets/types";
import { sizeKey } from "../../core/widgets/sizes";
import { listNotes, type NoteSummary } from "./data/notesRepository";
import { relativeWhen } from "./lib/html";
import { requestOpenNote } from "./lib/launch";
import "./NotesWidget.css";

/**
 * Nei mockup la 3×1 ha due forme: intestazione sopra le note (Notte,
 * Quaderno) oppure il numero grande a sinistra (Opaco, Fosforo).
 */
const NUMBER_ON_SIDE = { notte: false, opaco: true, quaderno: false, fosforo: true };

/** Note recenti nella 3×1, nell'elenco della 2×2. */
const RECENT = { STRIP: 3, M: 4 };

/** Widget in dashboard: quante note ci sono e le ultime modificate. Un click su una nota la apre nel Quaderno. */
function NotesWidget({ w, h }: WidgetProps) {
  const { openWidgetDetail } = useNav();
  const numberOnSide = useThemeVariant(NUMBER_ON_SIDE);
  const size = sizeKey(w, h);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listNotes()
      .then((all) => {
        if (cancelled) return;
        setNotes(all.filter((n) => n.deletedAt === null).sort((a, b) => b.updatedAt - a.updatedAt));
        setReady(true);
      })
      .catch((error) => {
        console.error("Errore nel caricamento delle note:", error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const count = ready ? notes.length : failed ? "!" : "–";
  const countLabel = failed ? "errore" : notes.length === 1 ? "nota" : "note";
  const errorTitle = failed ? "Impossibile caricare le note (dettagli nella console)" : undefined;

  function openNote(e: MouseEvent, id: number) {
    e.stopPropagation();
    requestOpenNote(id);
    openWidgetDetail("notes");
  }

  if (size === "S") {
    return (
      <WidgetFrame>
        <article
          className={`widget nw nw--S${failed ? " nw--error" : ""}`}
          aria-label={errorTitle ?? `Note: ${count}`}
          title={errorTitle}
        >
          <span className="nw-num">{count}</span>
          <span className="nw-cap">{countLabel}</span>
        </article>
      </WidgetFrame>
    );
  }

  const recent = notes.slice(0, size === "M" ? RECENT.M : RECENT.STRIP);
  const empty = failed ? (
    <p className="nw-empty nw-error" role="alert">
      Impossibile caricare le note.
    </p>
  ) : (
    ready && notes.length === 0 && <p className="nw-empty">Nessuna nota ancora. Apri il Quaderno per iniziare.</p>
  );

  const head = numberOnSide ? (
    <div className="nw-side">
      <span className="nw-num">{count}</span>
      <span className="nw-side-label">{countLabel}</span>
    </div>
  ) : (
    <header className="nw-head">
      <h2>Note</h2>
      <span className="nw-count">
        {count} {countLabel}
      </span>
    </header>
  );

  const items = recent.map((note) => (
    <button key={note.id} type="button" className="nw-note" onClick={(e) => openNote(e, note.id)} title={`Apri ${note.title || "Senza titolo"}`}>
      <span className="nw-note-title">{note.title || "Senza titolo"}</span>
      <span className="nw-note-when">{relativeWhen(note.updatedAt)}</span>
    </button>
  ));

  return (
    <WidgetFrame>
      <article className={`widget nw nw--${size}${numberOnSide ? " nw--side" : ""}${failed ? " nw--error" : ""}`} title={errorTitle}>
        {head}
        {empty || <div className={size === "M" ? "nw-list" : "nw-cells"}>{items}</div>}
      </article>
    </WidgetFrame>
  );
}

export default NotesWidget;
