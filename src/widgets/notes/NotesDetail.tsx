import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  MdOutlineCreateNewFolder,
  MdDeleteOutline,
  MdOutlineDescription,
  MdOutlineHistory,
  MdOutlineCheckCircle,
  MdOutlineFolderOpen,
  MdOutlineStarBorder,
  MdOutlineVerticalSplit,
  MdSearch,
  MdAdd,
  MdOutlineTableChart,
  MdRestoreFromTrash,
} from "react-icons/md";
import { useLatestRef } from "../../core/hooks/useLatestRef";
import FolderPanel from "./components/FolderPanel";
import VaultPanel from "./components/VaultPanel";
import FolderTree from "./components/FolderTree";
import NoteCollection, { type LayoutMode, type SortKey } from "./components/NoteCollection";
import NoteEditor from "./components/NoteEditor";
import Crumbs, { type Crumb } from "./components/Crumbs";
import ShortcutsPanel from "./components/ShortcutsPanel";
import CollectionPage from "./collections/CollectionPage";
import { COLLECTION_FILE_KIND, collectionToCsv, collectionToJson } from "./lib/collections";
import {
  createCollection,
  fieldsOf,
  getCollectionsState,
  loadCollections,
  purgeCollection,
  restoreCollection,
  rowsOf,
  subscribeCollections,
  useCollections,
} from "./lib/collectionsStore";
import { fromFormField, matchShortcut, shortcutLabel } from "./lib/shortcuts";
import type { EditorApi, ScreenPoint, StoredFile } from "./lib/editorApi";
import { createFileBlock, createImageBlock } from "./lib/blocks";
import { imageSize, releaseAttachmentUrls } from "./lib/attachmentUrls";
import { MAX_FILE_BYTES, classifyFile, readPaths, type IncomingFile } from "./lib/insertFiles";
import { takePendingNote } from "./lib/launch";
import {
  addAttachment,
  addFolder,
  createNote,
  deleteFolders,
  getPages,
  savePage,
  deleteNoteForever,
  emptyTrash,
  listFolders,
  listNotes,
  markAllUnsynced,
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
import { markdownToHtml, parseFrontmatter, parseMetaString, parseMetaTags, plainTextToHtml } from "./lib/markdown";
import { buildFromTemplate } from "./lib/templates";
import {
  VAULT_DIR,
  collectionFileBase,
  ensureVaultDir,
  importVault,
  isVaultEnabled,
  removeNoteDir,
  saveAttachmentFile,
  setVaultEnabled,
  syncPending,
  vaultAbsolutePath,
  writeCollectionFiles,
} from "./lib/vault";
import "./NotesDetail.css";

type View =
  | { kind: "all" }
  | { kind: "starred" }
  | { kind: "recent" }
  | { kind: "trash" }
  | { kind: "folder"; id: number }
  | { kind: "tag"; tag: string }
  | { kind: "collection"; id: number };

const RECENT_LIMIT = 12;

/** Pagina "Notes": cartelle, raccolta di note ed editor. */
function NotesDetail() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const [splitId, setSplitId] = useState<number | null>(null);
  const [vaultOn, setVaultOn] = useState(false);
  const [vaultPanel, setVaultPanel] = useState(false);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [attachVersion, setAttachVersion] = useState(0);
  const [extDrag, setExtDrag] = useState(false);
  const syncing = useRef(false);

  const reload = useCallback(async () => {
    try {
      const [f, n] = await Promise.all([listFolders(), listNotes()]);
      setFolders(f);
      setNotes(n);
      setLoaded(true);
      setLoadError(null);
    } catch (error) {
      console.error("Errore nel caricamento del Notes:", error);
      // Prima del primo caricamento si vede la pagina d'errore; dopo, un avviso.
      setLoadError(String(error));
      setNotice("Impossibile aggiornare l'elenco delle note (dettagli nella console).");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Raccolte: cache condivisa (lib/collectionsStore.ts), caricata una volta.
  const collectionsState = useCollections();
  useEffect(() => {
    void loadCollections();
  }, []);

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
      case "collection":
        return [];
      case "folder": {
        const ids = new Set(subtreeIds(view.id));
        return live.filter((n) => n.folderId !== null && ids.has(n.folderId));
      }
    }
  }, [searching, q, view, live, trashed, searchIndex, subtreeIds]);

  const selectedFolder = view.kind === "folder" ? folderById.get(view.id) ?? null : null;
  const liveCollections = collectionsState.collections.filter((c) => c.deletedAt === null);
  const trashedCollections = collectionsState.collections.filter((c) => c.deletedAt !== null);
  const [armedCollection, setArmedCollection] = useState<number | null>(null);
  const noteRefs = useMemo(() => live.map((n) => ({ id: n.id, title: n.title })), [live]);
  const collectionLinks = {
    notes: noteRefs,
    onOpenNote: (id: number) => {
      setSplitId(null);
      setOpenId(id);
    },
    onOpenCollection: (id: number) => goTo({ kind: "collection", id }),
  };


  // Copia su disco delle raccolte (Notes/Raccolte/<nome>.json e .csv), poco dopo ogni modifica.
  const titlesRef = useLatestRef(new Map(notes.map((n) => [n.id, n.title])));
  useEffect(() => {
    if (!vaultOn) return;
    let timer: number | undefined;
    const write = () => {
      const s = getCollectionsState();
      if (!s.loaded || s.error) return;
      const ctx = { now: new Date(), noteTitle: (id: number) => titlesRef.current.get(id) ?? null };
      const taken = new Set<string>();
      const files = s.collections
        .filter((c) => c.deletedAt === null)
        .sort((a, b) => a.id - b.id)
        .map((c) => {
          const fields = fieldsOf(s, c.id);
          const rows = rowsOf(s, c.id);
          const base = collectionFileBase(c.name, c.id, taken);
          taken.add(base);
          return { base, json: collectionToJson(c, fields, rows), csv: collectionToCsv(fields, rows, ctx) };
        });
      writeCollectionFiles(files, COLLECTION_FILE_KIND).catch((error: unknown) => console.error("Copia su disco delle raccolte non riuscita:", error));
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(write, 1500);
    };
    schedule();
    const unsubscribe = subscribeCollections(schedule);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [vaultOn, titlesRef]);
  const openNote = openId !== null ? notes.find((n) => n.id === openId && n.deletedAt === null) ?? null : null;
  const splitNote =
    openNote && splitId !== null && splitId !== openId ? live.find((n) => n.id === splitId) ?? null : null;
  const customizeFolder = customizeId !== null ? folderById.get(customizeId) ?? null : null;

  // ---------------- Azioni ----------------

  async function handleNewNote(templateId?: string) {
    // Nella cartella aperta: quella selezionata, o quella della nota che si sta leggendo.
    const folderId = view.kind === "folder" ? view.id : openNote?.folderId ?? null;
    try {
      const id = await createNote(folderId, templateId ? buildFromTemplate(templateId) : undefined);
      setQuery("");
      await reload();
      setOpenId(id);
    } catch (error) {
      console.error("Errore nella creazione della nota:", error);
      showNotice("Impossibile creare la nota (dettagli nella console).");
    }
  }

  const newNoteRef = useLatestRef(handleNewNote);
  const openIdRef = useLatestRef(openId);

  // ---------------- Scorciatoie (lib/shortcuts.ts) ----------------
  // Un solo ascoltatore per la pagina: le azioni della pagina si fanno qui, quelle sul testo
  // vanno all'editor del riquadro attivo (quello cliccato o con il focus, nello schermo diviso).

  const editorApis = useRef(new Map<"main" | "side", EditorApi>());
  const activePane = useRef<"main" | "side">("main");
  const [keysOpen, setKeysOpen] = useState(false);
  const keysOpenRef = useLatestRef(keysOpen);

  const registerMain = useCallback((api: EditorApi | null) => {
    if (api) editorApis.current.set("main", api);
    else editorApis.current.delete("main");
  }, []);
  const registerSide = useCallback((api: EditorApi | null) => {
    if (api) editorApis.current.set("side", api);
    else {
      editorApis.current.delete("side");
      activePane.current = "main";
    }
  }, []);

  function focusSearch() {
    // La ricerca sta nella barra laterale: se è nascosta la si riapre.
    setSideOpen(true);
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }
  const focusSearchRef = useLatestRef(focusSearch);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // già gestito (menu "/", campi del pannello…)
      const action = matchShortcut(e);
      if (fromFormField(e.target)) return; // nei campi di testo i tasti restano loro
      if (!action) {
        // N senza modificatori, fuori dal testo e senza nota aperta: nuova nota (come prima).
        const target = e.target as HTMLElement | null;
        const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !target?.isContentEditable;
        if (plain && e.key.toLowerCase() === "n" && openIdRef.current === null) {
          e.preventDefault();
          void newNoteRef.current();
        }
        return;
      }
      if (action === "help") {
        e.preventDefault();
        setKeysOpen((v) => !v);
        return;
      }
      if (keysOpenRef.current) {
        if (action === "escape") {
          e.preventDefault();
          setKeysOpen(false);
        }
        return;
      }
      if (action === "findAll") {
        e.preventDefault();
        focusSearchRef.current();
        return;
      }
      if (action === "newNote") {
        e.preventDefault();
        void newNoteRef.current();
        return;
      }
      const api = editorApis.current.get(activePane.current) ?? editorApis.current.get("main");
      if (api?.action(action)) e.preventDefault();
      // Senza una nota aperta Ctrl+F apre la ricerca (e non quella del browser).
      else if (action === "find") {
        e.preventDefault();
        focusSearchRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newNoteRef, openIdRef, keysOpenRef, focusSearchRef]);

  async function handleNewCollection() {
    try {
      const id = await createCollection();
      goTo({ kind: "collection", id });
    } catch (error) {
      console.error("Errore nella creazione della raccolta:", error);
      showNotice("Impossibile creare la raccolta (dettagli nella console).");
    }
  }

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
      showNotice("Impossibile creare la cartella (dettagli nella console).");
    }
  }

  async function handleSaveFolder(patch: { name: string; color: string | null; icon: string }) {
    if (!customizeFolder) return;
    const id = customizeFolder.id;
    await attempt("Impossibile salvare la cartella", async () => {
      await updateFolder(id, patch);
      setCustomizeId(null);
      await reload();
    });
  }

  async function handleDeleteFolder() {
    if (!customizeFolder) return;
    const ids = subtreeIds(customizeFolder.id);
    await attempt("Impossibile eliminare la cartella", async () => {
      await deleteFolders(ids);
      if (view.kind === "folder" && ids.includes(view.id)) setView({ kind: "all" });
      setCustomizeId(null);
      await reload();
    });
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
      showNotice("Impossibile spostare l'elemento (dettagli nella console).");
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
    await attempt("Impossibile aggiornare i preferiti", async () => {
      await updateNote(note.id, { starred: !note.starred }, false);
      await reload();
    });
  }

  async function handleTrash(id: number) {
    await attempt("Impossibile spostare la nota nel cestino", async () => {
      await trashNote(id);
      if (openId === id) setOpenId(null);
      await reload();
    });
  }

  async function handleRestore(id: number) {
    const note = notes.find((n) => n.id === id);
    await attempt("Impossibile ripristinare la nota", async () => {
      await restoreNote(id, note?.folderId != null && folderById.has(note.folderId));
      await reload();
    });
  }

  async function handleDeleteForever(id: number) {
    const note = notes.find((n) => n.id === id);
    await attempt("Impossibile eliminare la nota", async () => {
      if (vaultOn && note?.diskPath) await removeNoteDir(note.diskPath);
      await deleteNoteForever(id);
      await reload();
    });
  }

  async function handleEmptyTrash() {
    await attempt("Impossibile svuotare il cestino", async () => {
      if (vaultOn) for (const n of trashed) if (n.diskPath) await removeNoteDir(n.diskPath);
      await emptyTrash(trashed.map((n) => n.id));
      await reload();
    });
  }

  // ---------------- Avvisi, copia su disco, file dal desktop ----------------

  async function collectionAction(action: () => Promise<void>, failure: string) {
    try {
      await action();
    } catch (error) {
      console.error(failure, error);
      showNotice(failure);
    }
  }

  function showNotice(text: string) {
    setNotice(text);
  }

  // Un solo timer: un avviso nuovo non viene chiuso da quello del precedente.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /** Azione dell'utente: se fallisce lo dice con un avviso (dettagli in console). */
  async function attempt(failure: string, action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      console.error(`${failure}:`, error);
      showNotice(`${failure} (dettagli nella console).`);
    }
  }

  useEffect(() => {
    void isVaultEnabled().then(setVaultOn).catch(() => undefined);
  }, []);

  // Con la copia su disco attiva, dopo ogni modifica si riscrivono SOLO le note cambiate.
  useEffect(() => {
    if (!vaultOn || !loaded) return;
    const timer = window.setTimeout(async () => {
      if (syncing.current) return;
      syncing.current = true;
      try {
        const written = await syncPending(notes, folders);
        if (written > 0) await reload();
      } catch (error) {
        console.error("Copia su disco non riuscita:", error);
        showNotice("Copia su disco non riuscita: controlla i permessi dei plugin (dettagli nella console).");
      } finally {
        syncing.current = false;
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [vaultOn, loaded, notes, folders, reload]);

  async function toggleVault(enabled: boolean) {
    try {
      await setVaultEnabled(enabled);
      setVaultOn(enabled);
      if (enabled) {
        await markAllUnsynced();
        await reload();
      }
    } catch (error) {
      console.error("Impossibile cambiare l'impostazione:", error);
      showNotice("Impossibile cambiare l'impostazione della copia su disco (dettagli nella console).");
    }
  }

  async function runVaultTask(task: () => Promise<string>) {
    setVaultBusy(true);
    try {
      const message = await task();
      if (message) showNotice(message);
    } catch (error) {
      console.error("Operazione sulla cartella non riuscita:", error);
      showNotice("Operazione non riuscita: controlla i permessi dei plugin (dettagli nella console).");
    } finally {
      setVaultBusy(false);
    }
  }

  /** Cartella della nota su disco: la crea (attivando la copia su disco) se non c'è ancora. */
  async function noteDirFor(noteId: number): Promise<string> {
    if (!vaultOn) {
      await setVaultEnabled(true); // gli allegati vivono nella cartella su disco
      setVaultOn(true);
    }
    let fresh = (await listNotes()).find((n) => n.id === noteId);
    if (fresh && !fresh.diskPath) {
      await syncPending([fresh], folders);
      fresh = (await listNotes()).find((n) => n.id === noteId);
    }
    if (!fresh?.diskPath) throw new Error("Cartella della nota non creata");
    return fresh.diskPath;
  }

  /** Copia i file in <nota>/allegati/ e li aggiunge agli allegati. Usata da editor, allegati e rilascio. */
  async function storeFiles(noteId: number, files: IncomingFile[]): Promise<StoredFile[]> {
    const dir = await noteDirFor(noteId);
    const stored: StoredFile[] = [];
    for (const file of files) {
      if (file.bytes.length > MAX_FILE_BYTES) {
        showNotice(`«${file.name}» supera i 50 MB e non è stato allegato.`);
        continue;
      }
      const finalName = await saveAttachmentFile(dir, file.name, file.bytes);
      await addAttachment(noteId, finalName, file.bytes.length);
      stored.push({ name: finalName, size: file.bytes.length });
    }
    if (stored.length > 0) {
      setAttachVersion((v) => v + 1);
      await reload();
    }
    return stored;
  }

  async function attachPaths(noteId: number, paths: string[]) {
    try {
      const stored = await storeFiles(noteId, await readPaths(paths));
      if (stored.length > 0) showNotice(stored.length === 1 ? "File allegato." : `${stored.length} file allegati.`);
    } catch (error) {
      console.error("Allegato non riuscito:", error);
      showNotice("Impossibile allegare il file: controlla i permessi di lettura (dettagli nella console).");
    }
  }

  /** Una nota nuova da un file: testo per .md/.txt, immagine o scheda del file per gli altri. */
  async function createNoteFromFile(file: IncomingFile, folderId: number | null): Promise<number> {
    const name = file.name;
    const title = name.replace(/\.[^.]+$/, "") || name;
    const plain = (content: string) => [{ content, ink: [], background: "none" as const }];
    const kind = classifyFile(name);
    const text = () => new TextDecoder().decode(file.bytes);

    if (kind === "text") {
      return createNote(folderId, { title, tags: [], pages: plain(plainTextToHtml(text())) });
    }
    if (kind === "markdown") {
      const { meta, body } = parseFrontmatter(text());
      return createNote(folderId, {
        title: parseMetaString(meta.title) ?? title,
        tags: parseMetaTags(meta.tags),
        pages: plain(markdownToHtml(body)),
      });
    }
    const id = await createNote(folderId, { title, tags: [], pages: plain("<p><br></p>") });
    const [stored] = await storeFiles(id, [file]);
    if (stored) {
      let block: HTMLElement;
      if (kind === "image") {
        const dims = await imageSize(file.bytes, name).catch(() => ({ width: 0, height: 0 }));
        block = createImageBlock(stored.name, dims.width, dims.height);
      } else {
        block = createFileBlock(stored.name, stored.size);
      }
      const [first] = await getPages(id);
      if (first) await savePage(first.id, id, `${block.outerHTML}<p><br></p>`, []);
    }
    return id;
  }

  /** Cartella sotto il punto (barra laterale): id, "root" = fuori dalle cartelle, null = nessuna. */
  function folderKeyAt(point: ScreenPoint): string | null {
    return document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-drop-folder]")?.dataset.dropFolder ?? null;
  }

  async function handleExternalDrop(paths: string[], point: ScreenPoint) {
    if (paths.length === 0) return;
    // Prima la pagina di un riquadro aperto (Inserisci nella pagina / Allega alla nota).
    for (const key of ["side", "main"] as const) {
      const api = editorApis.current.get(key);
      if (api && (await api.drop(paths, point))) return;
    }
    const folderKey = folderKeyAt(point);
    if (folderKey === null && openIdRef.current !== null) {
      // Rilasciato sull'intestazione o sulla barra di una nota aperta: allegato, come prima.
      await attachPaths(openIdRef.current, paths);
      return;
    }
    const folderId = folderKey === "root" ? null : folderKey !== null ? Number(folderKey) : view.kind === "folder" ? view.id : null;
    try {
      let last: number | null = null;
      for (const file of await readPaths(paths)) last = await createNoteFromFile(file, folderId);
      await reload();
      showNotice(paths.length === 1 ? "Nota creata dal file." : `${paths.length} note create dai file.`);
      if (paths.length === 1 && last !== null) setOpenId(last);
    } catch (error) {
      console.error("Creazione della nota dal file non riuscita:", error);
      showNotice("Impossibile creare la nota dal file (controlla i permessi di lettura).");
    }
  }

  /** Il trascinamento passa sopra la finestra: pannello sulla pagina, cartella evidenziata. */
  function handleExternalOver(point: ScreenPoint | null, count: number) {
    for (const api of editorApis.current.values()) api.dragOver(point, count);
    const key = point ? folderKeyAt(point) : null;
    setDropKey(key !== null && key !== "root" ? key : null);
  }

  const overRef = useLatestRef(handleExternalOver);
  const dropRef = useLatestRef(handleExternalDrop);

  // File trascinati dal desktop dentro la finestra (evento nativo di Tauri).
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    let count = 0;
    // Tauri dà la posizione in pixel fisici della finestra: in px CSS si divide per devicePixelRatio.
    const toCss = (pos: { x: number; y: number }): ScreenPoint => ({
      x: pos.x / (window.devicePixelRatio || 1),
      y: pos.y / (window.devicePixelRatio || 1),
    });
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          if (payload.type === "enter") count = payload.paths.length;
          setExtDrag(true);
          overRef.current(toCss(payload.position), count);
        } else if (payload.type === "leave") {
          setExtDrag(false);
          overRef.current(null, 0);
        } else {
          setExtDrag(false);
          overRef.current(null, 0);
          void dropRef.current(payload.paths, toCss(payload.position));
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((error) => console.error("Trascinamento di file dal sistema non disponibile:", error));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [dropRef, overRef]);

  // Lasciando la pagina Notes si libera la memoria delle immagini lette dal disco.
  useEffect(() => releaseAttachmentUrls, []);

  function renderEditor(note: NoteSummary, compact: boolean, onClosePane?: () => void) {
    return (
      <NoteEditor
        registerEditor={onClosePane ? registerSide : registerMain}
        onStoreFiles={storeFiles}
        onOpenShortcuts={() => setKeysOpen(true)}
        key={`${onClosePane ? "side" : "main"}-${note.id}`}
        note={note}
        pathLabel={pathOf(note.folderId)}
        crumbs={[
          ...pathFolders(note.folderId).map((f) => ({ label: f.name, onClick: () => selectFolder(f.id) })),
          { label: note.title || "Senza titolo" },
        ]}
        onToggleSide={onClosePane ? undefined : () => setSideOpen((v) => !v)}
        sideOpen={sideOpen}
        onChanged={() => void reload()}
        onToggleStar={() => void handleToggleStar(note)}
        onTrash={() => {
          onClosePane?.();
          void handleTrash(note.id);
        }}
        attachVersion={attachVersion}
        onAttachPaths={(id, paths) => void attachPaths(id, paths)}
        onSplit={
          compact
            ? undefined
            : (id) => {
                setSplitId(id);
                setSideOpen(false);
              }
        }
        splitCandidates={live}
        compact={compact}
        onClosePane={onClosePane}
        collections={collectionLinks}
      />
    );
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
      case "collection": {
        const c = collectionsState.collections.find((x) => x.id === view.id);
        return { title: c?.name ?? "Raccolta", subtitle: "Raccolta", icon: <MdOutlineTableChart />, accent: null };
      }
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

  const crumbs: Crumb[] = [];
  if (openNote) {
    for (const f of pathFolders(openNote.folderId)) crumbs.push({ label: f.name, onClick: () => selectFolder(f.id) });
    crumbs.push({ label: openNote.title || "Senza titolo" });
  } else if (!searching && view.kind === "folder") {
    const chain = pathFolders(view.id);
    chain.forEach((f, i) => crumbs.push({ label: f.name, onClick: i < chain.length - 1 ? () => selectFolder(f.id) : undefined }));
  } else {
    crumbs.push({ label: header.title });
  }

  if (!loaded) {
    if (loadError === null) return <p className="nq-loading">Caricamento…</p>;
    return (
      <div className="nq-load-error" role="alert">
        <strong>Impossibile caricare le note</strong>
        <span>{loadError}</span>
        <button type="button" className="nq-btn" onClick={() => void reload()}>
          Riprova
        </button>
      </div>
    );
  }

  return (
    <div className="nq">
      {sideOpen && (
        <aside className="nq-side" aria-label="Note e cartelle">
          <label className="nq-search">
            <MdSearch aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              placeholder="Cerca"
              aria-label="Cerca nelle note"
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
            <kbd>{shortcutLabel("findAll")}</kbd>
          </label>

          <div className="nq-side-scroll">
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

            <h3 className="nq-section-head">
              <span>Cartelle</span>
              <button type="button" className="nq-icon-btn nq-icon-btn--small" onClick={() => setNewFolder({ parentId: null })} aria-label="Nuova cartella" title="Nuova cartella">
                <MdAdd />
              </button>
            </h3>

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

            {allTags.length > 0 && (
              <>
                <h3 className="nq-section-head">
                  <span>Tag</span>
                </h3>
                <div className="nq-tags">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`nq-tag${view.kind === "tag" && view.tag === tag && !openNote ? " is-active" : ""}`}
                      aria-pressed={view.kind === "tag" && view.tag === tag && !openNote}
                      onClick={() => goTo({ kind: "tag", tag })}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </>
            )}

            <h3 className="nq-section-head">
              <span>Raccolte</span>
              <button type="button" className="nq-icon-btn nq-icon-btn--small" onClick={() => void handleNewCollection()} aria-label="Nuova raccolta" title="Nuova raccolta">
                <MdAdd />
              </button>
            </h3>
            <nav className="nq-nav" aria-label="Raccolte">
              {liveCollections.length === 0 && <p className="nq-side-hint">Tabelle di dati da usare in più note.</p>}
              {liveCollections.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`nq-nav-item${!openNote && !searching && view.kind === "collection" && view.id === c.id ? " is-active" : ""}`}
                  onClick={() => goTo({ kind: "collection", id: c.id })}
                >
                  <MdOutlineTableChart /> <span>{c.name}</span> <em>{rowsOf(collectionsState, c.id).filter((r) => r.deletedAt === null).length}</em>
                </button>
              ))}
            </nav>
          </div>

          <div className="nq-side-foot">
            <button type="button" className={`nq-nav-item${!openNote && !searching && view.kind === "trash" ? " is-active" : ""}`} onClick={() => goTo({ kind: "trash" })}>
              <MdDeleteOutline /> <span>Cestino</span> {trashed.length > 0 && <em>{trashed.length}</em>}
            </button>
            <button type="button" className="nq-nav-item" onClick={() => setVaultPanel(true)}>
              <MdOutlineFolderOpen /> <span>Cartella su disco</span> {vaultOn && <em>attiva</em>}
            </button>
            <p className="nq-sync">
              <MdOutlineCheckCircle /> {vaultOn ? "Copia su disco attiva" : "Salvato su questo dispositivo"}
            </p>
          </div>
        </aside>
      )}

      <section className="nq-main">
        {!openNote && (
          <div className="nq-topbar">
            <button type="button" className="nq-icon-btn" onClick={() => setSideOpen((v) => !v)} aria-label={sideOpen ? "Nascondi la barra laterale" : "Mostra la barra laterale"} aria-pressed={sideOpen}>
              <MdOutlineVerticalSplit />
            </button>
            <Crumbs items={crumbs} />
          </div>
        )}

        <div className="nq-body">
          {openNote ? (
            splitNote ? (
              <div className="nq-split">
                <div
                  className="nq-pane"
                  onPointerDownCapture={() => (activePane.current = "main")}
                  onFocusCapture={() => (activePane.current = "main")}
                >
                  {renderEditor(openNote, true)}
                </div>
                <div
                  className="nq-pane nq-pane--side"
                  onPointerDownCapture={() => (activePane.current = "side")}
                  onFocusCapture={() => (activePane.current = "side")}
                >
                  {renderEditor(splitNote, true, () => setSplitId(null))}
                </div>
              </div>
            ) : (
              renderEditor(openNote, false)
            )
          ) : !searching && view.kind === "collection" ? (
            <CollectionPage
              key={view.id}
              collectionId={view.id}
              notes={noteRefs}
              onOpenNote={(id) => setOpenId(id)}
              onNotice={showNotice}
              onTrashed={() => goTo({ kind: "all" })}
            />
          ) : (
            <>
            {!searching && view.kind === "trash" && trashedCollections.length > 0 && (
              <section className="nq-trash-colls" aria-label="Raccolte eliminate">
                <h3>Raccolte eliminate</h3>
                {trashedCollections.map((c) => (
                  <div key={c.id} className="nq-trash-coll">
                    <MdOutlineTableChart aria-hidden="true" />
                    <span>{c.name}</span>
                    <button type="button" className="nq-btn nq-btn--small" onClick={() => void collectionAction(() => restoreCollection(c.id), "Impossibile ripristinare la raccolta")}>
                      <MdRestoreFromTrash aria-hidden="true" /> Ripristina
                    </button>
                    <button
                      type="button"
                      className={`nq-btn nq-btn--small nq-btn--danger${armedCollection === c.id ? " is-armed" : ""}`}
                      onClick={() => {
                        if (armedCollection !== c.id) {
                          setArmedCollection(c.id);
                          return;
                        }
                        setArmedCollection(null);
                        void collectionAction(() => purgeCollection(c.id), "Impossibile eliminare la raccolta");
                      }}
                    >
                      {armedCollection === c.id ? "Clicca ancora" : "Elimina per sempre"}
                    </button>
                  </div>
                ))}
              </section>
            )}
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
              onNew={(templateId) => void handleNewNote(templateId)}
              onDragStart={startDrag}
              onCustomize={selectedFolder && !searching ? () => setCustomizeId(selectedFolder.id) : undefined}
            />
            </>
          )}
        </div>
      </section>

      {extDrag && !openNote && (
        <div className="nq-drop-overlay">
          <div>{openNote ? "Rilascia per allegare alla nota" : "Rilascia per creare una nota dal file"}</div>
        </div>
      )}

      {notice && <div className="nq-notice">{notice}</div>}

      {keysOpen && <ShortcutsPanel onClose={() => setKeysOpen(false)} />}

      {vaultPanel && (
        <VaultPanel
          enabled={vaultOn}
          busy={vaultBusy}
          pathLabel={`Documenti/${VAULT_DIR}`}
          onToggle={(on) => void toggleVault(on)}
          onSyncAll={() =>
            void runVaultTask(async () => {
              await markAllUnsynced();
              await reload();
              return "Riscrittura avviata.";
            })
          }
          onImport={() =>
            void runVaultTask(async () => {
              const known = new Set(notes.flatMap((n) => (n.diskPath ? [n.diskPath] : [])));
              const count = await importVault(known, folders);
              await reload();
              return count > 0 ? `Importate ${count} note dalla cartella.` : "Nessuna nota nuova da importare.";
            })
          }
          onOpenFolder={() =>
            void runVaultTask(async () => {
              await ensureVaultDir();
              await openPath(await vaultAbsolutePath());
              return "";
            })
          }
          onClose={() => setVaultPanel(false)}
        />
      )}

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
