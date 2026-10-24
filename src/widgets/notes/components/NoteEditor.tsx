import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  MdAdd,
  MdArrowDownward,
  MdArrowUpward,
  MdChecklist,
  MdChevronLeft,
  MdChevronRight,
  MdClose,
  MdFormatBold,
  MdFormatClear,
  MdFormatColorText,
  MdFormatItalic,
  MdFormatListBulleted,
  MdFormatListNumbered,
  MdFormatStrikethrough,
  MdFormatUnderlined,
  MdHorizontalRule,
  MdKeyboard,
  MdLink,
  MdLooks3,
  MdLooksOne,
  MdLooksTwo,
  MdMoreHoriz,
  MdOutlineAttachFile,
  MdOutlineBackspace,
  MdOutlineBorderColor,
  MdOutlineCalendarToday,
  MdOutlineEdit,
  MdOutlineFileUpload,
  MdOutlineFormatColorFill,
  MdOutlineGesture,
  MdOutlineLayers,
  MdOutlineStarBorder,
  MdOutlineVerticalSplit,
  MdOutlineViewSidebar,
  MdRedo,
  MdRemove,
  MdStar,
  MdUndo,
} from "react-icons/md";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import ConfirmButton from "../../../ui/ConfirmButton";
import {
  addPage,
  deleteAttachment,
  deletePage,
  getPages,
  listAttachments,
  reorderPages,
  savePage,
  setPageBackground,
  updateNote,
  setPageColor,
  type Attachment,
  type InkStroke,
  type NotePage,
  type NoteSummary,
  type PageBackground,
} from "../data/notesRepository";
import { noteToMarkdown, renderNoteImage, renderNotePdf, saveBytes, saveText } from "../lib/exportNote";
import { attachmentAbsolutePath, removeAttachmentFile, slugify } from "../lib/vault";
import { BACKGROUND_OPTIONS } from "../lib/templates";
import { THEME_INK } from "../lib/ink";
import NumberField from "../../../ui/NumberField";
import PageThumb from "./PageThumb";
import { PAGE_COLORS, TEXT_COLORS } from "../lib/pageColor";
import {
  applyFontSize,
  applyTextColor,
  clearFormatting,
  currentBlock,
  currentFontSizePx,
  normalizeUrl,
  toggleChecklist,
  toggleCurrentCheck,
  topBlockKey,
} from "../lib/editorDom";
import { formatWhen, monthYear, sanitizeHtml, wordCount } from "../lib/html";
import { createHistory, type RecordMeta } from "../lib/history";
import { getTextOffsets, setTextOffsets, type TextOffsets } from "../lib/selectionOffsets";
import { duplicateBlock, moveBlock } from "../lib/blockActions";
import { shortcutLabel, type ShortcutAction } from "../lib/shortcuts";
import { filterInsertItems, type InsertItem } from "../lib/insertItems";
import FindBar from "./FindBar";
import InsertMenu from "./InsertMenu";
import type { InkTool } from "./InkLayer";
import PageSurface from "./PageSurface";
import Crumbs, { type Crumb } from "./Crumbs";
import ToolButton from "./ToolButton";
import "./noteEditor.css";

interface NoteEditorProps {
  note: NoteSummary;
  /** "Lavoro / Progetto Atlante" (vuota se la nota non è in una cartella). */
  pathLabel: string;
  /** Percorso mostrato in alto: cartelle (cliccabili) e titolo della nota. */
  crumbs: Crumb[];
  /** Mostra/nasconde la barra laterale (solo nel pannello principale). */
  onToggleSide?: () => void;
  sideOpen?: boolean;
  onChanged: () => void;
  onToggleStar: () => void;
  onTrash: () => void;
  /** Cambia quando una nota riceve nuovi allegati dall'esterno (trascinamento di file). */
  attachVersion: number;
  onAttachPaths: (noteId: number, paths: string[]) => void;
  /** Apre un'altra nota affiancata (solo nel pannello principale). */
  onSplit?: (noteId: number) => void;
  splitCandidates?: NoteSummary[];
  /** Pannello stretto (schermo diviso): niente colonna delle pagine. */
  compact?: boolean;
  onClosePane?: () => void;
  /** Il pannello si registra per ricevere le scorciatoie (lib/shortcuts.ts); null = si toglie. */
  registerShortcuts?: (handler: ((action: ShortcutAction) => boolean) | null) => void;
  onOpenShortcuts?: () => void;
}

/** Stato di una pagina per la cronologia (lib/history.ts). */
interface PageSnapshot {
  pageId: number;
  html: string;
  ink: InkStroke[];
  color: string | null;
  background: PageBackground;
  selection: TextOffsets | null;
}

interface SlashState {
  /** Pagina in cui è stato aperto: cambiando pagina il menu non vale più. */
  pageIndex: number;
  query: string;
  left: number;
  top: number;
  active: number;
}

const FORMAT_COMMANDS: Partial<Record<ShortcutAction, string>> = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strike: "strikeThrough",
  bullets: "insertUnorderedList",
  numbers: "insertOrderedList",
};

const HEADING_TAGS: Partial<Record<ShortcutAction, string>> = { h1: "h1", h2: "h2", h3: "h3", paragraph: "p" };

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

const INK_SIZES = [1, 2, 3, 5, 8];
// L'ultimo è l'inchiostro del tema: chiaro di notte, scuro di giorno (vedi THEME_INK).
const INK_COLORS = ["#6c8dff", "#f472b6", "#34d399", "#fbbf24", "#ef4444", "#a855f7", "#000000", "#ffffff", THEME_INK];

