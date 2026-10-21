import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  MdOutlineCreateNewFolder,
  MdDeleteOutline,
  MdOutlineDescription,
  MdOutlineHistory,
  MdOutlineCheckCircle,
  MdOutlineStarBorder,
  MdOutlineVerticalSplit,
  MdSearch,
  MdAdd,
  MdChevronRight,
} from "react-icons/md";
import { useLatestRef } from "../../core/hooks/useLatestRef";
import { useSettings } from "../../core/settings/SettingsContext";
import FolderPanel from "./components/FolderPanel";
import FolderTree from "./components/FolderTree";
import NoteCollection, { type LayoutMode, type SortKey } from "./components/NoteCollection";
import NoteEditor from "./components/NoteEditor";
import { takePendingNote } from "./lib/launch";
import {
  addFolder,
  createNote,
  deleteFolders,
  deleteNoteForever,
  emptyTrash,
  listFolders,
  listNotes,
  restoreNote,
  trashNote,
  updateFolder,
  updateNote,
  type Folder,
  type NoteSummary,
} from "./data/notesRepository";
import type { DragItem } from "./lib/drag";
import { folderIcon } from "./lib/folders";
import { htmlToText } from "./lib/html";
import "./NotesDetail.css";

type View =
  | { kind: "all" }
  | { kind: "starred" }
  | { kind: "recent" }
  | { kind: "trash" }
  | { kind: "folder"; id: number }
  | { kind: "tag"; tag: string };

