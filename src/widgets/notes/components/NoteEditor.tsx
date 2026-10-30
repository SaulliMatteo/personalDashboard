import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
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
  MdFormatColorReset,
  MdFormatColorText,
  MdFormatItalic,
  MdFormatListBulleted,
  MdFormatListNumbered,
  MdFormatStrikethrough,
  MdFormatUnderlined,
  MdDoneAll,
  MdHighlight,
  MdHorizontalRule,
  MdCode,
  MdKeyboard,
  MdLink,
  MdLooks3,
  MdLooksOne,
  MdLooksTwo,
  MdMoreHoriz,
  MdOutlineAddPhotoAlternate,
  MdOutlineAttachFile,
  MdOutlineImage,
  MdOutlineBackspace,
  MdOutlineShapeLine,
  MdOutlineBorderColor,
  MdOutlineCalendarToday,
  MdOutlineEdit,
  MdOutlineFileUpload,
  MdOutlineGesture,
  MdOutlineLayers,
  MdOutlineStarBorder,
  MdOutlineTableChart,
  MdOutlineStorage,
  MdAlternateEmail,
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
  loadCodeDetect,
  loadInkShapes,
  reorderPages,
  saveCodeDetect,
  saveInkShapes,
  savePage,
  setPageBackground,
  updateNote,
  setPageColor,
  setPagesColor,
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
import { CONTRAST_LARGE, TITLE_COLORS, isTitleColor } from "../lib/titleColor";
import { useTitleColor } from "../lib/useTitleColor";
import NumberField from "../../../ui/NumberField";
import PageThumb from "./PageThumb";
import { PAGE_COLORS, customPageColor, isPageColorKey } from "../lib/pageColor";
import {
  DEFAULT_SIZE,
  MARK_COLORS,
  MARK_THEME,
  NOTE_DEFAULT_FONTS,
  NOTE_FONTS,
  SIZE_MAX,
  SIZE_MIN,
  TEXT_COLORS,
  applyTextAttr,
  inHeading,
  textAttrAt,
  type NoteFont,
} from "../lib/textStyle";
import {
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
import { caretCell, createTableElement, placeCaret } from "../lib/tableDom";
import { shortcutLabel, type ShortcutAction } from "../lib/shortcuts";
import { filterInsertItems, type InsertItem } from "../lib/insertItems";
import { createCodeBlock, createFileBlock, createImageBlock, createRowRef, createViewBlock, insertBlocks, caretAt, serializeEditor } from "../lib/blocks";
import { detectCode } from "../lib/codeDetect";
import { normalizeLang, type CodeLang } from "../lib/codeLanguages";
import { rowTitle } from "../lib/collections";
import { createCollection, createView, fieldsOf, restoreRow, rowInfo, setCell, trashRow, useCollections } from "../lib/collectionsStore";
import type { CollectionLinks } from "../collections/CollectionView";
import RowCard from "../collections/RowCard";
import { attachmentUrl, imageSize, isImageName, IMAGE_EXTENSIONS } from "../lib/attachmentUrls";
import { MAX_FILE_BYTES, classifyFile, formatBytes, pastedImageName, readPaths, textFileToHtml, type IncomingFile } from "../lib/insertFiles";
import type { EditorApi, ScreenPoint, StoredFile } from "../lib/editorApi";
import DropOverlay, { type DropZone } from "./DropOverlay";
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
  /** Il riquadro si registra per scorciatoie e file trascinati (lib/editorApi.ts); null = si toglie. */
  registerEditor?: (api: EditorApi | null) => void;
  /** Copia i file nella cartella della nota e li aggiunge agli allegati; restituisce i nomi finali. */
  onStoreFiles: (noteId: number, files: IncomingFile[]) => Promise<StoredFile[]>;
  onOpenShortcuts?: () => void;
  /** Note e navigazione per raccolte, viste collegate e riferimenti @. */
  collections: CollectionLinks;
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
  registerEditor,
  onStoreFiles,
  onOpenShortcuts,
  collections,
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
  const [shapes, setShapes] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [block, setBlock] = useState("p");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(note.updatedAt);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  /** Pulsante dell'avviso (es. "Converti in codice"); null = avviso semplice. */
  const [toastAction, setToastAction] = useState<{ label: string; run: () => void } | null>(null);
  /** Riconoscimento del codice incollato (opzione nel menu "⋯"). */
  const [codeDetectOn, setCodeDetectOn] = useState(true);
  /** Ctrl+Shift+V appena premuto: il prossimo incolla è sempre testo semplice. */
  const plainPaste = useRef(false);
  /** Durante una trasformazione a più passi i singoli input non entrano in cronologia (una voce sola). */
  const silentInput = useRef(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fontSize, setFontSize] = useState(15);
  /** Colore libero del testo (l'ultimo scelto nel selettore). */
  const [textColor, setTextColor] = useState("#e03131");
  /** Font, colore ed evidenziatore sotto il cursore ("" = quello del tema). */
  const [fontKey, setFontKey] = useState("");
  const [colorKey, setColorKey] = useState("");
  const [inTitle, setInTitle] = useState(false);
  const [noteFont, setNoteFont] = useState<NoteFont | null>(note.font);
  /** Colore del titolo (null = quello del tema) e se adesso è corretto per il contrasto. */
  const [titleColor, setTitleColor] = useState<string | null>(note.titleColor);
  const [titleAdjusted, setTitleAdjusted] = useState(false);
  const titleInputRef = useRef<HTMLTextAreaElement | null>(null);
  /** Colore del titolo ancora da scrivere nel DB (lo scrive flush, anche uscendo dall'editor). */
  const titleColorDirty = useRef(false);
  const titleColorRef = useLatestRef(titleColor);
  // Il titolo sta solo sulla prima pagina: si ricolora quando torna visibile o cambia lo sfondo della pagina.
  useTitleColor(titleInputRef, titleColor, CONTRAST_LARGE, [index, ready, pages[0]?.color, pages[0]?.background], setTitleAdjusted);
  const [menu, setMenu] = useState<"export" | "split" | "color" | "mark" | "more" | "pages" | "views" | null>(null);
  const store = useCollections();
  const [mentionState, setMention] = useState<SlashState | null>(null);
  /** Riga aperta da un riferimento @ (scheda della riga). */
  const [refRow, setRefRow] = useState<number | null>(null);
  const zoomRef = useLatestRef(zoom);
  const [lightExport, setLightExport] = useState(true);
  const [busy, setBusy] = useState(false);
  const [splitQuery, setSplitQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  /** File trascinati sopra la pagina: zona sotto il puntatore e quanti sono. */
  const [dropDrag, setDropDrag] = useState<{ zone: DropZone; count: number } | null>(null);
  const scrollWrapRef = useRef<HTMLDivElement | null>(null);
  const [slashState, setSlash] = useState<SlashState | null>(null);
  const slash = slashState && slashState.pageIndex === index ? slashState : null;
  const mention = mentionState && mentionState.pageIndex === index ? mentionState : null;
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
      setFontKey(textAttrAt(root, "data-font") ?? "");
      setColorKey(textAttrAt(root, "data-color") ?? "");
      setInTitle(inHeading(root));
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
    const saveColor = titleColorDirty.current;
    titleColorDirty.current = false;
    if (ids.length === 0 && !saveTitle && !saveColor) return;
    try {
      if (saveTitle || saveColor) {
        await updateNote(note.id, {
          ...(saveTitle ? { title: titleRef.current } : {}),
          ...(saveColor ? { titleColor: titleColorRef.current } : {}),
        });
      }
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
      if (saveColor) titleColorDirty.current = true;
      setToast("Salvataggio non riuscito");
    }
  }, [note.id, onChanged, titleRef, titleColorRef]);

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
    setToastAction(null);
    setToast(text);
  }

  /** Avviso con un pulsante: resta qualche secondo in più, sparisce se si continua a scrivere. */
  function showSuggestion(text: string, label: string, run: () => void) {
    setToastAction({ label, run });
    setToast(text);
  }

  // Un solo timer: un avviso nuovo non viene chiuso da quello del precedente.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(
      () => {
        setToast(null);
        setToastAction(null);
      },
      toastAction ? 6000 : 2200
    );
    return () => window.clearTimeout(timer);
  }, [toast, toastAction]);

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
    if (el && page) patchPage(page.id, { content: serializeEditor(el) });
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
    if (!page || silentInput.current) return;
    // Si continua a scrivere: il suggerimento "Converti in codice" non serve più.
    if (toastAction && !commandActive.current) {
      setToast(null);
      setToastAction(null);
    }
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

  /** Dimensione 12–40 px (la normale, 15, non lascia attributi). */
  function handleFontSize(px: number) {
    const value = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(px)));
    setFontSize(value);
    withSelection((root) => applyTextAttr(root, "data-size", value === DEFAULT_SIZE ? null : String(value)));
  }

  /** Font della selezione: "" = quello del tema (o della nota). */
  function handleFont(key: string) {
    setFontKey(key);
    withSelection((root) => applyTextAttr(root, "data-font", key || null));
  }

  /** Colore della palette (null = colore del tema). */
  function handleTextColor(key: string | null) {
    setMenu(null);
    setColorKey(key ?? "");
    withSelection((root) => applyTextAttr(root, "data-color", key));
  }

  /** Colore libero scelto col selettore. */
  function handleCustomTextColor(color: string) {
    setTextColor(color);
    withSelection((root) => applyTextColor(root, color));
  }

  /** Evidenziatore: chiave della palette, "tema", o null per toglierlo. */
  function handleMark(key: string | null) {
    setMenu(null);
    withSelection((root) => applyTextAttr(root, "data-mark", key));
  }

  /**
   * Colore del titolo: si vede subito e si salva col resto della nota (il selettore libero manda
   * un evento a ogni spostamento del cursore, non serve scrivere ognuno).
   */
  function changeTitleColor(color: string | null) {
    setTitleColor(color);
    titleColorDirty.current = true;
    schedule();
  }

  async function changeNoteFont(font: NoteFont | null) {
    setNoteFont(font);
    await attempt("Impossibile cambiare il font della nota", async () => {
      await updateNote(note.id, { font });
      onChanged();
    });
  }

