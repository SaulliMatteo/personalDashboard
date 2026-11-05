import { useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { MdChevronRight, MdDeleteOutline, MdEdit, MdExpandMore, MdOutlineDescription, MdOutlineFolder, MdOutlinePushPin, MdSearch } from "react-icons/md";
import type { BookmarkRow, Folder, NoteSummary } from "../data/notesRepository";
import { BOOKMARK_COLORS, BOOKMARK_KINDS, NAME_MAX, asBookmarkName, kindLabel, type BookmarkKind, type BookmarkPatch } from "../lib/bookmarks";
import { folderIcon } from "../lib/folders";
import { bookmarkColorVar, bookmarkIcon } from "./bookmarkIcons";
import NoteTitle from "./NoteTitle";
import PageMenu from "./PageMenu";
import "./BookmarkPanel.css";

interface BookmarkPanelProps {
  bookmarks: BookmarkRow[];
  /** Note non nel cestino (titoli e cartelle). */
  notes: NoteSummary[];
  childrenOf: Map<number | null, Folder[]>;
  folderById: Map<number, Folder>;
  /** Nota aperta nel riquadro principale (vista "Questa nota"). */
  openNoteId: number | null;
  /** `other` = Ctrl+clic: nell'altro lato dello schermo diviso. */
  onOpen: (b: BookmarkRow, other: boolean) => void;
  onEdit: (b: BookmarkRow, change: BookmarkPatch | "delete") => void;
}

type Scope = "nota" | "tutte";
/** Filtro colore: una chiave della palette, "tema" (predefinito) o "libero" (colori scelti a mano). */
type ColorFilter = string | "tema" | "libero";

const INDENT = 16;

function colorGroup(color: string | null): ColorFilter {
  if (!color) return "tema";
  return color.startsWith("#") ? "libero" : color;
}

/** La scheda "Segni" della barra laterale: segni della nota aperta o di tutte, con ricerca e filtri. */
function BookmarkPanel({ bookmarks, notes, childrenOf, folderById, openNoteId, onOpen, onEdit }: BookmarkPanelProps) {
  const [scopeChoice, setScope] = useState<Scope | null>(null);
  const scope: Scope = scopeChoice ?? (openNoteId !== null ? "nota" : "tutte");
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<Set<BookmarkKind>>(new Set());
  const [colors, setColors] = useState<Set<ColorFilter>>(new Set());
  /** Rami chiusi dell'albero ("f12", "n4", "n4-p1"): di solito è tutto aperto. */
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; b: BookmarkRow } | null>(null);

  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const q = query.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      bookmarks.filter(
        (b) =>
          noteById.has(b.noteId) &&
          (scope === "tutte" || b.noteId === openNoteId) &&
          (kinds.size === 0 || kinds.has(b.kind)) &&
          (colors.size === 0 || colors.has(colorGroup(b.color))) &&
          (!q || b.name.toLowerCase().includes(q))
      ),
    [bookmarks, noteById, scope, openNoteId, kinds, colors, q]
  );

  const byNote = useMemo(() => {
    const map = new Map<number, BookmarkRow[]>();
    for (const b of filtered) map.set(b.noteId, [...(map.get(b.noteId) ?? []), b]);
    return map;
  }, [filtered]);

  /** Note con segni per cartella (le note in cartelle sparite vanno in "Senza cartella"). */
  const notesByFolder = useMemo(() => {
    const map = new Map<number | null, NoteSummary[]>();
    for (const id of byNote.keys()) {
      const n = noteById.get(id);
      if (!n) continue;
      const key = n.folderId !== null && folderById.has(n.folderId) ? n.folderId : null;
      map.set(key, [...(map.get(key) ?? []), n]);
    }
    for (const list of map.values()) list.sort((a, b) => a.title.localeCompare(b.title, "it"));
    return map;
  }, [byNote, noteById, folderById]);

  const countIn = useMemo(() => {
    const memo = new Map<number, number>();
    const visit = (id: number): number => {
      const cached = memo.get(id);
      if (cached !== undefined) return cached;
      let n = (notesByFolder.get(id) ?? []).reduce((sum, note) => sum + (byNote.get(note.id)?.length ?? 0), 0);
      for (const child of childrenOf.get(id) ?? []) n += visit(child.id);
      memo.set(id, n);
      return n;
    };
    return visit;
  }, [notesByFolder, byNote, childrenOf]);

  function toggle(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  function toggleKind(kind: BookmarkKind) {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  function toggleColor(color: ColorFilter) {
    setColors((prev) => {
      const next = new Set(prev);
      if (next.has(color)) next.delete(color);
      else next.add(color);
      return next;
    });
  }

  function commitRename() {
    if (!renaming) return;
    const b = bookmarks.find((x) => x.id === renaming.id);
    const name = asBookmarkName(renaming.draft);
    setRenaming(null);
    if (b && name !== b.name) onEdit(b, { name });
  }

  const chevron = (key: string, label: string): ReactNode => (
    <button
      type="button"
      className="nq-tree-chevron"
      onClick={() => setClosed((prev) => toggle(prev, key))}
      aria-label={closed.has(key) ? `Espandi ${label}` : `Comprimi ${label}`}
      aria-expanded={!closed.has(key)}
    >
      {closed.has(key) ? <MdChevronRight /> : <MdExpandMore />}
    </button>
  );

  function renderMark(b: BookmarkRow, depth: number) {
    const editing = renaming?.id === b.id;
    return (
      <div key={b.id} className="nq-tree-row nq-bm-row" style={{ paddingLeft: 10 + depth * INDENT + 22 } as CSSProperties}>
        {editing ? (
          <input
            autoFocus
            className="nq-tree-input"
            value={renaming.draft}
            maxLength={NAME_MAX}
            aria-label="Nuovo nome del segno"
            onChange={(e) => setRenaming({ id: b.id, draft: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(null);
            }}
            onBlur={commitRename}
          />
        ) : (
          <button
            type="button"
            className="nq-tree-main"
            title={`${kindLabel(b.kind)}: ${b.name}${b.place === "pagina" ? " (sulla pagina)" : ""}\nCtrl+clic: nell'altro lato dello schermo diviso`}
            onClick={(e: MouseEvent) => onOpen(b, e.ctrlKey || e.metaKey)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, b });
            }}
          >
            <span className="nq-bm-ico" style={{ "--nq-bm": bookmarkColorVar(b.color) } as CSSProperties}>
              {bookmarkIcon(b.kind)}
            </span>
            <span className="nq-tree-name">{b.name}</span>
            {b.place === "pagina" && <MdOutlinePushPin className="nq-bm-pin" aria-label="Sulla pagina" />}
          </button>
        )}
      </div>
    );
  }

  /** I segni di una nota: per pagina se sono su più pagine (in "Questa nota" sempre). */
  function renderNoteMarks(noteId: number, depth: number, alwaysPages: boolean): ReactNode {
    const marks = byNote.get(noteId) ?? [];
    const pages = [...new Set(marks.map((b) => b.pageIndex))].sort((a, b) => a - b);
    if (!alwaysPages && pages.length <= 1) return marks.map((b) => renderMark(b, depth));
    return pages.map((page) => {
      const key = `n${noteId}-p${page}`;
      const list = marks.filter((b) => b.pageIndex === page);
      return (
        <div key={key}>
          <div className="nq-tree-row nq-bm-page" style={{ paddingLeft: 10 + depth * INDENT } as CSSProperties}>
            {chevron(key, `pagina ${page + 1}`)}
            <span className="nq-tree-main nq-bm-static">
              <span className="nq-tree-name">Pagina {page + 1}</span>
              <span className="nq-tree-count">{list.length}</span>
            </span>
          </div>
          {!closed.has(key) && list.map((b) => renderMark(b, depth + 1))}
        </div>
      );
    });
  }

  function renderNote(note: NoteSummary, depth: number) {
    const key = `n${note.id}`;
    const count = byNote.get(note.id)?.length ?? 0;
    return (
      <div key={key}>
        <div className={`nq-tree-row${note.id === openNoteId ? " is-active" : ""}`} style={{ paddingLeft: 10 + depth * INDENT } as CSSProperties}>
          {chevron(key, note.title || "Senza titolo")}
          <span className="nq-tree-main nq-bm-static">
            <MdOutlineDescription className="nq-tree-icon" />
            <NoteTitle className="nq-tree-name" color={note.titleColor} deps={[note.id === openNoteId]}>
              {note.title || "Senza titolo"}
            </NoteTitle>
            <span className="nq-tree-count">{count}</span>
          </span>
        </div>
        {!closed.has(key) && renderNoteMarks(note.id, depth + 1, false)}
      </div>
    );
  }

  function renderFolder(folder: Folder, depth: number): ReactNode {
    const count = countIn(folder.id);
    if (count === 0) return null;
    const key = `f${folder.id}`;
    const Icon = folderIcon(folder.icon);
    return (
      <div key={key}>
        <div className="nq-tree-row" style={{ paddingLeft: 10 + depth * INDENT } as CSSProperties}>
          {chevron(key, folder.name)}
          <span className="nq-tree-main nq-bm-static">
            <Icon className="nq-tree-icon" style={{ color: folder.color ?? undefined }} />
            <span className="nq-tree-name">{folder.name}</span>
            <span className="nq-tree-count">{count}</span>
          </span>
        </div>
        {!closed.has(key) && (
          <>
            {(childrenOf.get(folder.id) ?? []).map((child) => renderFolder(child, depth + 1))}
            {(notesByFolder.get(folder.id) ?? []).map((note) => renderNote(note, depth + 1))}
          </>
        )}
      </div>
    );
  }

  const loose = notesByFolder.get(null) ?? [];
  const hasFilters = kinds.size > 0 || colors.size > 0 || q.length > 0;
  const openNote = openNoteId !== null ? noteById.get(openNoteId) : undefined;

  return (
    <div className="nq-bm-panel">
      <div className="nq-bm-scope" role="tablist" aria-label="Quali segni">
        <button type="button" role="tab" aria-selected={scope === "nota"} disabled={openNoteId === null} onClick={() => setScope("nota")}>
          Questa nota
        </button>
        <button type="button" role="tab" aria-selected={scope === "tutte"} onClick={() => setScope("tutte")}>
          Tutte le note
        </button>
      </div>

      <label className="nq-search nq-bm-search">
        <MdSearch aria-hidden="true" />
        <input
          value={query}
          placeholder="Cerca un segno"
          aria-label="Cerca un segno per nome"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
        />
      </label>

      <div className="nq-bm-filters" role="group" aria-label="Filtra per tipo">
        {BOOKMARK_KINDS.map((k) => (
          <button key={k.key} type="button" className="nq-tag nq-bm-chip" aria-pressed={kinds.has(k.key)} title={k.label} aria-label={k.label} onClick={() => toggleKind(k.key)}>
            {bookmarkIcon(k.key)}
          </button>
        ))}
      </div>
      <div className="nq-bm-filters" role="group" aria-label="Filtra per colore">
        <button type="button" className="nq-bm-dot nq-bm-dot--theme" aria-pressed={colors.has("tema")} title="Colore del tema" aria-label="Colore del tema" onClick={() => toggleColor("tema")} />
        {BOOKMARK_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            className="nq-bm-dot"
            style={{ "--nq-bm": bookmarkColorVar(c.key) } as CSSProperties}
            aria-pressed={colors.has(c.key)}
            title={c.label}
            aria-label={c.label}
            onClick={() => toggleColor(c.key)}
          />
        ))}
        <button type="button" className="nq-bm-dot nq-bm-dot--free" aria-pressed={colors.has("libero")} title="Altri colori" aria-label="Altri colori" onClick={() => toggleColor("libero")} />
        {hasFilters && (
          <button
            type="button"
            className="nq-bm-clear"
            onClick={() => {
              setKinds(new Set());
              setColors(new Set());
              setQuery("");
            }}
          >
            Togli i filtri
          </button>
        )}
      </div>

      <div className="nq-tree nq-bm-tree">
        {scope === "nota" ? (
          openNote ? (
            (byNote.get(openNote.id)?.length ?? 0) > 0 ? (
              renderNoteMarks(openNote.id, 0, true)
            ) : (
              <p className="nq-side-hint">
                {hasFilters ? "Nessun segno con questi filtri." : "Nessun segno in questa nota. Mettine uno con il tasto destro o con Ctrl+Alt+B."}
              </p>
            )
          ) : (
            <p className="nq-side-hint">Apri una nota per vederne i segni.</p>
          )
        ) : filtered.length === 0 ? (
          <p className="nq-side-hint">{hasFilters ? "Nessun segno con questi filtri." : "Ancora nessun segno nelle note."}</p>
        ) : (
          <>
            {(childrenOf.get(null) ?? []).map((f) => renderFolder(f, 0))}
            {loose.length > 0 && (
              <div>
                <div className="nq-tree-row" style={{ paddingLeft: 10 } as CSSProperties}>
                  {chevron("f-none", "Senza cartella")}
                  <span className="nq-tree-main nq-bm-static">
                    <MdOutlineFolder className="nq-tree-icon" />
                    <span className="nq-tree-name">Senza cartella</span>
                    <span className="nq-tree-count">{loose.reduce((n, note) => n + (byNote.get(note.id)?.length ?? 0), 0)}</span>
                  </span>
                </div>
                {!closed.has("f-none") && loose.map((note) => renderNote(note, 1))}
              </div>
            )}
          </>
        )}
      </div>

      {menu && (
        <PageMenu
          x={menu.x}
          y={menu.y}
          groups={[
            [
              { label: "Vai al segno", icon: bookmarkIcon(menu.b.kind), onSelect: () => onOpen(menu.b, false) },
              { label: "Apri nell'altro lato", icon: <MdOutlineDescription />, hint: "Ctrl clic", onSelect: () => onOpen(menu.b, true) },
            ],
            [
              { label: "Rinomina", icon: <MdEdit />, onSelect: () => setRenaming({ id: menu.b.id, draft: menu.b.name }) },
              { label: "Elimina", icon: <MdDeleteOutline />, danger: true, onSelect: () => onEdit(menu.b, "delete") },
            ],
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

export default BookmarkPanel;
