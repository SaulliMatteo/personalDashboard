import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { useNow } from "../../../core/hooks/useNow";
import { useNav } from "../../../core/nav/useNav";
import { createNote, listFolders, listNotes, type Folder, type NoteSummary } from "../data/notesRepository";
import { htmlToText, relativeWhen } from "../lib/html";
import { requestOpenNote } from "../lib/launch";
import { formatDate, rowTitle, toDateString } from "../lib/collections";
import { fieldsOf, loadCollections, rowsOf, useCollections, type CollectionsState } from "../lib/collectionsStore";

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

/** La prossima voce di una raccolta (riga con una data da oggi in poi): riga in fondo alla 2×2. */
export interface NotesCardNext {
  collection: string;
  title: string;
  /** "12 nov" */
  when: string;
}

/** Tra tutte le raccolte vive, la riga con la data più vicina da oggi in poi. */
function nextRow(s: CollectionsState, now: number): NotesCardNext | null {
  const today = toDateString(new Date(now));
  const ctx = { now: new Date(now), noteTitle: () => null };
  let best: { date: string; next: NotesCardNext } | null = null;
  for (const c of s.collections) {
    if (c.deletedAt !== null) continue;
    const fields = fieldsOf(s, c.id);
    const dates = fields.filter((f) => f.type === "date");
    if (dates.length === 0) continue;
    for (const r of rowsOf(s, c.id)) {
      if (r.deletedAt !== null) continue;
      for (const f of dates) {
        const v = r.data[String(f.id)];
        if (typeof v !== "string" || v < today || (best && best.date <= v)) continue;
        best = { date: v, next: { collection: c.name, title: rowTitle(fields, r, ctx), when: formatDate(v, ctx.now) } };
      }
    }
  }
  return best?.next ?? null;
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
  next: NotesCardNext | null;
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

  // Raccolte (cache condivisa con la pagina Notes): per la riga "Prossima…".
  const collections = useCollections();
  useEffect(() => {
    void loadCollections();
  }, []);

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
    next: collections.loaded ? nextRow(collections, now) : null,
  };
}
