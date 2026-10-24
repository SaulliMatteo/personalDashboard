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
  MdFormatItalic,
  MdFormatListBulleted,
  MdFormatUnderlined,
  MdLink,
  MdOutlineBackspace,
  MdOutlineAttachFile,
  MdOutlineBorderColor,
  MdOutlineFileDownload,
  MdOutlineEdit,
  MdOutlineGesture,
  MdOutlineStarBorder,
  MdOutlineVerticalSplit,
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
import { MdFormatClear, MdFormatColorText, MdOutlineFormatColorFill } from "react-icons/md";
import NumberField from "../../../ui/NumberField";
import PageThumb from "./PageThumb";
import { PAGE_COLORS, TEXT_COLORS } from "../lib/pageColor";
import { applyFontSize, applyTextColor, clearFormatting, currentFontSizePx, normalizeUrl, toggleChecklist } from "../lib/editorDom";
// dal repository aggiungi anche: setPageColor
import { formatWhen, monthYear, wordCount } from "../lib/html";
import type { InkTool } from "./InkLayer";
import PageSurface from "./PageSurface";
import "./noteEditor.css";

interface NoteEditorProps {
  note: NoteSummary;
  /** "Lavoro / Progetto Atlante" (vuota se la nota non è in una cartella). */
  pathLabel: string;
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
}

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
  onChanged,
  onToggleStar,
  onTrash,
  attachVersion,
  onAttachPaths,
  onSplit,
  splitCandidates = [],
  compact = false,
  onClosePane,
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
  const [menu, setMenu] = useState<"export" | "split" | "color" | "pagecolor" | null>(null);
  const zoomRef = useLatestRef(zoom);
  const [lightExport, setLightExport] = useState(true);
  const [busy, setBusy] = useState(false);
  const [splitQuery, setSplitQuery] = useState("");
  

  // pagesRef rispecchia SEMPRE `pages` in modo sincrono: i salvataggi con
  // debounce e il flush allo smontaggio leggono da qui, mai da uno state vecchio.
  const pagesRef = useRef<NotePage[]>([]);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRange = useRef<Range | null>(null);
  const dirtyPages = useRef(new Set<number>());
  const titleDirty = useRef(false);
  const timer = useRef<number | null>(null);
  const redoInk = useRef(new Map<number, InkStroke[]>());
  const titleRef = useLatestRef(title);

  useEffect(() => {
    const onSelection = () => {
      const root = editorRef.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return;
      savedRange.current = range.cloneRange();
      const px = currentFontSizePx(root, zoomRef.current / 100);
      if (px) setFontSize(px);
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, [zoomRef]);

  // Cambiando pagina l'editor viene ricreato: la vecchia selezione non vale più.
  useEffect(() => {
    savedRange.current = null;
  }, [index]);

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

  function patchPage(id: number, patch: Partial<Pick<NotePage, "content" | "ink">>) {
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

  function exec(command: string, value?: string) {
    const el = editorRef.current;
    if (!el || mode !== "text") return;
    el.focus();
    document.execCommand(command, false, value);
    commitEditor();
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
  if (action(el)) commitEditor();
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
  if (!page) return;
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

  function handleUndo() {
    if (mode === "ink" && page) {
      if (page.ink.length === 0) return;
      const removed = page.ink[page.ink.length - 1];
      redoInk.current.set(page.id, [...(redoInk.current.get(page.id) ?? []), removed]);
      patchPage(page.id, { ink: page.ink.slice(0, -1) });
    } else {
      exec("undo");
    }
  }

  function handleRedo() {
    if (mode === "ink" && page) {
      const stack = redoInk.current.get(page.id) ?? [];
      const restored = stack[stack.length - 1];
      if (!restored) return;
      redoInk.current.set(page.id, stack.slice(0, -1));
      patchPage(page.id, { ink: [...page.ink, restored] });
    } else {
      exec("redo");
    }
  }

  function handleInk(strokes: InkStroke[]) {
    if (!page) return;
    // Un nuovo tratto (non una cancellazione) azzera la cronologia del "ripeti".
    if (strokes.length > page.ink.length) redoInk.current.delete(page.id);
    patchPage(page.id, { ink: strokes });
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
    if (!page) return;
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

  return (
    <div className={`nq-editor${compact ? " nq-editor--compact" : ""}`}>
      <header className="nq-editor-head">
        <div className="nq-editor-titleblock">
          <div className="nq-editor-titlerow">
            <input
              className="nq-title-input"
              value={title}
              placeholder="Senza titolo"
              maxLength={120}
              onChange={(e) => handleTitle(e.target.value)}
            />
            <button
              type="button"
              className={`nq-icon-btn nq-star${note.starred ? " is-on" : ""}`}
              onClick={onToggleStar}
              aria-label={note.starred ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
            >
              {note.starred ? <MdStar /> : <MdOutlineStarBorder />}
            </button>
          </div>
          <p className="nq-editor-meta">
            {pathLabel ? `${pathLabel} · ` : ""}Modificato {formatWhen(note.updatedAt).toLowerCase()}
          </p>
          <div className="nq-tag-row">
            {note.tags.map((tag) => (
              <span key={tag} className="nq-chip">
                {tag}
                <button type="button" onClick={() => void removeTag(tag)} aria-label={`Rimuovi tag ${tag}`}>
                  <MdClose />
                </button>
              </span>
            ))}
            <input
              className="nq-tag-input"
              value={tagDraft}
              placeholder="+ tag"
              maxLength={24}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={handleTagKey}
              onBlur={() => void addTag()}
            />
          </div>
        </div>

        <div className="nq-editor-actions">
          <span className="nq-save-status">{savedLabel}</span>

          {onSplit && (
            <div className="nq-menu-anchor">
              <button
                type="button"
                className="nq-btn"
                onClick={() => {
                  setSplitQuery("");
                  setMenu(menu === "split" ? null : "split");
                }}
              >
                <MdOutlineVerticalSplit /> Affianca
              </button>
              {menu === "split" && (
                <>
                  <div className="nq-menu-backdrop" onClick={() => setMenu(null)} />
                  <div className="nq-menu nq-menu--right nq-menu--list">
                    <input
                      autoFocus
                      className="nq-menu-search"
                      placeholder="Cerca una nota da affiancare…"
                      value={splitQuery}
                      onChange={(e) => setSplitQuery(e.target.value)}
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
            <button type="button" className="nq-btn" disabled={busy} onClick={() => setMenu(menu === "export" ? null : "export")}>
              <MdOutlineFileDownload /> {busy ? "Esporto…" : "Esporta"}
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

          <ConfirmButton className="nq-btn nq-btn--danger" label="Cestino" confirmLabel="Sicuro?" onConfirm={onTrash} />
          {onClosePane && (
            <button type="button" className="nq-icon-btn" onClick={onClosePane} aria-label="Chiudi riquadro">
              <MdClose />
            </button>
          )}
        </div>
      </header>

      {/* onMouseDown preventDefault: i pulsanti non rubano la selezione al testo. */}
      <div className="nq-toolbar" onMouseDown={(e) => { if (!(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLInputElement)) e.preventDefault(); }}>
        <button type="button" className="nq-tool" onClick={handleUndo} aria-label="Annulla"><MdUndo /></button>
        <button type="button" className="nq-tool" onClick={handleRedo} aria-label="Ripeti"><MdRedo /></button>
        <span className="nq-tool-sep" />
        <select
          className="nq-select"
          value={block}
          disabled={mode !== "text"}
          onChange={(e) => handleBlockChange(e.target.value)}
          aria-label="Stile del paragrafo"
        >
          <option value="p">Testo normale</option>
          <option value="h1">Titolo</option>
          <option value="h2">Sottotitolo</option>
        </select>
        <span className="nq-tool-sep" />
        <button type="button" className="nq-tool" disabled={mode !== "text"} onClick={() => exec("bold")} aria-label="Grassetto"><MdFormatBold /></button>
        <button type="button" className="nq-tool" disabled={mode !== "text"} onClick={() => exec("italic")} aria-label="Corsivo"><MdFormatItalic /></button>
        <button type="button" className="nq-tool" disabled={mode !== "text"} onClick={() => exec("underline")} aria-label="Sottolineato"><MdFormatUnderlined /></button>
        <button type="button" className="nq-tool" disabled={mode !== "text"} onClick={() => exec("insertUnorderedList")} aria-label="Elenco puntato"><MdFormatListBulleted /></button>
        <button type="button" className="nq-tool" disabled={mode !== "text"} onClick={handleChecklist} aria-label="Checklist"><MdChecklist /></button>
        <button type="button" className="nq-tool" disabled={mode !== "text"} onClick={openLink} aria-label="Link"><MdLink /></button>
        <span className="nq-tool-sep" />
          <button type="button" className="nq-tool nq-tool--wide" disabled={mode !== "text"} onClick={() => handleFontSize(fontSize - 1)} aria-label="Riduci il testo">A−</button>
          <NumberField className="nq-size-input" value={fontSize} min={8} max={200} disabled={mode !== "text"} onCommit={handleFontSize} aria-label="Dimensione del testo in pixel" title="Dimensione del testo (px)" />
          <button type="button" className="nq-tool nq-tool--wide" disabled={mode !== "text"} onClick={() => handleFontSize(fontSize + 1)} aria-label="Ingrandisci il testo">A+</button>

          <div className="nq-menu-anchor">
            <button type="button" className="nq-tool" disabled={mode !== "text"} onClick={() => setMenu(menu === "color" ? null : "color")} aria-label="Colore del testo" title="Colore del testo">
              <MdFormatColorText style={{ color: textColor }} />
            </button>
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
<button type="button" className="nq-tool" disabled={mode !== "text"} onClick={() => withSelection(clearFormatting)} aria-label="Cancella la formattazione" title="Cancella la formattazione"><MdFormatClear /></button>
        {linkOpen && (
          <span className="nq-link-pop">
            <input
              autoFocus
              value={linkUrl}
              placeholder="https://…"
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyLink();
                if (e.key === "Escape") setLinkOpen(false);
              }}
            />
            <button type="button" className="nq-tool" onClick={applyLink} aria-label="Applica link"><MdAdd /></button>
          </span>
        )}
        <span className="nq-tool-sep" />
        <button type="button" className="nq-tool nq-tool--wide" onClick={() => void pickFiles()}>
          <MdOutlineAttachFile /> Allega file
        </button>
        <button
          type="button"
          className={`nq-tool nq-tool--wide${mode === "ink" ? " is-on" : ""}`}
          onClick={() => setMode(mode === "ink" ? "text" : "ink")}
        >
          <MdOutlineGesture /> Scrittura a mano
        </button>
        <select
          className="nq-select nq-select--end"
          value={page.background}
          onChange={(e) => void changeBackground(e.target.value as PageBackground)}
          aria-label="Sfondo della pagina"
        >
          {BACKGROUND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="nq-menu-anchor">
  <button type="button" className="nq-tool nq-tool--wide" onClick={() => setMenu(menu === "pagecolor" ? null : "pagecolor")} title="Colore della pagina">
    <MdOutlineFormatColorFill style={{ color: page.color ?? undefined }} /> Colore pagina
  </button>
  {menu === "pagecolor" && (
    <>
      <div className="nq-menu-backdrop" onClick={() => setMenu(null)} />
      <div className="nq-menu nq-menu--right nq-menu--swatches">
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
      </div>

      {attachments.length > 0 && (
        <div className="nq-attachments">
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

      <div className="nq-editor-body">
        <aside className="nq-pages" hidden={compact}>
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
                  aria-label={`Pagina ${i + 1}`}
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
                    <button type="button" disabled={i === 0} onClick={() => void movePage(i, i - 1)} aria-label="Sposta su"><MdArrowUpward /></button>
                    <button type="button" disabled={i === pages.length - 1} onClick={() => void movePage(i, i + 1)} aria-label="Sposta giù"><MdArrowDownward /></button>
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
          <p className="nq-pages-hint">Usa le frecce per cambiare l'ordine delle pagine.</p>
        </aside>

        <div className="nq-canvas-area">
          {mode === "ink" && (
            <div className="nq-ink-bar">
              <button type="button" className={`nq-tool nq-tool--wide${tool === "pen" ? " is-on" : ""}`} onClick={() => setTool("pen")}><MdOutlineEdit /> Penna</button>
              <button type="button" className={`nq-tool nq-tool--wide${tool === "highlighter" ? " is-on" : ""}`} onClick={() => setTool("highlighter")}><MdOutlineBorderColor /> Evidenziatore</button>
              <button type="button" className={`nq-tool nq-tool--wide${tool === "eraser" ? " is-on" : ""}`} onClick={() => setTool("eraser")}><MdOutlineBackspace /> Gomma</button>
              <span className="nq-tool-sep" />
              {INK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`nq-ink-dot${c === color ? " is-on" : ""}`}
                  style={{ background: c === THEME_INK ? "var(--text-primary)" : c }}
                  onClick={() => setColor(c)}
                  aria-label={c === THEME_INK ? "Inchiostro del tema" : `Colore ${c}`}
                />
              ))}
              <label className={`nq-ink-dot nq-ink-custom${INK_COLORS.includes(color) ? "" : " is-on"}`} title="Colore personalizzato" style={INK_COLORS.includes(color) ? undefined : { background: color }}>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Colore personalizzato" />
              </label>
              <select className="nq-select" value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Spessore">
                {INK_SIZES.map((s) => (
                  <option key={s} value={s}>{s} px</option>
                ))}
              </select>
            </div>
          )}

          <div className="nq-scroll">
            <PageSurface
              key={page.id}
              page={page}
              pageNumber={index + 1}
              zoom={zoom}
              background={page.background}
              mode={mode}
              tool={tool}
              color={color}
              size={size}
              kicker={kicker}
              dateLabel={monthYear(note.createdAt)}
              footerLabel={`${kicker} · ${title || "Senza titolo"}`}
              editorRef={editorRef}
              onContent={(html) => patchPage(page.id, { content: html })}
              onInk={handleInk}
            />
          </div>

          <footer className="nq-statusbar">
            <span className="nq-pager">
              <button type="button" className="nq-icon-btn" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Pagina precedente"><MdChevronLeft /></button>
              Pagina {index + 1} di {pages.length}
              <button type="button" className="nq-icon-btn" disabled={index >= pages.length - 1} onClick={() => setIndex(index + 1)} aria-label="Pagina successiva"><MdChevronRight /></button>
            </span>
            <span className="nq-pager">
              {wordCount(page.content)} parole · Italiano
              {compact && (
                <button type="button" className="nq-icon-btn" onClick={() => void handleAddPage()} aria-label="Aggiungi pagina" title="Aggiungi pagina">
                  <MdAdd />
                </button>
              )}
            </span>
            <span className="nq-pager">
              <button type="button" className="nq-icon-btn" disabled={zoom <= 60} onClick={() => setZoom(zoom - 10)} aria-label="Riduci zoom"><MdRemove /></button>
              {zoom}%
              <button type="button" className="nq-icon-btn" disabled={zoom >= 160} onClick={() => setZoom(zoom + 10)} aria-label="Aumenta zoom"><MdAdd /></button>
            </span>
          </footer>
        </div>
      </div>

      {toast && <div className="nq-toast">{toast}</div>}
    </div>
  );
}

export default NoteEditor;