/** "Applica a tutte le pagine": una sola voce nella cronologia per tutte le pagine cambiate. */
async function applyColorToAll() {
  if (!page) return;
  const color = page.color;
  const group = Date.now();
  const changed = pagesRef.current.filter((p) => p.color !== color);
  if (changed.length === 0) {
    showToast("Tutte le pagine hanno già questo colore");
    return;
  }
  for (const p of changed) history.record(snapshotOf(p), { kind: "other", group });
  const next = pagesRef.current.map((p) => ({ ...p, color }));
  pagesRef.current = next;
  setPages(next);
  await attempt("Impossibile applicare il colore alle pagine", async () => {
    await setPagesColor(note.id, color);
    setSavedAt(Date.now());
    showToast("Colore applicato a tutte le pagine");
    onChanged();
  });
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
  function applySnapshot(snap: PageSnapshot, navigate: boolean) {
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
    } else if (navigate) {
      pendingSelection.current = { pageId: snap.pageId, selection: snap.selection };
      setIndex(target);
    }
  }

  /** Applica una voce (o un gruppo): si va alla pagina toccata solo se quella aperta non c'entra. */
  function applySnapshots(list: PageSnapshot[]) {
    const openId = pagesRef.current[index]?.id;
    const touchesOpen = list.some((snap) => snap.pageId === openId);
    list.forEach((snap, i) => applySnapshot(snap, !touchesOpen && i === 0));
  }

  function handleUndo() {
    const snaps = history.undo(liveSnapshot);
    if (snaps.length > 0) applySnapshots(snaps);
    else showToast("Niente da annullare");
  }

  function handleRedo() {
    const snaps = history.redo(liveSnapshot);
    if (snaps.length > 0) applySnapshots(snaps);
    else showToast("Niente da ripetere");
  }

  /** Blocco di codice dove sta il cursore; il cursore va dentro il blocco. */
  function insertCodeBlock(lang: CodeLang = "plaintext", text = "") {
    const el = editorRef.current;
    if (!el || mode !== "text") return;
    const at = insertionPoint();
    el.focus({ preventScroll: true });
    insertBlocks(el, at && el.contains(at.startContainer) ? at : null, [createCodeBlock(lang, text, true)]);
    commitEditor();
  }

  /**
   * Il testo appena incollato (da `start` a `end` nel testo della pagina) diventa un blocco di
   * codice. È una modifica a parte: Ctrl+Z torna al testo incollato normale.
   */
  function convertPastedToCode(start: number, end: number, lang: CodeLang, text: string) {
    setToast(null);
    setToastAction(null);
    const el = editorRef.current;
    if (!el || mode !== "text") return;
    el.focus({ preventScroll: true });
    setTextOffsets(el, { start, end });
    const sel = window.getSelection();
    const squash = (s: string) => s.replace(/\s+/g, "");
    if (!sel || sel.rangeCount === 0 || squash(sel.getRangeAt(0).toString()) !== squash(text)) {
      showToast("Il testo è cambiato: non si può più convertire");
      return;
    }
    commandActive.current = true;
    try {
      document.execCommand("delete");
    } finally {
      commandActive.current = false;
    }
    const at = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    insertBlocks(el, at, [createCodeBlock(lang, text, true)]);
    commitEditor();
  }

  /** Tabella 3×3 con intestazione dove sta il cursore (dopo il paragrafo, o al suo posto se è vuoto). */
  function insertTable() {
    const el = editorRef.current;
    if (!el || mode !== "text") return;
    const at = insertionPoint();
    el.focus({ preventScroll: true });
    const table = createTableElement(3, 3);
    insertBlocks(el, at && el.contains(at.startContainer) ? at : null, [table]);
    const first = table.querySelector<HTMLElement>("th, td");
    if (first) placeCaret(first, false);
    commitEditor();
  }

  // Riconoscimento del codice incollato, e Ctrl+Shift+V (incolla sempre come testo semplice).
  useEffect(() => {
    let alive = true;
    loadCodeDetect()
      .then((on) => {
        if (alive) setCodeDetectOn(on);
      })
      .catch((err) => console.error("Riconoscimento del codice: lettura non riuscita", err));
    let timer: number | undefined;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "v") {
        plainPaste.current = true;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => (plainPaste.current = false), 500);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  function toggleCodeDetect() {
    const next = !codeDetectOn;
    setCodeDetectOn(next);
    saveCodeDetect(next).catch((err) => console.error("Riconoscimento del codice: salvataggio non riuscito", err));
  }

  // Forme automatiche: la scelta resta tra un'apertura e l'altra.
  useEffect(() => {
    let alive = true;
    loadInkShapes()
      .then((on) => {
        if (alive) setShapes(on);
      })
      .catch((err) => console.error("Forme automatiche: lettura non riuscita", err));
    return () => {
      alive = false;
    };
  }, []);

  function toggleShapes() {
    const next = !shapes;
    setShapes(next);
    saveInkShapes(next).catch((err) => console.error("Forme automatiche: salvataggio non riuscito", err));
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
      case "indent":
      case "outdent":
        // Nel testo li gestisce già la pagina; altrove Tab resta quello del browser.
        return false;
      case "duplicate":
        return blockAction(duplicateBlock);
      case "table":
        if (mode !== "text") return false;
        insertTable();
        return true;
      case "code":
        if (mode !== "text") return false;
        insertCodeBlock();
        return true;
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
        const open = Boolean(slash || mention || menu || linkOpen || findOpen);
        setSlash(null);
        setMention(null);
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
  const dragOverRef = useLatestRef(dragOver);
  const dropRef = useLatestRef(dropFiles);
  useEffect(() => {
    if (!registerEditor) return;
    registerEditor({
      action: (action) => actionRef.current(action),
      dragOver: (point, count) => dragOverRef.current(point, count),
      drop: (paths, point) => dropRef.current(paths, point),
    });
    return () => registerEditor(null);
  }, [registerEditor, actionRef, dragOverRef, dropRef]);

  // ---------------- Menu "/" ----------------

  const insertItems: InsertItem[] = [
    { id: "h1", label: "Titolo 1", icon: <MdLooksOne />, hint: shortcutLabel("h1"), keywords: "titolo h1 intestazione" },
    { id: "h2", label: "Titolo 2", icon: <MdLooksTwo />, hint: shortcutLabel("h2"), keywords: "titolo h2 sottotitolo" },
    { id: "h3", label: "Titolo 3", icon: <MdLooks3 />, hint: shortcutLabel("h3"), keywords: "titolo h3" },
    { id: "bullets", label: "Elenco puntato", icon: <MdFormatListBulleted />, hint: shortcutLabel("bullets"), keywords: "lista elenco punti" },
    { id: "numbers", label: "Elenco numerato", icon: <MdFormatListNumbered />, hint: shortcutLabel("numbers"), keywords: "lista elenco numeri" },
    { id: "checklist", label: "Checklist", icon: <MdChecklist />, hint: shortcutLabel("checklist"), keywords: "cose da fare spunta todo" },
    { id: "table", label: "Tabella", icon: <MdOutlineTableChart />, hint: shortcutLabel("table"), keywords: "tabella griglia righe colonne" },
    { id: "code", label: "Codice", icon: <MdCode />, hint: shortcutLabel("code"), keywords: "codice programma script blocco python sql java javascript html" },
    { id: "view", label: "Tabella da una raccolta", icon: <MdOutlineStorage />, hint: "vista", keywords: "raccolta vista collegata database dati" },
    { id: "ref", label: "Riferimento a una riga", icon: <MdAlternateEmail />, hint: "@", keywords: "riferimento riga raccolta menzione chiocciola" },
    { id: "divider", label: "Divisore", icon: <MdHorizontalRule />, keywords: "linea separatore riga" },
    { id: "image", label: "Immagine", icon: <MdOutlineImage />, hint: "Ctrl V", keywords: "foto figura png jpg" },
    { id: "file", label: "File", icon: <MdOutlineAttachFile />, hint: "nella pagina", keywords: "allegato documento pdf scheda" },
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


  // ---------------- Riferimenti "@" a una riga di raccolta ----------------

  const mentionCtx = { now: new Date(), noteTitle: () => null };
  const mentionItems: InsertItem[] = mention
    ? store.rows
        .flatMap((r) => {
          if (r.deletedAt !== null) return [];
          const info = rowInfo(store, r.id);
          if (!info || info.collection.deletedAt !== null) return [];
          const label = rowTitle(info.fields, r, mentionCtx);
          return label.toLowerCase().includes(mention.query.toLowerCase())
            ? [{ id: String(r.id), label, hint: info.collection.name, icon: <MdAlternateEmail /> }]
            : [];
        })
        .slice(0, 8)
    : [];

  /** Il "@testo" appena prima del cursore (anche dentro una cella), o null. */
  function mentionBefore(): { node: Text; start: number; end: number; query: string } | null {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
    const node = sel.anchorNode;
    if (!(node instanceof Text) || !el.contains(node) || node.parentElement?.closest("[data-block], [data-ref-row]")) return null;
    const before = (node.textContent ?? "").slice(0, sel.anchorOffset);
    const m = /(?:^|[\s(\u00a0])@([^\s@]{0,30})$/.exec(before);
    if (!m) return null;
    return { node, start: sel.anchorOffset - m[1].length - 1, end: sel.anchorOffset, query: m[1] };
  }

  function checkMention(open: boolean) {
    const found = mode === "text" ? mentionBefore() : null;
    if (!found) {
      setMention((s) => (s ? null : s));
      return;
    }
    if (!open && !mention) return;
    const range = document.createRange();
    range.setStart(found.node, found.start);
    range.setEnd(found.node, found.end);
    const rect = range.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 300));
    const below = rect.bottom + 6;
    const top = below + 320 > window.innerHeight ? Math.max(8, rect.top - 326) : below;
    setMention((s) => ({ pageIndex: index, query: found.query, left, top, active: s && s.query === found.query ? s.active : 0 }));
  }

  function pickMention(item: InsertItem) {
    setMention(null);
    const found = mentionBefore();
    const info = rowInfo(store, Number(item.id));
    if (!found || !info) return;
    const range = document.createRange();
    range.setStart(found.node, found.start);
    range.setEnd(found.node, found.end);
    range.deleteContents();
    const chip = createRowRef(info.row.id, rowTitle(info.fields, info.row, mentionCtx));
    const space = document.createTextNode("\u00a0");
    range.insertNode(space);
    range.insertNode(chip);
    const sel = window.getSelection();
    const caret = document.createRange();
    caret.setStartAfter(space);
    caret.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(caret);
    commitEditor();
  }

  // ---------------- Viste collegate ----------------

  /** Mette nella pagina una vista (nuova) della raccolta; "nuova" = crea prima la raccolta. */
  async function insertView(collectionId: number | "nuova") {
    setMenu(null);
    const el = editorRef.current;
    if (!el || !page) return;
    const at = insertionPoint();
    try {
      const id = collectionId === "nuova" ? await createCollection() : collectionId;
      const viewId = await createView(id);
      if (editorRef.current !== el) return;
      el.focus({ preventScroll: true });
      insertBlocks(el, at && el.contains(at.startContainer) ? at : null, [createViewBlock(viewId)]);
      commitEditor();
    } catch (error) {
      console.error("Vista non inserita:", error);
      showToast("Impossibile inserire la vista della raccolta");
    }
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
      case "table":
        insertTable();
        break;
      case "code":
        insertCodeBlock();
        break;
      case "view":
        commitEditor();
        setMenu("views");
        break;
      case "ref":
        // Scrive "@": si apre il menu dei riferimenti.
        exec("insertText", "@");
        checkMention(true);
        break;
      case "image":
        commitEditor();
        void pickAndInsert("image");
        break;
      case "file":
        commitEditor();
        void pickAndInsert("file");
        break;
    }
  }

  /**
   * "-" seguito da due spazi all'inizio di una riga di testo: la riga diventa un elenco puntato
   * (si intercetta il secondo spazio; con uno solo "- " resta testo). Ctrl+Z torna a "- ".
   */
  function autoBullet(e: KeyboardEvent<HTMLDivElement>): boolean {
    if (e.key !== " " || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || mode !== "text") return false;
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || !sel.isCollapsed || caretCell(el)) return false;
    const block = currentBlock(el);
    if (!block || !/^(P|DIV)$/.test(block.tagName) || block.hasAttribute("data-check") || block.hasAttribute("data-block")) return false;
    const before = document.createRange();
    before.selectNodeContents(block);
    before.setEnd(sel.anchorNode!, sel.anchorOffset);
    if (before.toString().replace(/\u00a0/g, " ") !== "- ") return false;
    sel.removeAllRanges();
    sel.addRange(before);
    commandActive.current = true;
    silentInput.current = true;
    try {
      document.execCommand("delete");
      document.execCommand("insertUnorderedList");
    } finally {
      commandActive.current = false;
      silentInput.current = false;
    }
    commitEditor();
    return true;
  }

  function handleEditorKey(e: KeyboardEvent<HTMLDivElement>): boolean {
    if (autoBullet(e)) return true;
    if (mention) {
      const count = mentionItems.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (count > 0) setMention({ ...mention, active: (mention.active + (e.key === "ArrowDown" ? 1 : -1) + count) % count });
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const item = mentionItems[mention.active];
        if (!item) {
          setMention(null);
          return false;
        }
        pickMention(item);
        return true;
      }
      if (e.key === "Escape") {
        setMention(null);
        return true;
      }
    }
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
    const meta = {
      title,
      kicker: (pathLabel || "Senza cartella").toUpperCase(),
      createdAt: note.createdAt,
      font: noteFont,
      noteDir: note.diskPath,
      titleColor,
    };
    const base = slugify(title || "nota");
    setBusy(true);
    try {
      if (kind === "copy") {
        await navigator.clipboard.writeText(noteToMarkdown(title, list));
        showToast("Markdown copiato negli appunti");
      } else if (kind === "md") {
        if (await saveText(`${base}.md`, "md", "Markdown", noteToMarkdown(title, list, titleColor))) showToast("Markdown salvato");
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

  /** Il punto del testo dove inserire (cursore nella pagina, o l'ultimo che c'era). */
  function insertionPoint(): Range | null {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (el && sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).startContainer)) return sel.getRangeAt(0).cloneRange();
    return savedRange.current && el?.contains(savedRange.current.startContainer) ? savedRange.current.cloneRange() : null;
  }

  /**
   * Mette dei file nella pagina: immagini come blocco immagine, .md e .txt come testo, gli altri
   * come scheda file. Immagini e file vanno nella cartella della nota (allegati), mai nel DB.
   */
  async function insertIncoming(files: IncomingFile[], at: Range | null) {
    const el = editorRef.current;
    if (!el || !page) return;
    const pageId = page.id;
    const tooBig = files.filter((f) => f.bytes.length > MAX_FILE_BYTES);
    if (tooBig.length > 0) showToast(`«${tooBig[0].name}» supera i 50 MB e non è stato inserito`);
    const ok = files.filter((f) => f.bytes.length <= MAX_FILE_BYTES);
    const toStore = ok.filter((f) => {
      const kind = classifyFile(f.name);
      return kind === "image" || kind === "file";
    });
    const stored = toStore.length > 0 ? await onStoreFiles(note.id, toStore) : [];
    const nodes: Node[] = [];
    let next = 0;
    for (const file of ok) {
      const kind = classifyFile(file.name);
      if (kind === "markdown" || kind === "text") {
        const template = document.createElement("template");
        template.innerHTML = textFileToHtml(file);
        nodes.push(...Array.from(template.content.childNodes));
        continue;
      }
      const saved = stored[next++];
      if (!saved) continue;
      if (kind === "image") {
        const dims = await imageSize(file.bytes, file.name).catch(() => ({ width: 0, height: 0 }));
        nodes.push(createImageBlock(saved.name, dims.width, dims.height));
      } else {
        nodes.push(createFileBlock(saved.name, saved.size));
      }
    }
    // Se intanto si è cambiata pagina si inserisce comunque qui, ma solo nella pagina di partenza.
    if (nodes.length === 0 || editorRef.current !== el || pagesRef.current[index]?.id !== pageId) return;
    el.focus({ preventScroll: true });
    insertBlocks(el, at && el.contains(at.startContainer) ? at : null, nodes);
    commitEditor();
    showToast(nodes.length === 1 ? "Inserito" : `Inseriti ${nodes.length} elementi`);
  }

  /** "Inserisci immagine" / "File" (barra o menu "/"): sceglie i file e li mette dove sta il cursore. */
  async function pickAndInsert(kind: "image" | "file") {
    const at = insertionPoint();
    try {
      const picked = await openDialog({
        multiple: true,
        filters: kind === "image" ? [{ name: "Immagini", extensions: IMAGE_EXTENSIONS }] : undefined,
      });
      if (!picked) return;
      setBusy(true);
      await insertIncoming(await readPaths(Array.isArray(picked) ? picked : [picked]), at);
    } catch (error) {
      console.error("Inserimento non riuscito:", error);
      showToast("Impossibile inserire il file (controlla i permessi di lettura)");
    } finally {
      setBusy(false);
    }
  }

  /** Incolla: immagini e file dagli appunti vanno nella pagina; l'HTML di altre app viene ripulito. */
  function handlePaste(e: ClipboardEvent<HTMLDivElement>): boolean {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      const at = insertionPoint();
      void (async () => {
        try {
          const incoming = await Promise.all(
            files.map(async (f) => ({
              // Gli screenshot arrivano come "image.png": si dà un nome con data e ora.
              name: f.name && f.name !== "image.png" ? f.name : pastedImageName(f.type),
              bytes: new Uint8Array(await f.arrayBuffer()),
            }))
          );
          await insertIncoming(incoming, at);
        } catch (error) {
          console.error("Incolla non riuscito:", error);
          showToast("Impossibile incollare il file");
        }
      })();
      return true;
    }
    const text = e.clipboardData.getData("text/plain");
    const el = editorRef.current;
    const insertPlain = () => {
      commandActive.current = true;
      try {
        document.execCommand("insertText", false, text);
      } finally {
        commandActive.current = false;
      }
    };
    // Ctrl+Shift+V: sempre testo semplice, senza riconoscimento.
    if (plainPaste.current) {
      plainPaste.current = false;
      e.preventDefault();
      insertPlain();
      commitEditor();
      return true;
    }
    // Codice incollato: prima il linguaggio dato dagli appunti (VS Code), poi le euristiche.
    if (codeDetectOn && text && el && !caretCell(el)) {
      let hint: CodeLang | null = null;
      try {
        const vscode = e.clipboardData.getData("vscode-editor-data");
        if (vscode) hint = normalizeLang((JSON.parse(vscode) as { mode?: string }).mode) ?? "plaintext";
      } catch {
        /* dati di VS Code illeggibili: si usano le euristiche */
      }
      const guess = detectCode(text, { hint });
      if (guess.level !== "nessuna") {
        e.preventDefault();
        const before = getTextOffsets(el);
        insertPlain();
        commitEditor(); // prima voce: incollato come testo (Ctrl+Z dopo la conversione torna qui)
        const after = getTextOffsets(el);
        if (before && after) {
          const convert = () => convertPastedToCode(before.start, after.end, guess.lang, text);
          if (guess.level === "alta") convert();
          else showSuggestion("Sembra codice", "Converti in codice", convert);
        }
        return true;
      }
    }
    const html = e.clipboardData.getData("text/html");
    if (html) {
      e.preventDefault();
      const clean = sanitizeHtml(html, { source: "esterno" });
      commandActive.current = true;
      try {
        if (clean) document.execCommand("insertHTML", false, clean);
        else document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      } finally {
        commandActive.current = false;
      }
      commitEditor();
      return true;
    }
    return false;
  }

  // ---------------- File trascinati dal sistema (eventi di Tauri, via NotesDetail) ----------------

  /** La zona del pannello sotto il punto, o null se il punto è fuori dalla pagina. */
  function zoneAt(point: ScreenPoint): DropZone | null {
    const wrap = scrollWrapRef.current;
    if (!wrap) return null;
    const r = wrap.getBoundingClientRect();
    if (point.x < r.left || point.x > r.right || point.y < r.top || point.y > r.bottom) return null;
    // Due colonne affiancate; su finestre strette sono una sopra l'altra (DropOverlay.css).
    if (window.innerWidth <= 860) return point.y < r.top + r.height / 2 ? "insert" : "attach";
    return point.x < r.left + r.width / 2 ? "insert" : "attach";
  }

  function dragOver(point: ScreenPoint | null, count: number) {
    const zone = point ? zoneAt(point) : null;
    setDropDrag((prev) => (zone === null ? null : prev && prev.zone === zone && prev.count === count ? prev : { zone, count }));
  }

  async function dropFiles(paths: string[], point: ScreenPoint): Promise<boolean> {
    const zone = zoneAt(point);
    setDropDrag(null);
    if (!zone) return false;
    if (zone === "attach") {
      onAttachPaths(note.id, paths);
      showToast("Allegato");
      return true;
    }
    const root = editorRef.current;
    const at = root ? caretAt(root, point.x, point.y) : null;
    setBusy(true);
    try {
      await insertIncoming(await readPaths(paths), at);
    } catch (error) {
      console.error("Inserimento dei file trascinati non riuscito:", error);
      showToast("Impossibile inserire il file (controlla i permessi di lettura)");
    } finally {
      setBusy(false);
    }
    return true;
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

  /** "Inserisci nella pagina" da un allegato che c'è già: il blocco usa lo stesso file, senza copiarlo. */
  async function insertAttachment(attachment: Attachment) {
    const el = editorRef.current;
    if (!el || !note.diskPath) {
      showToast("La copia su disco non è ancora pronta, riprova tra un attimo");
      return;
    }
    const at = insertionPoint();
    let block: HTMLElement;
    if (isImageName(attachment.name)) {
      const dims = await attachmentUrl(note.diskPath, attachment.name)
        .then((url) => {
          const img = new Image();
          img.src = url;
          return img.decode().then(() => ({ width: img.naturalWidth, height: img.naturalHeight }));
        })
        .catch(() => ({ width: 0, height: 0 }));
      block = createImageBlock(attachment.name, dims.width, dims.height);
    } else {
      block = createFileBlock(attachment.name, attachment.size);
    }
    el.focus({ preventScroll: true });
    insertBlocks(el, at, [block]);
    commitEditor();
    showToast("Inserito nella pagina");
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
        ref={titleInputRef}
        className="nq-page-title"
        value={title}
        rows={1}
        placeholder="Senza titolo"
        maxLength={120}
        aria-label="Titolo della nota"
        onChange={(e) => handleTitle(e.target.value.replace(/\n/g, " "))}
        onKeyDown={(e) => {
          // Invio e Tab passano al testo della pagina; Shift+Tab non fa uscire dall'editor.
          if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
            e.preventDefault();
            editorRef.current?.focus();
          } else if (e.key === "Tab") {
            e.preventDefault();
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
                <label className="nq-menu-field">
                  <span>Font della nota</span>
                  <select
                    className="nq-tsel"
                    value={noteFont ?? ""}
                    onChange={(e) => void changeNoteFont((e.target.value || null) as NoteFont | null)}
                  >
                    <option value="">Font del tema</option>
                    {NOTE_DEFAULT_FONTS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="nq-menu-field" role="group" aria-label="Colore del titolo">
                  <span>Colore del titolo</span>
                  <span className="nq-title-colors">
                    <button
                      type="button"
                      className="nq-title-default"
                      aria-pressed={titleColor === null}
                      title="Torna al colore del tema"
                      onClick={() => changeTitleColor(null)}
                    >
                      Predefinito
                    </button>
                    {TITLE_COLORS.map((c) => (
                      <button
                        key={c.color}
                        type="button"
                        className="nq-ink-dot"
                        aria-pressed={titleColor === c.color}
                        style={{ background: c.color }}
                        aria-label={`Titolo: ${c.label}`}
                        title={c.label}
                        onClick={() => changeTitleColor(c.color)}
                      />
                    ))}
                    <label
                      className={`nq-ink-dot nq-ink-custom${titleColor && !TITLE_COLORS.some((c) => c.color === titleColor) ? " is-on" : ""}`}
                      title="Colore libero"
                      style={titleColor && !TITLE_COLORS.some((c) => c.color === titleColor) ? { background: titleColor } : undefined}
                    >
                      <input
                        type="color"
                        value={isTitleColor(titleColor) ? titleColor : "#1c7ed6"}
                        onChange={(e) => changeTitleColor(e.target.value.toLowerCase())}
                        aria-label="Titolo: colore libero"
                      />
                    </label>
                  </span>
                  {titleColor && titleAdjusted && (
                    <small className="nq-title-warn">Adattato per leggibilità su questo sfondo</small>
                  )}
                </div>
                <label className="nq-menu-check nq-menu-check--pref">
                  <input type="checkbox" checked={codeDetectOn} onChange={toggleCodeDetect} />
                  <span>
                    Riconosci il codice incollato
                    <small>Ctrl+Shift+V incolla sempre come testo</small>
                  </span>
                </label>
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
        <select
          className="nq-tsel nq-tsel--font"
          value={fontKey}
          disabled={textOff}
          onChange={(e) => handleFont(e.target.value)}
          aria-label="Font della selezione"
          title="Font della selezione"
        >
          <option value="">{noteFont ? "Font della nota" : "Font del tema"}</option>
          {NOTE_FONTS.map((f) => (
            <option key={f.key} value={f.key} disabled={f.key === "punti" && !inTitle && fontKey !== "punti"}>
              {f.label}
            </option>
          ))}
        </select>
        <span className="nq-tsize">
          <button type="button" className="nq-tsize-btn" disabled={textOff} onClick={() => handleFontSize(fontSize - 1)} aria-label="Riduci il testo" title="Riduci il testo">
            A−
          </button>
          <NumberField className="nq-size-input" value={fontSize} min={SIZE_MIN} max={SIZE_MAX} disabled={textOff} onCommit={handleFontSize} aria-label="Dimensione del testo in pixel" title={`Dimensione del testo (${SIZE_MIN}–${SIZE_MAX} px)`} />
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
            icon={<MdFormatColorText className="nq-color-ico" data-color={colorKey || undefined} />}
            disabled={textOff}
            pressed={menu === "color"}
            onClick={() => setMenu(menu === "color" ? null : "color")}
          />
          {menu === "color" && (
            <>
              <div className="nq-menu-backdrop" onClick={() => setMenu(null)} />
              <div className="nq-menu nq-menu--swatches" role="dialog" aria-label="Colore del testo">
                <div className="nq-swatch-grid">
                  <button type="button" className="nq-sw nq-sw--theme" aria-label="Colore del tema" title="Colore del tema" aria-pressed={colorKey === ""} onClick={() => handleTextColor(null)}>
                    <MdFormatColorReset />
                  </button>
                  {TEXT_COLORS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className="nq-sw nq-sw--ink"
                      data-color={c.key}
                      aria-label={c.label}
                      title={c.label}
                      aria-pressed={colorKey === c.key}
                      onClick={() => handleTextColor(c.key)}
                    />
                  ))}
                </div>
                <label className="nq-sw-custom-row">
                  <input type="color" value={textColor} onChange={(e) => handleCustomTextColor(e.target.value)} />
                  <span>Altro colore…</span>
                </label>
              </div>
            </>
          )}
        </div>
        <div className="nq-menu-anchor">
          <ToolButton
            label="Evidenzia"
            legend="evid."
            icon={<MdHighlight />}
            disabled={textOff}
            pressed={menu === "mark"}
            onClick={() => setMenu(menu === "mark" ? null : "mark")}
          />
          {menu === "mark" && (
            <>
              <div className="nq-menu-backdrop" onClick={() => setMenu(null)} />
              <div className="nq-menu nq-menu--swatches" role="dialog" aria-label="Evidenziatore">
                <div className="nq-swatch-grid">
                  <button type="button" className="nq-sw nq-sw--mark" data-mark={MARK_THEME} aria-label="Colore del tema" title="Colore del tema" onClick={() => handleMark(MARK_THEME)} />
                  {MARK_COLORS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className="nq-sw nq-sw--mark"
                      data-mark={c.key}
                      aria-label={c.label}
                      title={c.label}
                      onClick={() => handleMark(c.key)}
                    />
                  ))}
                </div>
                <button type="button" className="nq-menu-reset nq-menu-reset--after" onClick={() => handleMark(null)}>
                  <strong>Togli l'evidenziatura</strong>
                </button>
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
        <ToolButton label="Inserisci tabella" shortcut="table" icon={<MdOutlineTableChart />} disabled={textOff} onClick={insertTable} />
        <ToolButton label="Blocco di codice" shortcut="code" icon={<MdCode />} disabled={textOff} onClick={() => insertCodeBlock()} />
        <ToolButton label="Inserisci immagine" legend="img" icon={<MdOutlineImage />} disabled={busy} onClick={() => void pickAndInsert("image")} />
        <ToolButton label="Allega file" legend="file" icon={<MdOutlineAttachFile />} onClick={() => void pickFiles()} />
        <div className="nq-menu-anchor">
          <ToolButton
            label="Inserisci vista di una raccolta"
            legend="racc."
            icon={<MdOutlineStorage />}
            disabled={textOff}
            pressed={menu === "views"}
            onClick={() => {
              commitEditor();
              setMenu(menu === "views" ? null : "views");
            }}
          />
          {menu === "views" && (
            <>
              <div className="nq-menu-backdrop" onClick={() => setMenu(null)} />
              <div className="nq-menu" role="menu" aria-label="Vista di una raccolta" onMouseDown={(e) => e.preventDefault()}>
                {store.collections
                  .filter((c) => c.deletedAt === null)
                  .map((c) => (
                    <button key={c.id} type="button" role="menuitem" onClick={() => void insertView(c.id)}>
                      <strong>{c.name}</strong>
                      <span>{fieldsOf(store, c.id).length} campi</span>
                    </button>
                  ))}
                <button type="button" role="menuitem" onClick={() => void insertView("nuova")}>
                  <strong>+ Nuova raccolta</strong>
                  <span>Con i campi Titolo, Stato e Data</span>
                </button>
              </div>
            </>
          )}
        </div>
        <span className="nq-tsep" />
        <span className="nq-swatches" role="group" aria-label="Colore della pagina">
          <button
            type="button"
            className="nq-psw nq-psw--theme"
            aria-label="Pagina: colore del tema"
            title="Pagina: colore del tema"
            aria-pressed={page.color === null}
            onClick={() => void changePageColor(null)}
          />
          {PAGE_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              className="nq-psw"
              data-k={c.key}
              aria-label={`Pagina: ${c.label}`}
              title={`Pagina: ${c.label}`}
              aria-pressed={page.color === c.key}
              onClick={() => void changePageColor(c.key)}
            />
          ))}
          <label
            className="nq-psw nq-psw--custom"
            title="Pagina: altro colore"
            data-on={page.color !== null && !isPageColorKey(page.color) ? "" : undefined}
            style={page.color !== null && !isPageColorKey(page.color) ? { background: page.color } : undefined}
          >
            <input
              type="color"
              value={customPageColor(page.color)}
              onChange={(e) => void changePageColor(e.target.value)}
              aria-label="Pagina: altro colore"
            />
          </label>
        </span>
        <ToolButton label="Applica il colore a tutte le pagine" legend="tutte" icon={<MdDoneAll />} onClick={() => void applyColorToAll()} />
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
          <ToolButton
            label={shapes ? "Forme automatiche: accese (tieni fermo a fine tratto)" : "Forme automatiche: spente"}
            legend="forme"
            text="Forme"
            icon={<MdOutlineShapeLine />}
            pressed={shapes}
            disabled={tool === "eraser"}
            onClick={toggleShapes}
          />
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
              <button
                type="button"
                onClick={() => void insertAttachment(a)}
                aria-label={`Inserisci ${a.name} nella pagina`}
                title="Inserisci nella pagina"
              >
                <MdOutlineAddPhotoAlternate />
              </button>
              <button type="button" onClick={() => void removeAttachment(a)} aria-label={`Rimuovi ${a.name}`}>
                <MdClose />
              </button>
            </span>
          ))}
        </div>
      )}

      <div ref={scrollWrapRef} className="nq-scroll-wrap">
        {dropDrag && <DropOverlay zone={dropDrag.zone} count={dropDrag.count} />}
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
            shapes={shapes}
            header={index === 0 ? titleBlock : null}
            noteFont={noteFont}
            noteDir={note.diskPath}
            editorRef={editorRef}
            onContent={handleTyping}
            onBlockChange={commitEditor}
            onPaste={handlePaste}
            onNotice={showToast}
            onInk={handleInk}
            onEditorKeyDown={handleEditorKey}
            onAfterInput={() => {
              checkSlash(true);
              checkMention(true);
            }}
            collections={collections}
            onRefClick={(rowId) => {
              const info = rowInfo(store, rowId);
              if (!info) showToast("Riga eliminata per sempre dalla sua raccolta");
              else setRefRow(rowId);
            }}
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

      {mention && (
        <InsertMenu
          items={mentionItems}
          active={mention.active}
          left={mention.left}
          top={mention.top}
          onPick={pickMention}
          onHover={(i) => setMention({ ...mention, active: i })}
        />
      )}

      {refRow !== null &&
        (() => {
          const info = rowInfo(store, refRow);
          if (!info) return null;
          if (info.row.deletedAt !== null || info.collection.deletedAt !== null) {
            return (
              <div className="nq-ref-gone" role="dialog" aria-label="Riga eliminata">
                <span>
                  Riga eliminata da «{info.collection.name}»
                  {info.collection.deletedAt !== null ? " (la raccolta è nel cestino)" : ""}
                </span>
                {info.collection.deletedAt === null && (
                  <button
                    type="button"
                    className="nq-btn nq-btn--small"
                    onClick={() => {
                      setRefRow(null);
                      void restoreRow(info.row.id).catch(() => showToast("Impossibile ripristinare la riga"));
                    }}
                  >
                    Ripristina
                  </button>
                )}
                <button type="button" className="nq-icon-btn" aria-label="Chiudi" onClick={() => setRefRow(null)}>
                  ×
                </button>
              </div>
            );
          }
          return (
            <RowCard
              collectionName={info.collection.name}
              fields={info.fields}
              row={info.row}
              notes={collections.notes}
              ctx={{ now: new Date(), noteTitle: (id) => collections.notes.find((n) => n.id === id)?.title ?? null }}
              onCell={(f, v) => void setCell(info.row.id, f.id, v).catch(() => showToast("Impossibile salvare la cella"))}
              onDelete={() => {
                setRefRow(null);
                void trashRow(info.row.id).catch(() => showToast("Impossibile eliminare la riga"));
              }}
              onClose={() => setRefRow(null)}
              onOpenNote={(id) => {
                setRefRow(null);
                collections.onOpenNote(id);
              }}
              onNotice={showToast}
            />
          );
        })()}

      {toast && (
        <div className={`nq-toast${toastAction ? " nq-toast--action" : ""}`} role="status">
          {toast}
          {toastAction && (
            <button type="button" className="nq-toast-btn" onMouseDown={(e) => e.preventDefault()} onClick={toastAction.run}>
              {toastAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default NoteEditor;
