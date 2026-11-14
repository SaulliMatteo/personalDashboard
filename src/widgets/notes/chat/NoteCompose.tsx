import { useEffect, useMemo, useState } from "react";
import type { ChatComposeProps } from "../../../core/widgets/chatActions";
import { ChatComposeFoot, ChatComposeList, ChatComposeRow, ChatComposeSearch } from "../../../ui/ChatCompose";
import { getPages, listNotes, type NoteSummary } from "../data/notesRepository";
import { relativeWhen } from "../lib/html";
import { buildNotePayload } from "./notePayload";
import { cleanNoteHtml, rememberNote } from "./noteChat";
import "./NoteChat.css";

type Prepared =
  | { state: "none" }
  | { state: "loading"; noteId: number }
  | { state: "ready"; noteId: number; payload: Record<string, unknown>; note: string | null }
  | { state: "error"; noteId: number; message: string };

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** "Invia una nota" (docs/mockup/gruppi/amici-notifiche.html, vista 5): si sceglie tra le proprie note, si manda una copia. */
function NoteCompose({ send, onClose }: ChatComposeProps) {
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [prepared, setPrepared] = useState<Prepared>({ state: "none" });

  useEffect(() => {
    let cancelled = false;
    listNotes()
      .then((list) => {
        if (!cancelled) setNotes(list.filter((n) => n.deletedAt === null));
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    if (!notes) return [];
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return words.length === 0 ? notes : notes.filter((n) => words.every((w) => normalize(n.title).includes(w)));
  }, [notes, query]);

  async function choose(note: NoteSummary) {
    setPrepared({ state: "loading", noteId: note.id });
    let next: Prepared;
    try {
      const pages = await getPages(note.id);
      const built = buildNotePayload(note.title, note.titleColor, pages, cleanNoteHtml);
      next =
        built.skippedPdf === pages.length
          ? { state: "error", noteId: note.id, message: "Questa nota ha solo PDF: i file non si mandano." }
          : {
              state: "ready",
              noteId: note.id,
              payload: built.payload,
              note: built.skippedPdf > 0 ? "Le pagine con un PDF restano fuori." : null,
            };
    } catch (err) {
      next = { state: "error", noteId: note.id, message: err instanceof Error ? err.message : String(err) };
    }
    // si tiene solo l'ultima scelta
    setPrepared((cur) => (cur.state !== "none" && cur.noteId === note.id ? next : cur));
  }

  const selectedId = prepared.state === "none" ? null : prepared.noteId;

  return (
    <>
      <ChatComposeSearch value={query} onChange={setQuery} placeholder="Cerca tra le tue note" />
      <ChatComposeList
        empty={
          loadError ??
          (notes === null
            ? "Carico le note…"
            : notes.length === 0
              ? "Nessuna nota da mandare."
              : shown.length === 0
                ? "Nessuna nota con queste parole."
                : null)
        }
      >
        {shown.map((n) => (
          <ChatComposeRow
            key={n.id}
            selected={selectedId === n.id}
            onSelect={() => void choose(n)}
            title={n.title || "Nota senza titolo"}
            sub={`${relativeWhen(n.updatedAt)} · ${n.pageCount === 1 ? "1 pagina" : `${n.pageCount} pagine`}`}
          />
        ))}
      </ChatComposeList>
      <p className="nqc-hint">
        {prepared.state === "ready" && prepared.note ? prepared.note : "Si manda una copia: testo, tabelle e scrittura a mano, senza allegati e PDF."}
      </p>
      <ChatComposeFoot
        payload={prepared.state === "ready" ? prepared.payload : null}
        busy={prepared.state === "loading"}
        error={prepared.state === "error" ? prepared.message : null}
        send={send}
        onClose={onClose}
        onSent={(messageId) => (prepared.state === "ready" ? rememberNote(messageId, prepared.noteId) : undefined)}
      />
    </>
  );
}

export default NoteCompose;