const RECENT_LIMIT = 12;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Q";
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/** Pagina "Quaderno": cartelle, raccolta di note ed editor. */
function NotesDetail() {
  const { settings } = useSettings();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>({ kind: "all" });
  const [openId, setOpenId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [sideOpen, setSideOpen] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [newFolder, setNewFolder] = useState<{ parentId: number | null } | null>(null);
  const [customizeId, setCustomizeId] = useState<number | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid");
  const [sort, setSort] = useState<SortKey>("updated");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState<{ item: DragItem; x: number; y: number } | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [f, n] = await Promise.all([listFolders(), listNotes()]);
      setFolders(f);
      setNotes(n);
      setLoaded(true);
    } catch (error) {
      console.error("Errore nel caricamento del Quaderno:", error);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Il widget può chiedere di aprire subito una nota (lib/launch.ts). In
  // StrictMode l'effetto gira due volte: la prima lettura consuma la richiesta.
  useEffect(() => {
    const id = takePendingNote();
    if (id !== null) setOpenId(id);
  }, []);

  // ---------------- Dati derivati ----------------

  const live = useMemo(() => notes.filter((n) => n.deletedAt === null), [notes]);
  const trashed = useMemo(() => notes.filter((n) => n.deletedAt !== null), [notes]);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const childrenOf = useMemo(() => {
    const map = new Map<number | null, Folder[]>();
    for (const f of folders) {
      const key = folderById.has(f.parentId ?? -1) ? f.parentId : null;
      map.set(key, [...(map.get(key) ?? []), f]);
    }
    return map;
  }, [folders, folderById]);

  /** Id della cartella + tutte le sottocartelle. */
  const subtreeIds = useCallback(
    (id: number): number[] => {
      const result = [id];
      for (const child of childrenOf.get(id) ?? []) result.push(...subtreeIds(child.id));
      return result;
    },
    [childrenOf]
  );

  const counts = useMemo(() => {
    const map = new Map<number, number>();
    for (const f of folders) {
      const ids = new Set(subtreeIds(f.id));
      map.set(f.id, live.filter((n) => n.folderId !== null && ids.has(n.folderId)).length);
    }
    return map;
  }, [folders, live, subtreeIds]);

  const notesByFolder = useMemo(() => {
    const map = new Map<number, NoteSummary[]>();
    for (const n of live) {
      if (n.folderId === null) continue;
      map.set(n.folderId, [...(map.get(n.folderId) ?? []), n]);
    }
    return map;
  }, [live]);

  const allTags = useMemo(() => [...new Set(live.flatMap((n) => n.tags))].sort(), [live]);

  const searchIndex = useMemo(
    () => new Map(notes.map((n) => [n.id, `${n.title} ${n.tags.join(" ")} ${htmlToText(n.firstContent)}`.toLowerCase()])),
    [notes]
  );

  const pathFolders = useCallback(
    (folderId: number | null): Folder[] => {
      const chain: Folder[] = [];
      let current = folderId !== null ? folderById.get(folderId) : undefined;
      while (current && chain.length < 12) {
        chain.unshift(current);
        current = current.parentId !== null ? folderById.get(current.parentId) : undefined;
      }
      return chain;
    },
    [folderById]
  );

  const pathOf = useCallback((folderId: number | null) => pathFolders(folderId).map((f) => f.name).join(" / "), [pathFolders]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const scopeNotes = useMemo(() => {
    if (searching) return live.filter((n) => searchIndex.get(n.id)?.includes(q));
    switch (view.kind) {
      case "all":
        return live;
      case "starred":
        return live.filter((n) => n.starred);
      case "recent":
        return live.slice(0, RECENT_LIMIT); // listNotes è già ordinata per ultima modifica
      case "trash":
        return trashed;
      case "tag":
        return live.filter((n) => n.tags.includes(view.tag));
      case "folder": {
        const ids = new Set(subtreeIds(view.id));
        return live.filter((n) => n.folderId !== null && ids.has(n.folderId));
      }
    }
  }, [searching, q, view, live, trashed, searchIndex, subtreeIds]);

  const selectedFolder = view.kind === "folder" ? folderById.get(view.id) ?? null : null;
  const openNote = openId !== null ? notes.find((n) => n.id === openId && n.deletedAt === null) ?? null : null;
  const customizeFolder = customizeId !== null ? folderById.get(customizeId) ?? null : null;

  // ---------------- Azioni ----------------

  async function handleNewNote() {
    const folderId = view.kind === "folder" ? view.id : null;
    try {
      const id = await createNote(folderId);
      setQuery("");
      await reload();
      setOpenId(id);
    } catch (error) {
      console.error("Errore nella creazione della nota:", error);
    }
  }

  const newNoteRef = useLatestRef(handleNewNote);
  const openIdRef = useLatestRef(openId);

  // Scorciatoie: Ctrl/Cmd+K cerca, N crea una nota (solo fuori dall'editor e dai campi di testo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === "n" && openIdRef.current === null) {
        e.preventDefault();
        void newNoteRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newNoteRef, openIdRef]);

  function goTo(next: View) {
    setView(next);
    setOpenId(null);
    setQuery("");
    setCustomizeId(null);
  }

  function selectFolder(id: number) {
    goTo({ kind: "folder", id });
    setExpanded((prev) => new Set(prev).add(id));
  }

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreateFolder(name: string, parentId: number | null) {
    setNewFolder(null);
    try {
      const id = await addFolder(name, parentId);
      await reload();
      if (parentId !== null) setExpanded((prev) => new Set(prev).add(parentId));
      selectFolder(id);
    } catch (error) {
      console.error("Errore nella creazione della cartella:", error);
    }
  }

  async function handleSaveFolder(patch: { name: string; color: string | null; icon: string }) {
    if (!customizeFolder) return;
    await updateFolder(customizeFolder.id, patch);
    setCustomizeId(null);
    await reload();
  }

  async function handleDeleteFolder() {
    if (!customizeFolder) return;
    const ids = subtreeIds(customizeFolder.id);
    await deleteFolders(ids);
    if (view.kind === "folder" && ids.includes(view.id)) setView({ kind: "all" });
    setCustomizeId(null);
    await reload();
  }

  /** Apre il campo "nome" per una nuova sottocartella direttamente nell'albero. */
  function startSubfolder(parentId: number) {
    setExpanded((prev) => new Set(prev).add(parentId));
    setNewFolder({ parentId });
    setSideOpen(true);
  }

  function handleAddSubfolder() {
    if (customizeFolder) startSubfolder(customizeFolder.id);
  }

  // ---------------- Trascina e rilascia ----------------
  // Eventi puntatore (non il drag HTML5): su Windows in Tauri la finestra può
  // intercettare il drag nativo, mentre questo funziona ovunque.

  /** Rilascio ammesso? key = "root" oppure id cartella (come stringa). */
  function canDrop(item: DragItem, key: string): boolean {
    if (key === "root") {
      return item.kind === "note"
        ? notes.find((n) => n.id === item.id)?.folderId != null
        : folderById.get(item.id)?.parentId != null;
    }
    const target = Number(key);
    if (item.kind === "folder") {
      if (subtreeIds(item.id).includes(target)) return false; // non dentro se stessa o una sua figlia
      return folderById.get(item.id)?.parentId !== target;
    }
    return notes.find((n) => n.id === item.id)?.folderId !== target;
  }

  async function performMove(item: DragItem, key: string) {
    const target = key === "root" ? null : Number(key);
    try {
      if (item.kind === "note") await updateNote(item.id, { folderId: target }, false);
      else await updateFolder(item.id, { parentId: target });
      if (target !== null) setExpanded((prev) => new Set(prev).add(target));
      await reload();
    } catch (error) {
      console.error("Errore nello spostamento:", error);
    }
  }

  const canDropRef = useLatestRef(canDrop);
  const moveRef = useLatestRef(performMove);

  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>, item: DragItem) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      let active = false;
      let hoverKey: string | null = null;
      let hoverTimer: number | null = null;

      const keyAt = (x: number, y: number): string | null =>
        document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-folder]")?.dataset.dropFolder ?? null;

      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        document.body.classList.remove("nq-dragging");
        if (hoverTimer !== null) window.clearTimeout(hoverTimer);
      };

      function onMove(ev: PointerEvent) {
        if (!active) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
          active = true;
          document.body.classList.add("nq-dragging");
        }
        setDrag({ item, x: ev.clientX, y: ev.clientY });
        const key = keyAt(ev.clientX, ev.clientY);
        const valid = key !== null && canDropRef.current(item, key);
        setDropKey(valid ? key : null);

        // Fermo per un attimo su una cartella chiusa: la apre.
        if (key !== hoverKey) {
          hoverKey = key;
          if (hoverTimer !== null) window.clearTimeout(hoverTimer);
          hoverTimer = null;
          if (valid && key !== "root") {
            const id = Number(key);
            hoverTimer = window.setTimeout(() => setExpanded((prev) => new Set(prev).add(id)), 700);
          }
        }
      }

      function onUp(ev: PointerEvent) {
        cleanup();
        if (!active) return;
        // Il click che segue il rilascio non deve aprire la nota/cartella.
        const swallow = (c: Event) => c.stopPropagation();
        window.addEventListener("click", swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 60);

        const key = keyAt(ev.clientX, ev.clientY);
        setDrag(null);
        setDropKey(null);
        if (key !== null && canDropRef.current(item, key)) void moveRef.current(item, key);
      }

      function onCancel() {
        cleanup();
        setDrag(null);
        setDropKey(null);
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    },
    [canDropRef, moveRef]
  );

  async function handleToggleStar(note: NoteSummary) {
    await updateNote(note.id, { starred: !note.starred }, false);
    await reload();
  }

  async function handleTrash(id: number) {
    await trashNote(id);
    if (openId === id) setOpenId(null);
    await reload();
  }

  async function handleRestore(id: number) {
    const note = notes.find((n) => n.id === id);
    await restoreNote(id, note?.folderId != null && folderById.has(note.folderId));
    await reload();
  }

  async function handleDeleteForever(id: number) {
    await deleteNoteForever(id);
    await reload();
  }

  async function handleEmptyTrash() {
    await emptyTrash(trashed.map((n) => n.id));
    await reload();
  }

  // ---------------- Intestazione della raccolta ----------------

  const header = (() => {
    if (searching) return { title: `Risultati per “${query.trim()}”`, subtitle: "Cerca tra titoli, tag e testo della prima pagina.", icon: <MdSearch />, accent: null };
    switch (view.kind) {
      case "all":
        return { title: "Tutte le note", subtitle: "Tutto quello che hai catturato, in un posto solo.", icon: <MdOutlineDescription />, accent: null };
      case "starred":
        return { title: "Preferiti", subtitle: "Le note che vuoi avere sempre a portata di mano.", icon: <MdOutlineStarBorder />, accent: null };
      case "recent":
        return { title: "Recenti", subtitle: "Le ultime note su cui hai lavorato.", icon: <MdOutlineHistory />, accent: null };
      case "trash":
        return { title: "Cestino", subtitle: "Le note eliminate restano qui finché non le rimuovi per sempre.", icon: <MdDeleteOutline />, accent: null };
      case "tag":
        return { title: `# ${view.tag}`, subtitle: "Note con questo tag.", icon: <span>#</span>, accent: null };
      case "folder": {
        const folder = selectedFolder;
        const Icon = folderIcon(folder?.icon ?? "folder");
        const parent = folder?.parentId != null ? folderById.get(folder.parentId) : undefined;
        return {
          title: folder?.name ?? "Cartella",
          subtitle: parent ? `Dentro ${parent.name}` : "Cartella principale",
          icon: <Icon />,
          accent: folder?.color ?? null,
        };
      }
    }
  })();

  const collectionTags = [...new Set(scopeNotes.flatMap((n) => n.tags))].sort();

  // ---------------- Briciole di pane ----------------

  const crumbs: { label: string; onClick?: () => void }[] = [];
  if (openNote) {
    for (const f of pathFolders(openNote.folderId)) crumbs.push({ label: f.name, onClick: () => selectFolder(f.id) });
    crumbs.push({ label: openNote.title || "Senza titolo" });
  } else if (!searching && view.kind === "folder") {
    const chain = pathFolders(view.id);
    chain.forEach((f, i) => crumbs.push({ label: f.name, onClick: i < chain.length - 1 ? () => selectFolder(f.id) : undefined }));
  } else {
    crumbs.push({ label: header.title });
  }

  const userName = settings.userName.trim();

  if (!loaded) return <p className="nq-loading">Caricamento…</p>;

  return (
    <div className="nq">
      {sideOpen && (
        <aside className="nq-side">
          <div className="nq-brand">
            <span className="nq-brand-icon">
              <MdOutlineDescription />
            </span>
            <span>Notes</span>
          </div>

          <div className="nq-user">
            <span className="nq-avatar">{initials(userName)}</span>
            <div>
              <strong>{userName || "Il tuo spazio"}</strong>
              <span>Spazio personale</span>
            </div>
          </div>

          <nav className="nq-nav">
            <button type="button" className={`nq-nav-item${!openNote && !searching && view.kind === "all" ? " is-active" : ""}`} onClick={() => goTo({ kind: "all" })}>
              <MdOutlineDescription /> <span>Tutte le note</span> <em>{live.length}</em>
            </button>
            <button type="button" className={`nq-nav-item${!openNote && !searching && view.kind === "starred" ? " is-active" : ""}`} onClick={() => goTo({ kind: "starred" })}>
              <MdOutlineStarBorder /> <span>Preferiti</span> <em>{live.filter((n) => n.starred).length}</em>
            </button>
            <button type="button" className={`nq-nav-item${!openNote && !searching && view.kind === "recent" ? " is-active" : ""}`} onClick={() => goTo({ kind: "recent" })}>
              <MdOutlineHistory /> <span>Recenti</span>
            </button>
          </nav>

          <div className="nq-section-head">
            <span>Le tue cartelle</span>
            <button type="button" className="nq-icon-btn" onClick={() => setNewFolder({ parentId: null })} aria-label="Nuova cartella" title="Nuova cartella">
              <MdOutlineCreateNewFolder />
            </button>
          </div>

          <div className="nq-side-scroll">
            <FolderTree
              childrenOf={childrenOf}
              counts={counts}
              notesByFolder={notesByFolder}
              selectedFolderId={view.kind === "folder" && !searching ? view.id : null}
              expanded={expanded}
              openNoteId={openId}
              newFolderParent={newFolder ? newFolder.parentId : undefined}
              onSelect={selectFolder}
              onToggle={toggleExpanded}
              onOpenNote={(id) => {
                setQuery("");
                setOpenId(id);
              }}
              onCreateFolder={(name, parentId) => void handleCreateFolder(name, parentId)}
              onCancelCreate={() => setNewFolder(null)}
              dropKey={dropKey}
              onDragStart={startDrag}
              onAddSubfolder={startSubfolder}
            />

            {drag && (
              <div className={`nq-root-drop${dropKey === "root" ? " is-drop" : ""}`} data-drop-folder="root">
                Sposta fuori dalle cartelle
              </div>
            )}

            <button type="button" className="nq-nav-item nq-new-folder" onClick={() => setNewFolder({ parentId: null })}>
              <MdAdd /> <span>Nuova cartella</span>
            </button>

            {allTags.length > 0 && (
              <>
                <div className="nq-section-head">
                  <span>Tag</span>
                </div>
                <div className="nq-tags">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`nq-tag${view.kind === "tag" && view.tag === tag && !openNote ? " is-active" : ""}`}
                      onClick={() => goTo({ kind: "tag", tag })}
                    >
                      # {tag}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="nq-side-foot">
            <button type="button" className={`nq-nav-item${!openNote && !searching && view.kind === "trash" ? " is-active" : ""}`} onClick={() => goTo({ kind: "trash" })}>
              <MdDeleteOutline /> <span>Cestino</span> {trashed.length > 0 && <em>{trashed.length}</em>}
            </button>
            <p className="nq-sync">
              <MdOutlineCheckCircle /> Salvato su questo dispositivo
            </p>
          </div>
        </aside>
      )}

      <section className="nq-main">
        <div className="nq-topbar">
          <button type="button" className="nq-icon-btn" onClick={() => setSideOpen((v) => !v)} aria-label="Mostra o nascondi la barra laterale">
            <MdOutlineVerticalSplit />
          </button>
          <nav className="nq-crumbs" aria-label="Percorso">
            {crumbs.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`} className="nq-crumb">
                {i > 0 && <MdChevronRight />}
                {crumb.onClick ? (
                  <button type="button" onClick={crumb.onClick}>
                    {crumb.label}
                  </button>
                ) : (
                  <span className={i === crumbs.length - 1 ? "is-current" : ""}>{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
          <label className="nq-search">
            <MdSearch />
            <input
              ref={searchRef}
              value={query}
              placeholder="Cerca nelle tue note"
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value) setOpenId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  e.currentTarget.blur();
                }
              }}
            />
            <kbd>Ctrl K</kbd>
          </label>
        </div>

        <div className="nq-body">
          {openNote ? (
            <NoteEditor
              key={openNote.id}
              note={openNote}
              pathLabel={pathOf(openNote.folderId)}
              onChanged={() => void reload()}
              onToggleStar={() => void handleToggleStar(openNote)}
              onTrash={() => void handleTrash(openNote.id)}
            />
          ) : (
            <NoteCollection
              title={header.title}
              subtitle={header.subtitle}
              icon={header.icon}
              accent={header.accent}
              notes={scopeNotes}
              tags={collectionTags}
              pathOf={pathOf}
              mode={layoutMode}
              onMode={setLayoutMode}
              sort={sort}
              onSort={setSort}
              isTrash={view.kind === "trash" && !searching}
              onOpen={(id) => setOpenId(id)}
              onToggleStar={(n) => void handleToggleStar(n)}
              onTrash={(id) => void handleTrash(id)}
              onRestore={(id) => void handleRestore(id)}
              onDeleteForever={(id) => void handleDeleteForever(id)}
              onEmptyTrash={() => void handleEmptyTrash()}
              onNew={() => void handleNewNote()}
              onDragStart={startDrag}
              onCustomize={selectedFolder && !searching ? () => setCustomizeId(selectedFolder.id) : undefined}
            />
          )}
        </div>
      </section>

      {drag &&
        createPortal(
          <div className="nq-drag-ghost" style={{ left: drag.x + 14, top: drag.y + 14 }}>
            {drag.item.kind === "folder" ? <MdOutlineCreateNewFolder /> : <MdOutlineDescription />}
            <span>{drag.item.label}</span>
          </div>,
          document.body
        )}

      {customizeFolder && !openNote && (
        <FolderPanel
          folder={customizeFolder}
          parentName={customizeFolder.parentId !== null ? folderById.get(customizeFolder.parentId)?.name ?? null : null}
          noteCount={counts.get(customizeFolder.id) ?? 0}
          onSave={(patch) => void handleSaveFolder(patch)}
          onAddSubfolder={handleAddSubfolder}
          onDelete={() => void handleDeleteFolder()}
          onClose={() => setCustomizeId(null)}
        />
      )}
    </div>
  );
}

export default NotesDetail;
