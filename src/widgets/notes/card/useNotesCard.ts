import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { useNow } from "../../../core/hooks/useNow";
import { useNav } from "../../../core/nav/useNav";
import { createNote, listFolders, listNotes, type Folder, type NoteSummary } from "../data/notesRepository";
import { htmlToText, relativeWhen } from "../lib/html";
import { requestOpenNote } from "../lib/launch";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface NotesCardNote {
  id: number;
  title: string;
  /** Prima riga di testo della nota (anteprima della 3×1). */
  excerpt: string;
  /** "2 min fa", "ieri"… */
  when: string;
  /** Colore della cartella (scelto dall'utente), null = senza cartella o senza colore. */
  color: string | null;
}

export interface NotesCardData {
  ready: boolean;
  failed: boolean;
  count: number;
  /** "042" in Fosforo: il conteggio a tre cifre. */
  countPadded: string;
  countLabel: string;
  /** Note modificate negli ultimi 7 giorni (le tacche accese della ghiera in Notte). */
  recentWeek: number;
  notes: NotesCardNote[];
  errorTitle: string | undefined;
  open: (e: MouseEvent, id: number) => void;
  /** Crea una nota vuota in "Senza cartella" e la apre. */
  createAndOpen: (e: MouseEvent) => void;
  /** Nota veloce dalla 2×2: titolo = testo scritto, resta in dashboard. */
  quickCreate: (text: string) => Promise<boolean>;
}

/** Dati comuni alle card di tutti i temi: le card cambiano solo forma. */
export function useNotesCard(): NotesCardData {
  const { openWidgetDetail } = useNav();
  const [raw, setRaw] = useState<NoteSummary[]>([]);
  const [colors, setColors] = useState<Map<number, string | null>>(new Map());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // "2 min fa" si aggiorna da solo ogni minuto.
  const now = useNow().getTime();

  const apply = useCallback(([all, folders]: [NoteSummary[], Folder[]]) => {
    setRaw(all.filter((n) => n.deletedAt === null).sort((a, b) => b.updatedAt - a.updatedAt));
    setColors(new Map(folders.map((f) => [f.id, f.color])));
    setReady(true);
  }, []);

  const load = useCallback(() => Promise.all([listNotes(), listFolders()]).then(apply), [apply]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listNotes(), listFolders()])
      .then((result) => {
        if (!cancelled) apply(result);
      })
      .catch((error) => {
        console.error("Errore nel caricamento delle note:", error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const notes = raw.map((n) => ({
    id: n.id,
    title: n.title || "Senza titolo",
    excerpt: htmlToText(n.firstContent).slice(0, 200),
    when: relativeWhen(n.updatedAt, now),
    color: n.folderId !== null ? colors.get(n.folderId) ?? null : null,
  }));

  function open(e: MouseEvent, id: number) {
    e.stopPropagation();
    requestOpenNote(id);
    openWidgetDetail("notes");
  }

  function createAndOpen(e: MouseEvent) {
    e.stopPropagation();
    createNote(null)
      .then((id) => {
        requestOpenNote(id);
        openWidgetDetail("notes");
      })
      .catch((error) => console.error("Errore nella creazione della nota:", error));
  }

  async function quickCreate(text: string): Promise<boolean> {
    const title = text.trim().slice(0, 120);
    if (!title) return false;
    try {
      await createNote(null, { title, tags: [], pages: [{ content: "<p><br></p>", ink: [], background: "none" }] });
      await load();
      return true;
    } catch (error) {
      console.error("Errore nella creazione della nota veloce:", error);
      return false;
    }
  }

  const count = raw.length;
  return {
    ready,
    failed,
    count,
    countPadded: String(count).padStart(3, "0"),
    countLabel: failed ? "errore" : count === 1 ? "nota" : "note",
    recentWeek: raw.filter((n) => now - n.updatedAt < 7 * DAY_MS).length,
    notes,
    errorTitle: failed ? "Impossibile caricare le note (dettagli nella console)" : undefined,
    open,
    createAndOpen,
    quickCreate,
  };
}
