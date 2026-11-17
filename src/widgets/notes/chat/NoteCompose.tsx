import { useEffect, useMemo, useState } from "react";
import type { ChatComposeProps } from "../../../core/widgets/chatActions";
import { ChatComposeFoot, ChatComposeList, ChatComposeRow, ChatComposeSearch } from "../../../ui/ChatCompose";
import { removeFriendBatch } from "../../../core/cloud/friendFilesApi";
import { getPages, listNotes, type NotePage, type NoteSummary } from "../data/notesRepository";
import { relativeWhen } from "../lib/html";
import { formatBytes } from "../lib/insertFiles";
import { pdfThumbName } from "../lib/pdf/pdfData";
import { buildNotePayload } from "./notePayload";
import { cleanNoteHtml, readNoteFiles, rememberNote, uploadNoteFiles, type LocalNoteFile } from "./noteChat";
import "./NoteChat.css";

type Prepared =
  | { state: "none" }
  | { state: "loading"; noteId: number }
  | { state: "ready"; noteId: number; payload: Record<string, unknown>; note: string | null; build: (batch: string | null) => Record<string, unknown>; files: LocalNoteFile[] }
  | { state: "error"; noteId: number; message: string };

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Un lotto finto per provare il payload alla scelta (dimensioni e limiti): quello vero si crea all'invio. */
const DRAFT_BATCH = "00000000-0000-4000-8000-000000000000";

/** "3 allegati e immagini, 1 PDF · 4,2 MB" (le miniature dei PDF non si contano). */
function filesSummary(files: readonly LocalNoteFile[], pages: readonly NotePage[]): string {
  const pdfs = new Set(pages.flatMap((p) => (p.pdf ? [p.pdf.file] : [])));
  const thumbs = new Set([...pdfs].map(pdfThumbName));
  const pdfCount = files.filter((f) => pdfs.has(f.name)).length;
  const others = files.filter((f) => !pdfs.has(f.name) && !thumbs.has(f.name)).length;
  const parts = [others > 0 && (others === 1 ? "1 allegato o immagine" : `${others} allegati e immagini`), pdfCount > 0 && `${pdfCount} PDF`].filter(Boolean);
  return `${parts.join(", ")} · ${formatBytes(files.reduce((n, f) => n + f.size, 0))}`;
}

/** "Invia una nota" (docs/mockup/gruppi/amici-notifiche.html, vista 5): si sceglie tra le proprie note, si manda una copia completa. */
function NoteCompose({ send, onClose, myId, friendId }: ChatComposeProps) {
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [prepared, setPrepared] = useState<Prepared>({ state: "none" });
  const [uploaded, setUploaded] = useState<number | null>(null);

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
      const files = await readNoteFiles(note.id, note.diskPath, pages);
      const list = files.map(({ name, size }) => ({ name, size }));
      const build = (batch: string | null) =>
        buildNotePayload(note.title, note.titleColor, pages, cleanNoteHtml, batch && list.length > 0 ? { batch, list } : null);
      const payload = build(DRAFT_BATCH);
      const sent = (payload.pages as unknown[]).length;
      const left = Math.min(pages.length, 50) - sent;
      const parts = [
        files.length > 0 ? `Si manda una copia completa con ${filesSummary(files, pages)}.` : null,
        left > 0 ? `${left === 1 ? "1 pagina PDF resta fuori" : `${left} pagine PDF restano fuori`}: il file non è sul disco.` : null,
      ].filter(Boolean);
      next = { state: "ready", noteId: note.id, payload, note: parts.length > 0 ? parts.join(" ") : null, build, files };
    } catch (err) {
      next = { state: "error", noteId: note.id, message: err instanceof Error ? err.message : String(err) };
    }
    // si tiene solo l'ultima scelta
    setPrepared((cur) => (cur.state !== "none" && cur.noteId === note.id ? next : cur));
  }

  /** Prima i file nel lotto, poi il messaggio; se il messaggio non parte il lotto si cancella. */
  async function sendNote(_draft: Record<string, unknown>, comment: string): Promise<string> {
    if (prepared.state !== "ready") throw new Error("Nessuna nota scelta.");
    const { files, build } = prepared;
    if (files.length === 0) return send(build(null), comment);
    setUploaded(0);
    try {
      const place = await uploadNoteFiles(myId, friendId, files, setUploaded);
      try {
        return await send(build(place.batch), comment);
      } catch (err) {
        await removeFriendBatch(place).catch(() => undefined);
        throw err;
      }
    } catch (err) {
      throw new Error(err instanceof Error && err.message ? err.message : "File non caricati: riprova.");
    } finally {
      setUploaded(null);
    }
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
        {uploaded !== null && prepared.state === "ready"
          ? `Carico i file… ${uploaded}/${prepared.files.length}`
          : prepared.state === "ready" && prepared.note
            ? prepared.note
            : "Si manda una copia completa: testo, tabelle, scrittura a mano, immagini, allegati e PDF (fino a 10 MB di file)."}
      </p>
      <ChatComposeFoot
        payload={prepared.state === "ready" ? prepared.payload : null}
        busy={prepared.state === "loading"}
        error={prepared.state === "error" ? prepared.message : null}
        send={sendNote}
        onClose={onClose}
        onSent={(messageId) => (prepared.state === "ready" ? rememberNote(messageId, prepared.noteId) : undefined)}
      />
    </>
  );
}

export default NoteCompose;
