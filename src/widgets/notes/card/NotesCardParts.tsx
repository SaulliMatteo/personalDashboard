import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { MdAdd, MdOutlineDescription, MdOutlineStorage } from "react-icons/md";
import type { NotesCardData } from "./useNotesCard";
import "./notesCard.css";

/** Una nota in elenco: pallino del colore della cartella, titolo, quando. */
export function NoteRows({ data, limit }: { data: NotesCardData; limit: number }) {
  return (
    <>
      {data.notes.slice(0, limit).map((note) => (
        <button
          key={note.id}
          type="button"
          className="nc-row"
          onClick={(e) => data.open(e, note.id)}
          title={`Apri ${note.title}`}
        >
          <span className="nc-dot" style={note.color ? ({ "--nc-dot": note.color } as CSSProperties) : undefined} />
          <span className="nc-row-title">{note.title}</span>
          <time>{note.when}</time>
        </button>
      ))}
    </>
  );
}

/** Messaggio al posto delle note: errore di caricamento o nessuna nota. */
export function NotesEmpty({ data }: { data: NotesCardData }) {
  if (data.failed) {
    return (
      <p className="nc-empty nc-error" role="alert">
        Impossibile caricare le note.
      </p>
    );
  }
  if (data.ready && data.count === 0) return <p className="nc-empty">Nessuna nota ancora.</p>;
  return null;
}

/**
 * "Scrivi una nota veloce": Invio crea la nota in "Senza cartella".
 * Il mousedown non deve arrivare alla griglia (altrimenti partirebbe il trascinamento del widget).
 */
export function QuickNoteField({ data, icon }: { data: NotesCardData; icon: boolean }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");

  async function submit() {
    const ok = await data.quickCreate(text);
    setState(ok ? "saved" : text.trim() ? "failed" : "idle");
    if (ok) setText("");
    window.setTimeout(() => setState("idle"), 1600);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape") {
      setText("");
      e.currentTarget.blur();
    }
  }

  const placeholder = state === "saved" ? "Nota creata" : state === "failed" ? "Non salvata, riprova" : "Scrivi una nota veloce";
  return (
    <label className={`nc-quick${state !== "idle" ? ` is-${state}` : ""}`} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
      {icon && <MdAdd aria-hidden="true" />}
      <input
        value={text}
        placeholder={placeholder}
        maxLength={120}
        aria-label="Scrivi una nota veloce, Invio per salvarla"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onClick={(e) => e.stopPropagation()}
      />
    </label>
  );
}

/** 2×2: titolo, scrittura veloce, ultime note (4, o meno dove il tema le vuole più alte). */
export function NotesCardM({ data, quickIcon = true, limit = 4, extra }: { data: NotesCardData; quickIcon?: boolean; limit?: number; extra?: ReactNode }) {
  return (
    <div className="nc-m">
      <div className="nc-ttl">
        <MdOutlineDescription aria-hidden="true" />
        Notes
        <span className="nc-ttl-count">{data.ready ? data.count : data.failed ? "!" : "–"}</span>
      </div>
      <QuickNoteField data={data} icon={quickIcon} />
      <div className="nc-list">
        <NotesEmpty data={data} />
        <NoteRows data={data} limit={limit} />
      </div>
      {data.next && (
        <div className="nc-next" title={`${data.next.collection}: ${data.next.title}, ${data.next.when}`}>
          <span className="nc-next-led" aria-hidden="true" />
          <MdOutlineStorage className="nc-next-ico" aria-hidden="true" />
          <span className="nc-next-text">
            Prossima in {data.next.collection}: <b>{data.next.title}</b>, {data.next.when}
          </span>
        </div>
      )}
      {extra}
    </div>
  );
}

/** 3×1: anteprima dell'ultima nota a sinistra, due recenti e "Nuova nota" a destra. */
export function NotesCardStrip({ data }: { data: NotesCardData }) {
  const [last, ...rest] = data.notes;
  return (
    <div className="nc-strip">
      {last ? (
        <button type="button" className="nc-strip-main" onClick={(e) => data.open(e, last.id)} title={`Apri ${last.title}`}>
          <b>{last.title}</b>
          <p>{last.excerpt || "Nota vuota"}</p>
        </button>
      ) : (
        <div className="nc-strip-main nc-strip-main--empty">
          <NotesEmpty data={data} />
        </div>
      )}
      <div className="nc-strip-side">
        <NoteRows data={{ ...data, notes: rest }} limit={2} />
        <div>
          <button type="button" className="nc-btn" onClick={data.createAndOpen}>
            <MdAdd aria-hidden="true" /> Nuova nota
          </button>
        </div>
      </div>
    </div>
  );
}
