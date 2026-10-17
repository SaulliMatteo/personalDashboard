import { useEffect, useMemo, useState, type FormEvent } from "react";
import { MdOutlineContentCopy, MdOutlineEdit, MdSwapVert } from "react-icons/md";
import ConfirmButton from "../../../ui/ConfirmButton";
import { addNote, deleteNote, listNotes, updateNote, type SavedVideo, type VideoNote } from "../data/youtubeRepository";
import { copyText } from "../lib/clipboard";
import { notesToMarkdown, sortNotes, splitNote, type NoteSort } from "../lib/notes";
import { formatTimestamp } from "../lib/youtube";
import type { PlayerHandle } from "./VideoPlayer";
import type { RefObject } from "react";

interface NotesPanelProps {
  video: SavedVideo;
  playerRef: RefObject<PlayerHandle | null>;
  onError: (message: string) => void;
  /** Dopo aggiunta/eliminazione: serve a tenere aggiornati i conteggi altrove. */
  onChanged?: () => void;
}

const SORT_LABEL: Record<NoteSort, string> = { time: "Per minutaggio", recent: "Più recenti" };

/** Appunti del video: compositore agganciato al minuto attuale, elenco ordinabile, modifica, esportazione. */
function NotesPanel({ video, playerRef, onError, onChanged }: NotesPanelProps) {
  const [notes, setNotes] = useState<VideoNote[]>([]);
  const [text, setText] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [sort, setSort] = useState<NoteSort>("time");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listNotes(video.id)
      .then((result) => {
        if (!cancelled) setNotes(result);
      })
      .catch((e) => onError(String(e)));
    return () => {
      cancelled = true;
    };
    // onError è stabile per chi chiama (setter di stato).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, version]);

  // Il minuto "attuale" del compositore: si aggiorna ogni secondo, solo se il player risponde.
  useEffect(() => {
    const read = () => {
      try {
        const handle = playerRef.current;
        setNow(handle ? handle.getCurrentTime() : null);
      } catch {
        setNow(null);
      }
    };
    read();
    const timer = window.setInterval(read, 1000);
    return () => window.clearInterval(timer);
  }, [playerRef, video.id]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(null), 2200);
    return () => window.clearTimeout(t);
  }, [copied]);

  const sorted = useMemo(() => sortNotes(notes, sort), [notes, sort]);
  const refresh = () => {
    setVersion((v) => v + 1);
    onChanged?.();
  };

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const value = text.trim();
    if (!value) return;
    const handle = playerRef.current;
    if (!handle) {
      onError("Il player non è ancora pronto: aspetta che il video si carichi.");
      return;
    }
    try {
      await addNote(video.id, handle.getCurrentTime(), value);
      setText("");
      refresh();
    } catch (err) {
      onError(String(err));
    }
  }

  async function saveEdit(id: number) {
    const value = editText.trim();
    if (!value) return;
    try {
      await updateNote(id, value);
      setEditingId(null);
      refresh();
    } catch (err) {
      onError(String(err));
    }
  }

  async function exportNotes() {
    const ok = await copyText(notesToMarkdown(video, notes));
    setCopied(ok ? "ok" : "fail");
  }

  return (
    <section className="yt-card yt-notes">
      <div className="yt-notes-head">
        <h3>Appunti</h3>
        <span className="yt-muted">{notes.length === 1 ? "1 nota" : `${notes.length} note`}</span>
      </div>

      <form className="yt-composer" onSubmit={(e) => void submit(e)}>
        <div className="yt-composer-time">
          <span className="yt-label">AGGIUNGI NOTA AL MINUTO</span>
          <span className="yt-composer-chip">{now === null ? "—" : formatTimestamp(now)}</span>
        </div>
        <textarea
          className="yt-input yt-composer-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Scrivi un appunto… (la prima riga è il titolo; Ctrl+Invio per salvare)"
          rows={3}
          aria-label="Testo della nota"
        />
        <button type="submit" className="yt-btn yt-btn--primary" disabled={!text.trim()}>
          Salva nota
        </button>
      </form>

      <div className="yt-notes-toolbar">
        <button type="button" className="yt-link-btn" onClick={() => setSort((s) => (s === "time" ? "recent" : "time"))} title="Cambia ordinamento">
          <MdSwapVert /> {SORT_LABEL[sort]}
        </button>
        <button type="button" className="yt-link-btn" onClick={() => void exportNotes()} disabled={notes.length === 0} title="Copia gli appunti negli appunti di sistema, in Markdown">
          <MdOutlineContentCopy /> {copied === "ok" ? "Copiati!" : copied === "fail" ? "Copia non riuscita" : "Esporta appunti"}
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="yt-muted yt-notes-empty">Nessun appunto per questo video.</p>
      ) : (
        <ul className="yt-note-list">
          {sorted.map((note) => {
            const { title, body } = splitNote(note.text);
            return (
              <li key={note.id} className="yt-note">
                <button type="button" className="yt-note-time" onClick={() => playerRef.current?.seekTo(note.timestampSeconds)} title="Vai a questo punto del video">
                  {formatTimestamp(note.timestampSeconds)}
                </button>
                {editingId === note.id ? (
                  <div className="yt-note-edit">
                    <textarea className="yt-input" value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} aria-label="Modifica nota" autoFocus />
                    <div className="yt-note-edit-actions">
                      <button type="button" className="yt-btn" onClick={() => setEditingId(null)}>
                        Annulla
                      </button>
                      <button type="button" className="yt-btn yt-btn--primary" disabled={!editText.trim()} onClick={() => void saveEdit(note.id)}>
                        Salva
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="yt-note-text">
                      <span className={body ? "yt-note-title" : undefined}>{title}</span>
                      {body && <span className="yt-note-body">{body}</span>}
                    </div>
                    <div className="yt-note-actions">
                      <button
                        type="button"
                        className="yt-icon-btn"
                        onClick={() => {
                          setEditingId(note.id);
                          setEditText(note.text);
                        }}
                        aria-label="Modifica nota"
                        title="Modifica"
                      >
                        <MdOutlineEdit />
                      </button>
                      <ConfirmButton
                        className="yt-icon-btn yt-icon-btn--danger"
                        label="✕"
                        confirmLabel="Elimina?"
                        onConfirm={async () => {
                          try {
                            await deleteNote(note.id);
                            refresh();
                          } catch (err) {
                            onError(String(err));
                          }
                        }}
                      />
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default NotesPanel;
