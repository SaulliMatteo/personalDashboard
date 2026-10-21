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
  MdOutlineBorderColor,
  MdOutlineContentCopy,
  MdOutlineEdit,
  MdOutlineGesture,
  MdOutlineStarBorder,
  MdRedo,
  MdRemove,
  MdStar,
  MdUndo,
} from "react-icons/md";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import ConfirmButton from "../../../ui/ConfirmButton";
import {
  addPage,
  deletePage,
  getPages,
  reorderPages,
  savePage,
  updateNote,
  type InkStroke,
  type NotePage,
  type NoteSummary,
} from "../data/notesRepository";
import { normalizeUrl, toggleChecklist } from "../lib/editorDom";
import { formatWhen, htmlToMarkdown, htmlToText, monthYear, wordCount } from "../lib/html";
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
}

const INK_SIZES = [1, 2, 3, 5, 8];
const INK_COLORS = ["#6c8dff", "#f472b6", "#34d399", "#fbbf24", "#f2f2f4"];

function NoteEditor({ note, pathLabel, onChanged, onToggleStar, onTrash }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [pages, setPages] = useState<NotePage[]>([]);
  const [ready, setReady] = useState(false);
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
    let cancelled = false;
    getPages(note.id)
      .then((loaded) => {
        if (cancelled) return;
        pagesRef.current = loaded;
        setPages(loaded);
        setReady(true);
      })
      .catch((error) => console.error("Errore nel caricamento delle pagine:", error));
    return () => {
      cancelled = true;
    };
  }, [note.id]);

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
    window.setTimeout(() => setToast(null), 2200);
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
    await updateNote(note.id, { tags: [...note.tags, tag] });
    onChanged();
  }

  async function removeTag(tag: string) {
    await updateNote(note.id, { tags: note.tags.filter((t) => t !== tag) });
    onChanged();
  }

  function handleTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void addTag();
  }

  // ---------------- Pagine ----------------

  async function handleAddPage() {
    await flush();
    const created = await addPage(note.id);
    const next = [...pagesRef.current, created];
    pagesRef.current = next;
    setPages(next);
    setIndex(next.length - 1);
    setMode("text");
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
    await reorderPages(reordered.map((p) => p.id));
  }

  async function removePage(id: number) {
    if (pagesRef.current.length <= 1) return;
    dirtyPages.current.delete(id);
    await deletePage(id);
    const next = pagesRef.current.filter((p) => p.id !== id);
    pagesRef.current = next;
    setPages(next);
    setIndex((i) => Math.min(i, next.length - 1));
    onChanged();
  }

  async function exportMarkdown() {
    await flush();
    const body = pagesRef.current.map((p) => htmlToMarkdown(p.content)).join("\n\n---\n\n");
    try {
      await navigator.clipboard.writeText(`# ${title || "Senza titolo"}\n\n${body}`);
      showToast("Markdown copiato negli appunti");
    } catch {
      showToast("Impossibile copiare negli appunti");
    }
  }

  if (!ready || !page) return <p className="nq-loading">Caricamento…</p>;

  const savedLabel = saving
    ? "Salvataggio…"
    : `Salvato automaticamente · ${new Date(savedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;

  const kicker = pathLabel || "Senza cartella";

  return (
    <div className="nq-editor">
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
          <button type="button" className="nq-btn" onClick={() => void exportMarkdown()}>
            <MdOutlineContentCopy /> Copia Markdown
          </button>
          <ConfirmButton className="nq-btn nq-btn--danger" label="Cestino" confirmLabel="Sicuro?" onConfirm={onTrash} />
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
        <button
          type="button"
          className={`nq-tool nq-tool--wide${mode === "ink" ? " is-on" : ""}`}
          onClick={() => setMode(mode === "ink" ? "text" : "ink")}
        >
          <MdOutlineGesture /> Scrittura a mano
        </button>
      </div>

      <div className="nq-editor-body">
        <aside className="nq-pages">
          <div className="nq-pages-head">
            <span>Pagine</span>
            <span>{pages.length}</span>
          </div>
          <div className="nq-pages-list">
            {pages.map((p, i) => (
              <div key={p.id} className={`nq-thumb-wrap${i === index ? " is-active" : ""}`}>
                <button type="button" className="nq-thumb" onClick={() => setIndex(i)}>
                  <span className="nq-thumb-kicker">{kicker}</span>
                  <span className="nq-thumb-text">{htmlToText(p.content).slice(0, 110) || "Pagina vuota"}</span>
                  {p.ink.length > 0 && <MdOutlineGesture className="nq-thumb-ink" />}
                </button>
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
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Colore ${c}`}
                />
              ))}
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
            <span>{wordCount(page.content)} parole · Italiano</span>
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