function NoteEditor({
  note,
  pathLabel,
  crumbs,
  onToggleSide,
  sideOpen = true,
  onChanged,
  onToggleStar,
  onTrash,
  attachVersion,
  onAttachPaths,
  onSplit,
  splitCandidates = [],
  compact = false,
  onClosePane,
  registerShortcuts,
  onOpenShortcuts,
}: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [pages, setPages] = useState<NotePage[]>([]);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"text" | "ink">("text");
  const [tool, setTool] = useState<InkTool>("pen");
  const [color, setColor] = useState(INK_COLORS[0]);
  const [size, setSize] = useState(2);
  const [zoom, setZoom] = useState(100);
  const [block, setBlock] = useState("p");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(note.updatedAt);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fontSize, setFontSize] = useState(15);
  const [textColor, setTextColor] = useState("#e03131");
  const [menu, setMenu] = useState<"export" | "split" | "color" | "pagecolor" | "more" | "pages" | null>(null);
  const zoomRef = useLatestRef(zoom);
  const [lightExport, setLightExport] = useState(true);
  const [busy, setBusy] = useState(false);
  const [splitQuery, setSplitQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [slashState, setSlash] = useState<SlashState | null>(null);
  const slash = slashState && slashState.pageIndex === index ? slashState : null;
  // Cronologia della nota: una per editor (cambiando nota l'editor si ricrea e la cronologia riparte).
  const [history] = useState(() => createHistory<PageSnapshot>({ now: () => Date.now() }));
  

  // pagesRef rispecchia SEMPRE `pages` in modo sincrono: i salvataggi con
  // debounce e il flush allo smontaggio leggono da qui, mai da uno state vecchio.
  const pagesRef = useRef<NotePage[]>([]);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRange = useRef<Range | null>(null);
  const dirtyPages = useRef(new Set<number>());
  const titleDirty = useRef(false);
  const timer = useRef<number | null>(null);
  const titleRef = useLatestRef(title);
  /** Cursore prima dell'ultima modifica (la voce della cronologia lo rimette). */
  const lastSelection = useRef<TextOffsets | null>(null);
  /** Cursore da rimettere quando la pagina giusta sarà aperta (annulla su un'altra pagina). */
  const pendingSelection = useRef<{ pageId: number; selection: TextOffsets | null } | null>(null);
  /** True mentre gira un comando della barra: la modifica non è "digitazione". */
  const commandActive = useRef(false);
  // Il menu "/" si aggiorna anche quando si sposta il cursore (selectionchange).
  const slashCheckRef = useLatestRef(checkSlash);

  useEffect(() => {
    const onSelection = () => {
      const root = editorRef.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return;
      savedRange.current = range.cloneRange();
      lastSelection.current = getTextOffsets(root);
      const px = currentFontSizePx(root, zoomRef.current / 100);
      if (px) setFontSize(px);
      slashCheckRef.current(false);
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, [zoomRef, slashCheckRef]);

  // Cambiando pagina l'editor viene ricreato: la vecchia selezione non vale più.
  useEffect(() => {
    savedRange.current = null;
    lastSelection.current = null;
  }, [index]);

  // Dopo un annulla su un'altra pagina: la pagina è stata aperta, si rimette il cursore.
  useEffect(() => {
    const pending = pendingSelection.current;
    const el = editorRef.current;
    if (!pending || !el || pagesRef.current[index]?.id !== pending.pageId) return;
    pendingSelection.current = null;
    if (pending.selection) {
      el.focus();
      setTextOffsets(el, pending.selection);
    }
  }, [index, ready]);

  useEffect(() => {
    let cancelled = false;
    getPages(note.id)
      .then((loaded) => {
        if (cancelled) return;
        pagesRef.current = loaded;
        setPages(loaded);
        setReady(true);
      })
      .catch((error) => {
        console.error("Errore nel caricamento delle pagine:", error);
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [note.id]);

  useEffect(() => {
    let cancelled = false;
    listAttachments(note.id)
      .then((list) => {
        if (!cancelled) setAttachments(list);
      })
      .catch((error) => {
        console.error("Errore nel caricamento degli allegati:", error);
        if (!cancelled) setToast("Impossibile caricare gli allegati");
      });
    return () => {
      cancelled = true;
    };
  }, [note.id, attachVersion]);

  const flush = useCallback(async () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const ids = [...dirtyPages.current];
    dirtyPages.current.clear();
    const saveTitle = titleDirty.current;
    titleDirty.current = false;
    if (ids.length === 0 && !saveTitle) return;
    try {
      if (saveTitle) await updateNote(note.id, { title: titleRef.current });
      for (const id of ids) {
        const page = pagesRef.current.find((p) => p.id === id);
        if (page) await savePage(page.id, note.id, page.content, page.ink);
      }
      setSavedAt(Date.now());
      setSaving(false);
      onChanged();
    } catch (error) {
      console.error("Errore nel salvataggio della nota:", error);
      // Restano "da salvare": la prossima modifica riprova a scriverle.
      for (const id of ids) dirtyPages.current.add(id);
      if (saveTitle) titleDirty.current = true;
      setToast("Salvataggio non riuscito");
    }
  }, [note.id, onChanged, titleRef]);

  const flushRef = useLatestRef(flush);

  // Uscendo dall'editor si scrive subito quello che è in sospeso.
  useEffect(
    () => () => {
      void flushRef.current();
    },
    [flushRef]
  );

  const schedule = useCallback(() => {
    setSaving(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flushRef.current(), 700);
  }, [flushRef]);

  function snapshotOf(p: NotePage): PageSnapshot {
    return {
      pageId: p.id,
      html: p.content,
      ink: p.ink,
      color: p.color,
      background: p.background,
      selection: p.id === pagesRef.current[index]?.id ? lastSelection.current : null,
    };
  }

  /** Stato attuale di una pagina (va in "ripeti" quando si annulla). */
  function liveSnapshot(pageId: number): PageSnapshot | null {
    const p = pagesRef.current.find((x) => x.id === pageId);
    if (!p) return null;
    const isOpen = p.id === pagesRef.current[index]?.id && editorRef.current;
    return { ...snapshotOf(p), selection: isOpen ? getTextOffsets(editorRef.current!) ?? lastSelection.current : null };
  }

  /** Modifica di testo o inchiostro: prima entra nella cronologia lo stato di adesso. */
  function patchPage(id: number, patch: Partial<Pick<NotePage, "content" | "ink">>, meta: RecordMeta = { kind: "other" }) {
    const prev = pagesRef.current.find((p) => p.id === id);
    if (!prev) return;
    const changed = (patch.content !== undefined && patch.content !== prev.content) || (patch.ink !== undefined && patch.ink !== prev.ink);
    if (!changed) return;
    history.record(snapshotOf(prev), meta);
    const next = pagesRef.current.map((p) => (p.id === id ? { ...p, ...patch } : p));
    pagesRef.current = next;
    setPages(next);
    dirtyPages.current.add(id);
    schedule();
  }

  function showToast(text: string) {
    setToast(text);
  }

  // Un solo timer: un avviso nuovo non viene chiuso da quello del precedente.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /** Azione dell'utente: se fallisce lo dice con un avviso (dettagli in console). */
  async function attempt(failure: string, action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      console.error(`${failure}:`, error);
      showToast(failure);
    }
  }

  const page = pages[index] ?? null;

  // ---------------- Comandi testo ----------------

  function commitEditor() {
    const el = editorRef.current;
    if (el && page) patchPage(page.id, { content: el.innerHTML });
  }

  /** Comando del browser sul testo: è una voce sola nella cronologia, non digitazione. */
  function exec(command: string, value?: string) {
    const el = editorRef.current;
    if (!el || mode !== "text") return;
    el.focus();
    commandActive.current = true;
    try {
      document.execCommand(command, false, value);
    } finally {
      commandActive.current = false;
    }
    commitEditor();
  }

  /** Testo scritto nella pagina: si unisce alla voce precedente se si continua nello stesso blocco. */
  function handleTyping(html: string) {
    if (!page) return;
    const meta: RecordMeta = commandActive.current ? { kind: "other" } : { kind: "typing", blockKey: topBlockKey(editorRef.current) };
    patchPage(page.id, { content: html }, meta);
  }

  function handleChecklist() {
    const el = editorRef.current;
    if (!el || mode !== "text") return;
    el.focus();
    if (toggleChecklist(el)) commitEditor();
  }

  function withSelection(action: (root: HTMLElement) => boolean) {
  const el = editorRef.current;
  if (!el || mode !== "text") return;
  el.focus();
  const sel = window.getSelection();
  if (savedRange.current && sel) {
    sel.removeAllRanges();
    sel.addRange(savedRange.current);
  }
  commandActive.current = true;
  let done = false;
  try {
    done = action(el);
  } finally {
    commandActive.current = false;
  }
  if (done) commitEditor();
}

function handleFontSize(px: number) {
  const value = Math.min(200, Math.max(8, Math.round(px)));
  setFontSize(value);
  withSelection((root) => applyFontSize(root, value));
}

function handleTextColor(color: string) {
  setTextColor(color);
  withSelection((root) => applyTextColor(root, color));
}

async function changePageColor(color: string | null) {
  if (!page || page.color === color) return;
  history.record(snapshotOf(page), { kind: "other" });
  const next = pagesRef.current.map((p) => (p.id === page.id ? { ...p, color } : p));
  pagesRef.current = next;
  setPages(next);
  await attempt("Impossibile cambiare il colore della pagina", async () => {
    await setPageColor(page.id, note.id, color);
    setSavedAt(Date.now());
    onChanged();
  });
}

  function handleBlockChange(value: string) {
    setBlock(value);
    exec("formatBlock", `<${value}>`);
  }

  function openLink() {
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    savedRange.current =
      range && editorRef.current?.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
    setLinkUrl("");
    setLinkOpen(true);
  }

  function applyLink() {
    const url = normalizeUrl(linkUrl);
    setLinkOpen(false);
    const el = editorRef.current;
    if (!url || !el) return;
    el.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    if (sel && sel.isCollapsed) {
      const safe = url.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      document.execCommand("insertHTML", false, `<a href="${safe.replace(/"/g, "&quot;")}">${safe}</a>`);
    } else {
      document.execCommand("createLink", false, url);
    }
    commitEditor();
  }

  /** Rimette una pagina com'era (testo, inchiostro, colore, sfondo, cursore) e la salva. */
  function applySnapshot(snap: PageSnapshot) {
    const prev = pagesRef.current.find((p) => p.id === snap.pageId);
    if (!prev) return;
    const next = pagesRef.current.map((p) =>
      p.id === snap.pageId ? { ...p, content: snap.html, ink: snap.ink, color: snap.color, background: snap.background } : p
    );
    pagesRef.current = next;
    setPages(next);
    dirtyPages.current.add(snap.pageId);
    schedule();
    if (prev.color !== snap.color) {
      void attempt("Impossibile ripristinare il colore della pagina", () => setPageColor(snap.pageId, note.id, snap.color));
    }
    if (prev.background !== snap.background) {
      void attempt("Impossibile ripristinare lo sfondo della pagina", () => setPageBackground(snap.pageId, note.id, snap.background));
    }
    const target = next.findIndex((p) => p.id === snap.pageId);
    const el = editorRef.current;
    if (target === index && el) {
      // PageSurface non è controllato da React: l'HTML si riscrive a mano.
      el.innerHTML = sanitizeHtml(snap.html) || "<p><br></p>";
      lastSelection.current = snap.selection;
      if (snap.selection && mode === "text") {
        el.focus();
        setTextOffsets(el, snap.selection);
      }
    } else {
      pendingSelection.current = { pageId: snap.pageId, selection: snap.selection };
      setIndex(target);
    }
  }

  function handleUndo() {
    const snap = history.undo(liveSnapshot);
    if (snap) applySnapshot(snap);
    else showToast("Niente da annullare");
  }

  function handleRedo() {
    const snap = history.redo(liveSnapshot);
    if (snap) applySnapshot(snap);
    else showToast("Niente da ripetere");
  }

  function handleInk(strokes: InkStroke[]) {
    if (!page) return;
    patchPage(page.id, { ink: strokes });
  }

  /** Azioni sul blocco sotto il cursore (duplica, sposta, spunta). */
  function blockAction(action: (root: HTMLElement) => boolean): boolean {
    const el = editorRef.current;
    if (!el || mode !== "text") return false;
    if (action(el)) commitEditor();
    return true;
  }

  // ---------------- Scorciatoie (lib/shortcuts.ts) ----------------

  /** Esegue l'azione di una scorciatoia; false = non riguarda questo editor (il tasto fa il suo lavoro). */
  function handleAction(action: ShortcutAction): boolean {
    const command = FORMAT_COMMANDS[action];
    if (command) {
      if (mode !== "text") return false;
      exec(command);
      return true;
    }
    const heading = HEADING_TAGS[action];
    if (heading) {
      if (mode !== "text") return false;
      handleBlockChange(heading);
      return true;
    }
    switch (action) {
      case "undo":
        handleUndo();
        return true;
      case "redo":
        handleRedo();
        return true;
      case "link":
        if (mode !== "text") return false;
        openLink();
        return true;
      case "checklist":
        if (mode !== "text") return false;
        handleChecklist();
        return true;
      case "toggleCheck":
        return blockAction(toggleCurrentCheck);
      case "duplicate":
        return blockAction(duplicateBlock);
      case "moveUp":
        return blockAction((root) => moveBlock(root, -1));
      case "moveDown":
        return blockAction((root) => moveBlock(root, 1));
      case "find":
        setFindOpen(true);
        return true;
      case "prevPage":
        setIndex((i) => Math.max(0, i - 1));
        return true;
      case "nextPage":
        setIndex((i) => Math.min(pagesRef.current.length - 1, i + 1));
        return true;
      case "zoomIn":
        setZoom((z) => Math.min(160, z + 10));
        return true;
      case "zoomOut":
        setZoom((z) => Math.max(60, z - 10));
        return true;
      case "zoomReset":
        setZoom(100);
        return true;
      case "pen":
      case "highlighter":
      case "eraser":
        if (mode !== "ink") return false;
        setTool(action === "pen" ? "pen" : action === "highlighter" ? "highlighter" : "eraser");
        return true;
      case "textMode":
        if (mode !== "ink") return false;
        setMode("text");
        return true;
      case "escape": {
        // Chiude quello che è aperto; se non c'è niente esce dal disegno o deseleziona.
        const open = Boolean(slash || menu || linkOpen || findOpen);
        setSlash(null);
        setMenu(null);
        setLinkOpen(false);
        setFindOpen(false);
        let done = open;
        if (!done && mode === "ink") {
          setMode("text");
          done = true;
        }
        if (!done) {
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed && editorRef.current?.contains(sel.anchorNode)) {
            sel.collapseToEnd();
            done = true;
          }
        }
        return done;
      }
      default:
        return false;
    }
  }

  const actionRef = useLatestRef(handleAction);
  useEffect(() => {
    if (!registerShortcuts) return;
    registerShortcuts((action) => actionRef.current(action));
    return () => registerShortcuts(null);
  }, [registerShortcuts, actionRef]);

  // ---------------- Menu "/" ----------------

  const insertItems: InsertItem[] = [
    { id: "h1", label: "Titolo 1", icon: <MdLooksOne />, hint: shortcutLabel("h1"), keywords: "titolo h1 intestazione" },
    { id: "h2", label: "Titolo 2", icon: <MdLooksTwo />, hint: shortcutLabel("h2"), keywords: "titolo h2 sottotitolo" },
    { id: "h3", label: "Titolo 3", icon: <MdLooks3 />, hint: shortcutLabel("h3"), keywords: "titolo h3" },
    { id: "bullets", label: "Elenco puntato", icon: <MdFormatListBulleted />, hint: shortcutLabel("bullets"), keywords: "lista elenco punti" },
    { id: "numbers", label: "Elenco numerato", icon: <MdFormatListNumbered />, hint: shortcutLabel("numbers"), keywords: "lista elenco numeri" },
    { id: "checklist", label: "Checklist", icon: <MdChecklist />, hint: shortcutLabel("checklist"), keywords: "cose da fare spunta todo" },
    { id: "divider", label: "Divisore", icon: <MdHorizontalRule />, keywords: "linea separatore riga" },
    { id: "file", label: "File", icon: <MdOutlineAttachFile />, hint: "allega", keywords: "allegato documento pdf" },
  ];
  const slashItems = slash ? filterInsertItems(insertItems, slash.query) : [];

  /**
   * Il menu si apre scrivendo "/" a inizio riga e segue quello che si scrive dopo ("/tit").
   * `open` = può aprirlo (dopo una battuta); spostando il cursore lo si può solo chiudere.
   */
  function checkSlash(open: boolean) {
    const el = editorRef.current;
    const sel = window.getSelection();
    const close = () => setSlash((s) => (s ? null : s));
    if (!el || !sel || sel.rangeCount === 0 || !sel.isCollapsed || mode !== "text") return close();
    const block = currentBlock(el);
    if (!block || !sel.anchorNode || !block.contains(sel.anchorNode)) return close();
    const before = document.createRange();
    before.selectNodeContents(block);
    before.setEnd(sel.anchorNode, sel.anchorOffset);
    const match = /^\/([^\s/]{0,24})$/.exec(before.toString().replace(/\u200b/g, ""));
    if (!match) return close();
    if (!open && !slash) return;
    const caret = sel.getRangeAt(0).getBoundingClientRect();
    const rect = caret.height > 0 ? caret : block.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 300));
    const below = rect.bottom + 6;
    const top = below + 320 > window.innerHeight ? Math.max(8, rect.top - 326) : below;
    setSlash((s) => ({ pageIndex: index, query: match[1], left, top, active: s && s.query === match[1] ? s.active : 0 }));
  }


  function pickInsert(item: InsertItem) {
    const el = editorRef.current;
    setSlash(null);
    if (!el) return;
    // Toglie "/testo" scritto per aprire il menu, poi inserisce la voce lì.
    const block = currentBlock(el);
    const sel = window.getSelection();
    if (block && sel && sel.rangeCount > 0 && sel.anchorNode) {
      const typed = document.createRange();
      typed.selectNodeContents(block);
      typed.setEnd(sel.anchorNode, sel.anchorOffset);
      sel.removeAllRanges();
      sel.addRange(typed);
      commandActive.current = true;
      try {
        document.execCommand("delete");
      } finally {
        commandActive.current = false;
      }
    }
    switch (item.id) {
      case "h1":
      case "h2":
      case "h3":
        handleBlockChange(item.id);
        break;
      case "bullets":
        exec("insertUnorderedList");
        break;
      case "numbers":
        exec("insertOrderedList");
        break;
      case "checklist":
        handleChecklist();
        break;
      case "divider":
        exec("insertHorizontalRule");
        break;
      case "file":
        commitEditor();
        void pickFiles();
        break;
    }
  }

  function handleEditorKey(e: KeyboardEvent<HTMLDivElement>): boolean {
    if (!slash) return false;
    const count = slashItems.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (count === 0) return true;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setSlash({ ...slash, active: (slash.active + delta + count) % count });
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      const item = slashItems[slash.active];
      if (!item) {
        setSlash(null);
        return false;
      }
      pickInsert(item);
      return true;
    }
    if (e.key === "Escape") {
      setSlash(null);
      return true;
    }
    return false;
  }

  // ---------------- Titolo e tag ----------------

  function handleTitle(value: string) {
    setTitle(value);
    titleDirty.current = true;
    schedule();
  }

  async function addTag() {
    const tag = tagDraft.trim().replace(/^#/, "").toLowerCase().slice(0, 24);
    setTagDraft("");
    if (!tag || note.tags.includes(tag)) return;
    await attempt("Impossibile aggiungere il tag", async () => {
      await updateNote(note.id, { tags: [...note.tags, tag] });
      onChanged();
    });
  }

  async function removeTag(tag: string) {
    await attempt("Impossibile rimuovere il tag", async () => {
      await updateNote(note.id, { tags: note.tags.filter((t) => t !== tag) });
      onChanged();
    });
  }

  function handleTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void addTag();
  }

  // ---------------- Pagine ----------------

  async function handleAddPage() {
    await flush();
    await attempt("Impossibile aggiungere la pagina", async () => {
      const created = await addPage(note.id, page?.background ?? "none", page?.color ?? null);
      const next = [...pagesRef.current, created];
      pagesRef.current = next;
      setPages(next);
      setIndex(next.length - 1);
      setMode("text");
    });
  }

  async function movePage(from: number, to: number) {
    if (to < 0 || to >= pagesRef.current.length) return;
    const currentId = pagesRef.current[index]?.id;
    const next = [...pagesRef.current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const reordered = next.map((p, i) => ({ ...p, position: i }));
    pagesRef.current = reordered;
    setPages(reordered);
    setIndex(Math.max(0, reordered.findIndex((p) => p.id === currentId)));
    await attempt("Impossibile salvare il nuovo ordine delle pagine", () => reorderPages(reordered.map((p) => p.id)));
  }

  async function removePage(id: number) {
    if (pagesRef.current.length <= 1) return;
    await attempt("Impossibile eliminare la pagina", async () => {
      await deletePage(id);
      dirtyPages.current.delete(id);
      const next = pagesRef.current.filter((p) => p.id !== id);
      pagesRef.current = next;
      setPages(next);
      setIndex((i) => Math.min(i, next.length - 1));
      onChanged();
    });
  }

  async function changeBackground(background: PageBackground) {
    if (!page || page.background === background) return;
    history.record(snapshotOf(page), { kind: "other" });
    const next = pagesRef.current.map((p) => (p.id === page.id ? { ...p, background } : p));
    pagesRef.current = next;
    setPages(next);
    await attempt("Impossibile cambiare lo sfondo della pagina", async () => {
      await setPageBackground(page.id, note.id, background);
      setSavedAt(Date.now());
      onChanged();
    });
  }

  async function exportAs(kind: "pdf" | "png" | "jpg" | "md" | "copy") {
    setMenu(null);
    await flush();
    const list = pagesRef.current;
    const meta = { title, kicker: (pathLabel || "Senza cartella").toUpperCase(), createdAt: note.createdAt };
    const base = slugify(title || "nota");
    setBusy(true);
    try {
      if (kind === "copy") {
        await navigator.clipboard.writeText(noteToMarkdown(title, list));
        showToast("Markdown copiato negli appunti");
      } else if (kind === "md") {
        if (await saveText(`${base}.md`, "md", "Markdown", noteToMarkdown(title, list))) showToast("Markdown salvato");
      } else if (kind === "pdf") {
        const bytes = await renderNotePdf(list, meta, { scale: 2, light: lightExport });
        if (await saveBytes(`${base}.pdf`, "pdf", "PDF", bytes)) showToast("PDF salvato");
      } else {
        const bytes = await renderNoteImage(list, meta, kind === "png" ? "png" : "jpeg", { scale: 3, light: lightExport });
        if (await saveBytes(`${base}.${kind}`, kind, kind === "png" ? "Immagine PNG" : "Immagine JPG", bytes)) {
          showToast("Immagine salvata");
        }
      }
    } catch (error) {
      console.error("Esportazione non riuscita:", error);
      showToast("Esportazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  async function pickFiles() {
    try {
      const picked = await openDialog({ multiple: true });
      if (!picked) return;
      onAttachPaths(note.id, Array.isArray(picked) ? picked : [picked]);
    } catch (error) {
      console.error("Selezione file non riuscita:", error);
      showToast("Impossibile aprire la scelta dei file");
    }
  }

  async function openAttachment(attachment: Attachment) {
    if (!note.diskPath) {
      showToast("La copia su disco non è ancora pronta, riprova tra un attimo");
      return;
    }
    try {
      await openPath(await attachmentAbsolutePath(note.diskPath, attachment.name));
    } catch (error) {
      console.error("Impossibile aprire l'allegato:", error);
      showToast("Impossibile aprire il file");
    }
  }

  async function removeAttachment(attachment: Attachment) {
    await attempt("Impossibile rimuovere l'allegato", async () => {
      if (note.diskPath) await removeAttachmentFile(note.diskPath, attachment.name);
      await deleteAttachment(attachment.id);
      setAttachments((list) => list.filter((a) => a.id !== attachment.id));
    });
  }

  const splitQ = splitQuery.trim().toLowerCase();
  const splitList = splitCandidates
    .filter((n) => n.id !== note.id && n.title.toLowerCase().includes(splitQ))
    .slice(0, 30);

  if (loadFailed) {
    return (
      <p className="nq-loading nq-loading--error" role="alert">
        Impossibile aprire la nota (dettagli nella console).
      </p>
    );
  }
  if (!ready || !page) return <p className="nq-loading">Caricamento…</p>;

  const savedLabel = saving
    ? "Salvataggio…"
    : `Salvato automaticamente · ${new Date(savedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;

  const kicker = pathLabel || "Senza cartella";
  const createdLabel = new Date(note.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  const textOff = mode !== "text";

  const titleBlock = (
    <div className="nq-page-titleblock">
      <textarea
        className="nq-page-title"
        value={title}
        rows={1}
        placeholder="Senza titolo"
        maxLength={120}
        aria-label="Titolo della nota"
        onChange={(e) => handleTitle(e.target.value.replace(/\n/g, " "))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            editorRef.current?.focus();
          }
        }}
      />
      <div className="nq-props">
        <span className="nq-chip nq-chip--prop">
          <MdOutlineCalendarToday aria-hidden="true" /> Creata {createdLabel}
        </span>
        <span>{pages.length === 1 ? "1 pagina" : `${pages.length} pagine`}</span>
      </div>
    </div>
  );

  return (
    <div className={`nq-editor${compact ? " nq-editor--compact" : ""}`}>
      <header className="nq-ed-head">
        {onToggleSide && (
          <button
            type="button"
            className="nq-icon-btn"
            onClick={onToggleSide}
            aria-label={sideOpen ? "Nascondi la barra laterale" : "Mostra la barra laterale"}
            aria-pressed={sideOpen}
          >
            <MdOutlineViewSidebar />
          </button>
        )}
        <Crumbs items={crumbs} />

        <div className="nq-tag-row">
          {note.tags.map((tag) => (
            <span key={tag} className="nq-chip">
              #{tag}
              <button type="button" onClick={() => void removeTag(tag)} aria-label={`Rimuovi il tag ${tag}`}>
                <MdClose />
              </button>
            </span>
          ))}
          <input
            className="nq-tag-input"
            value={tagDraft}
            placeholder="+ tag"
            maxLength={24}
            aria-label="Aggiungi un tag"
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={handleTagKey}
            onBlur={() => void addTag()}
          />
        </div>

        <button
          type="button"
          className={`nq-icon-btn nq-star${note.starred ? " is-on" : ""}`}
          onClick={onToggleStar}
          aria-label={note.starred ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
          aria-pressed={note.starred}
          title="Preferiti"
        >
          {note.starred ? <MdStar /> : <MdOutlineStarBorder />}
        </button>

        {onSplit && (
          <div className="nq-menu-anchor">
            <button
              type="button"
              className={`nq-icon-btn${menu === "split" ? " is-on" : ""}`}
              aria-label="Schermo diviso"
              aria-expanded={menu === "split"}
              title="Schermo diviso: affianca un'altra nota"
              onClick={() => {
                setSplitQuery("");
                setMenu(menu === "split" ? null : "split");
              }}
            >
              <MdOutlineVerticalSplit />
            </button>
            {menu === "split" && (
              <>
                <div className="nq-menu-backdrop" onClick={() => setMenu(null)} />
                <div className="nq-menu nq-menu--right nq-menu--list">
                  <input
                    autoFocus
                    className="nq-menu-search"
                    placeholder="Cerca una nota da affiancare…"
                    aria-label="Cerca una nota da affiancare"
                    value={splitQuery}
                    onChange={(e) => setSplitQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setMenu(null);
                    }}
                  />
                  {splitList.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        setMenu(null);
                        onSplit(n.id);
                      }}
                    >
                      <strong>{n.title || "Senza titolo"}</strong>
                      <span>{formatWhen(n.updatedAt)}</span>
                    </button>
                  ))}
                  {splitList.length === 0 && <p className="nq-menu-empty">Nessuna nota trovata.</p>}
                </div>
              </>
            )}
          </div>
        )}

        <div className="nq-menu-anchor">
          <button
            type="button"
            className={`nq-icon-btn${menu === "export" ? " is-on" : ""}`}
            disabled={busy}
            aria-label={busy ? "Esportazione in corso" : "Esporta"}
            aria-expanded={menu === "export"}
            title="Esporta (PDF, Markdown, PNG, JPG)"
            onClick={() => setMenu(menu === "export" ? null : "export")}
          >
            <MdOutlineFileUpload />
          </button>
          {menu === "export" && (
            <>
              <div className="nq-menu-backdrop" onClick={() => setMenu(null)} />
              <div className="nq-menu nq-menu--right">
                <button type="button" onClick={() => void exportAs("pdf")}>
                  <strong>PDF</strong>
                  <span>Una pagina PDF per ogni pagina della nota</span>
                </button>
                <button type="button" onClick={() => void exportAs("png")}>
                  <strong>Immagine PNG</strong>
                  <span>Alta risoluzione, tutte le pagine in verticale</span>
                </button>
                <button type="button" onClick={() => void exportAs("jpg")}>
                  <strong>Immagine JPG</strong>
                  <span>Più leggera del PNG</span>
                </button>
                <button type="button" onClick={() => void exportAs("md")}>
                  <strong>Markdown (.md)</strong>
                  <span>Solo testo, senza la scrittura a mano</span>
                </button>
                <button type="button" onClick={() => void exportAs("copy")}>
                  <strong>Copia Markdown</strong>
                  <span>Negli appunti</span>
                </button>
                <label className="nq-menu-check">
                  <input type="checkbox" checked={lightExport} onChange={(e) => setLightExport(e.target.checked)} />
                  Sfondo chiaro (consigliato per stampare)
                </label>
              </div>
            </>
          )}
        </div>

        <div className="nq-menu-anchor">
          <button
            type="button"
            className={`nq-icon-btn${menu === "more" ? " is-on" : ""}`}
            aria-label="Altre azioni"
            aria-expanded={menu === "more"}
            title="Altre azioni"
            onClick={() => setMenu(menu === "more" ? null : "more")}
          >
            <MdMoreHoriz />
          </button>
          {menu === "more" && (
            <>
              <div className="nq-menu-backdrop" onClick={() => setMenu(null)} />
              <div className="nq-menu nq-menu--right nq-menu--more">
                <p className="nq-menu-status">{savedLabel}</p>
                <p className="nq-menu-status">
                  {kicker} · Modificata {formatWhen(note.updatedAt).toLowerCase()}
                </p>
                <ConfirmButton
                  className="nq-menu-danger"
                  label="Sposta nel cestino"
                  confirmLabel="Sicuro? Clicca ancora"
                  onConfirm={() => {
                    setMenu(null);
                    onTrash();
                  }}
                />
              </div>
            </>
          )}
        </div>

        {onClosePane && (
          <button type="button" className="nq-icon-btn" onClick={onClosePane} aria-label="Chiudi riquadro" title="Chiudi riquadro">
            <MdClose />
          </button>
        )}
      </header>

      {/* onMouseDown preventDefault: i pulsanti non rubano la selezione al testo. */}
      <div
        className="nq-toolbar"
        role="toolbar"
        aria-label="Strumenti di scrittura"
        onMouseDown={(e) => {
          if (!(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLInputElement)) e.preventDefault();
        }}
      >
        <ToolButton label="Annulla" shortcut="undo" icon={<MdUndo />} onClick={handleUndo} />
        <ToolButton label="Ripeti" shortcut="redo" icon={<MdRedo />} onClick={handleRedo} />
        <span className="nq-tsep" />
        <select
          className="nq-tsel"
          value={block}
          disabled={textOff}
          onChange={(e) => handleBlockChange(e.target.value)}
          aria-label="Stile del paragrafo"
          title="Stile del paragrafo"
        >
          <option value="p">Testo normale</option>
          <option value="h1">Titolo 1</option>
          <option value="h2">Titolo 2</option>
          <option value="h3">Titolo 3</option>
        </select>
        <span className="nq-tsize">
          <button type="button" className="nq-tsize-btn" disabled={textOff} onClick={() => handleFontSize(fontSize - 1)} aria-label="Riduci il testo" title="Riduci il testo">
            A−
          </button>
          <NumberField className="nq-size-input" value={fontSize} min={8} max={200} disabled={textOff} onCommit={handleFontSize} aria-label="Dimensione del testo in pixel" title="Dimensione del testo (px)" />
          <button type="button" className="nq-tsize-btn" disabled={textOff} onClick={() => handleFontSize(fontSize + 1)} aria-label="Ingrandisci il testo" title="Ingrandisci il testo">
            A+
          </button>
        </span>
        <span className="nq-tsep" />
        <ToolButton label="Grassetto" shortcut="bold" icon={<MdFormatBold />} disabled={textOff} onClick={() => exec("bold")} />
        <ToolButton label="Corsivo" shortcut="italic" icon={<MdFormatItalic />} disabled={textOff} onClick={() => exec("italic")} />
        <ToolButton label="Sottolineato" shortcut="underline" icon={<MdFormatUnderlined />} disabled={textOff} onClick={() => exec("underline")} />
        <ToolButton label="Barrato" shortcut="strike" icon={<MdFormatStrikethrough />} disabled={textOff} onClick={() => exec("strikeThrough")} />
        <div className="nq-menu-anchor">
          <ToolButton
            label="Colore del testo"
            legend="colore"
            icon={<MdFormatColorText style={{ color: textColor }} />}
            disabled={textOff}
            pressed={menu === "color"}
            onClick={() => setMenu(menu === "color" ? null : "color")}
          />
          {menu === "color" && (
            <>
              <div className="nq-menu-backdrop" onClick={() => setMenu(null)} />
              <div className="nq-menu nq-menu--swatches">
                <div className="nq-swatch-grid">
                  {TEXT_COLORS.map((c) => (
                    <button key={c} type="button" className="nq-sw" style={{ background: c }} aria-label={`Colore ${c}`} onClick={() => handleTextColor(c)} />
                  ))}
                </div>
                <label className="nq-sw-custom-row">
                  <input type="color" value={textColor} onChange={(e) => handleTextColor(e.target.value)} />
                  <span>Altro colore…</span>
                </label>
              </div>
            </>
          )}
        </div>
        <ToolButton label="Cancella la formattazione" legend="pulisci" icon={<MdFormatClear />} disabled={textOff} onClick={() => withSelection(clearFormatting)} />
        <span className="nq-tsep" />
        <ToolButton label="Elenco puntato" shortcut="bullets" icon={<MdFormatListBulleted />} disabled={textOff} onClick={() => exec("insertUnorderedList")} />
        <ToolButton label="Checklist" shortcut="checklist" icon={<MdChecklist />} disabled={textOff} onClick={handleChecklist} />
        <ToolButton label="Link" shortcut="link" icon={<MdLink />} disabled={textOff} pressed={linkOpen} onClick={openLink} />
        {linkOpen && (
          <span className="nq-link-pop">
            <input
              autoFocus
              value={linkUrl}
              placeholder="https://…"
              aria-label="Indirizzo del link"
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyLink();
                if (e.key === "Escape") setLinkOpen(false);
              }}
            />
            <button type="button" className="nq-icon-btn" onClick={applyLink} aria-label="Applica il link">
              <MdAdd />
            </button>
          </span>
        )}
        <span className="nq-tsep" />
        <ToolButton label="Allega file" legend="file" icon={<MdOutlineAttachFile />} onClick={() => void pickFiles()} />
        <span className="nq-tsep" />
        <div className="nq-menu-anchor">
          <ToolButton
            label="Colore della pagina"
            legend="pagina"
            icon={<MdOutlineFormatColorFill style={{ color: page.color ?? undefined }} />}
            pressed={menu === "pagecolor"}
            onClick={() => setMenu(menu === "pagecolor" ? null : "pagecolor")}
          />
          {menu === "pagecolor" && (
            <>
              <div className="nq-menu-backdrop" onClick={() => setMenu(null)} />
              <div className="nq-menu nq-menu--swatches">
                <button type="button" className="nq-menu-reset" onClick={() => void changePageColor(null)}>
                  <strong>Colore del tema</strong>
                </button>
                <div className="nq-swatch-grid">
                  {PAGE_COLORS.map((c) => (
                    <button key={c.value} type="button" className="nq-sw" style={{ background: c.value }} title={c.label} aria-label={c.label} onClick={() => void changePageColor(c.value)} />
                  ))}
                </div>
                <label className="nq-sw-custom-row">
                  <input type="color" value={page.color ?? "#ffffff"} onChange={(e) => void changePageColor(e.target.value)} />
                  <span>Altro colore…</span>
                </label>
              </div>
            </>
          )}
        </div>
        <select
          className="nq-tsel"
          value={page.background}
          onChange={(e) => void changeBackground(e.target.value as PageBackground)}
          aria-label="Sfondo della pagina"
          title="Sfondo: puntini, quadretti, righe"
        >
          {BACKGROUND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="nq-tsep" />
        <ToolButton
          label={mode === "ink" ? "Torna al testo" : "Scrittura a mano"}
          legend="mano"
          icon={<MdOutlineGesture />}
          pressed={mode === "ink"}
          onClick={() => setMode(mode === "ink" ? "text" : "ink")}
        />
        {onOpenShortcuts && (
          <ToolButton label="Scorciatoie" shortcut="help" icon={<MdKeyboard />} onClick={onOpenShortcuts} />
        )}
      </div>

      {mode === "ink" && (
        <div className="nq-toolbar nq-ink-bar" role="toolbar" aria-label="Scrittura a mano">
          <ToolButton label="Penna" shortcut="pen" text="Penna" icon={<MdOutlineEdit />} pressed={tool === "pen"} onClick={() => setTool("pen")} />
          <ToolButton label="Evidenziatore" shortcut="highlighter" text="Evidenziatore" icon={<MdOutlineBorderColor />} pressed={tool === "highlighter"} onClick={() => setTool("highlighter")} />
          <ToolButton label="Gomma" shortcut="eraser" text="Gomma" icon={<MdOutlineBackspace />} pressed={tool === "eraser"} onClick={() => setTool("eraser")} />
          <span className="nq-tsep" />
          <span className="nq-ink-colors">
            {INK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="nq-ink-dot"
                aria-pressed={c === color}
                style={{ background: c === THEME_INK ? "var(--text-primary)" : c }}
                onClick={() => setColor(c)}
                aria-label={c === THEME_INK ? "Inchiostro del tema" : `Colore ${c}`}
              />
            ))}
            <label
              className={`nq-ink-dot nq-ink-custom${INK_COLORS.includes(color) ? "" : " is-on"}`}
              title="Colore personalizzato"
              style={INK_COLORS.includes(color) ? undefined : { background: color }}
            >
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Colore personalizzato" />
            </label>
          </span>
          <select className="nq-tsel" value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Spessore" title="Spessore">
            {INK_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} px
              </option>
            ))}
          </select>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="nq-attachments" aria-label="Allegati">
          {attachments.map((a) => (
            <span key={a.id} className="nq-attach">
              <button type="button" onClick={() => void openAttachment(a)} title="Apri">
                <MdOutlineAttachFile /> {a.name} <em>{formatBytes(a.size)}</em>
              </button>
              <button type="button" onClick={() => void removeAttachment(a)} aria-label={`Rimuovi ${a.name}`}>
                <MdClose />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="nq-scroll-wrap">
        {findOpen && (
          <FindBar
            pages={pages}
            index={index}
            editorRef={editorRef}
            onGoToPage={setIndex}
            onClose={() => {
              setFindOpen(false);
              editorRef.current?.focus();
            }}
          />
        )}

        <div className="nq-scroll">
          <PageSurface
            key={page.id}
            page={page}
            zoom={zoom}
            background={page.background}
            mode={mode}
            tool={tool}
            color={color}
            size={size}
            header={index === 0 ? titleBlock : null}
            editorRef={editorRef}
            onContent={handleTyping}
            onInk={handleInk}
            onEditorKeyDown={handleEditorKey}
            onAfterInput={() => checkSlash(true)}
            onHistory={(direction) => (direction === "undo" ? handleUndo() : handleRedo())}
          />
        </div>
      </div>

      <footer className="nq-pagebar">
        <span className="nq-pdots" aria-label="Pagine">
          {pages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className="nq-pdot"
              aria-pressed={i === index}
              aria-label={`Pagina ${i + 1}`}
              title={`Pagina ${i + 1}`}
              onClick={() => setIndex(i)}
            >
              <PageThumb page={p} kicker={kicker} dateLabel={monthYear(note.createdAt)} />
            </button>
          ))}
        </span>
        <span className="nq-pager">
          <button type="button" className="nq-icon-btn" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Pagina precedente">
            <MdChevronLeft />
          </button>
          Pagina {index + 1} di {pages.length}
          <button type="button" className="nq-icon-btn" disabled={index >= pages.length - 1} onClick={() => setIndex(index + 1)} aria-label="Pagina successiva">
            <MdChevronRight />
          </button>
        </span>
        <div className="nq-menu-anchor">
          <button
            type="button"
            className={`nq-btn nq-btn--small${menu === "pages" ? " is-on" : ""}`}
            aria-expanded={menu === "pages"}
            onClick={() => setMenu(menu === "pages" ? null : "pages")}
          >
            <MdOutlineLayers aria-hidden="true" /> Pagine
          </button>
          {menu === "pages" && (
            <>
              <div className="nq-menu-backdrop" onClick={() => setMenu(null)} />
              <div className="nq-menu nq-menu--up nq-pages-pop" role="dialog" aria-label="Gestisci le pagine">
                <div className="nq-pages-head">
                  <span>Pagine</span>
                  <span>{pages.length}</span>
                </div>
                <div className="nq-pages-list">
                  {pages.map((p, i) => (
                    <div key={p.id} className={`nq-thumb-wrap${i === index ? " is-active" : ""}`}>
                      <div
                        className="nq-thumb"
                        role="button"
                        tabIndex={0}
                        aria-label={`Vai alla pagina ${i + 1}`}
                        aria-current={i === index ? "page" : undefined}
                        onClick={() => setIndex(i)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setIndex(i);
                          }
                        }}
                      >
                        <PageThumb page={p} kicker={kicker} dateLabel={monthYear(note.createdAt)} />
                      </div>
                      <div className="nq-thumb-foot">
                        <span>Pagina {i + 1}</span>
                        <span className="nq-thumb-tools">
                          <button type="button" disabled={i === 0} onClick={() => void movePage(i, i - 1)} aria-label={`Sposta la pagina ${i + 1} prima`}>
                            <MdArrowUpward />
                          </button>
                          <button type="button" disabled={i === pages.length - 1} onClick={() => void movePage(i, i + 1)} aria-label={`Sposta la pagina ${i + 1} dopo`}>
                            <MdArrowDownward />
                          </button>
                          {pages.length > 1 && (
                            <ConfirmButton className="nq-thumb-del" label="✕" confirmLabel="Elimina?" onConfirm={() => removePage(p.id)} />
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" className="nq-btn nq-btn--block" onClick={() => void handleAddPage()}>
                  <MdAdd /> Aggiungi pagina
                </button>
              </div>
            </>
          )}
        </div>
        <button type="button" className="nq-icon-btn" onClick={() => void handleAddPage()} aria-label="Aggiungi pagina" title="Aggiungi pagina">
          <MdAdd />
        </button>
        <span className="nq-pager nq-pager--muted">{wordCount(page.content)} parole</span>
        <span className="nq-pager">
          <button type="button" className="nq-icon-btn" disabled={zoom <= 60} onClick={() => setZoom(zoom - 10)} aria-label="Riduci lo zoom">
            <MdRemove />
          </button>
          Zoom {zoom}%
          <button type="button" className="nq-icon-btn" disabled={zoom >= 160} onClick={() => setZoom(zoom + 10)} aria-label="Aumenta lo zoom">
            <MdAdd />
          </button>
        </span>
        <span className="nq-pager nq-pager--muted nq-save-status">{savedLabel}</span>
      </footer>

      {slash && (
        <InsertMenu
          items={slashItems}
          active={slash.active}
          left={slash.left}
          top={slash.top}
          onPick={pickInsert}
          onHover={(i) => setSlash({ ...slash, active: i })}
        />
      )}

      {toast && (
        <div className="nq-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

export default NoteEditor;
