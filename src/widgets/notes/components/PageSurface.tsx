import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { InkStroke, NotePage, PageBackground } from "../data/notesRepository";
import { BLOCK_SELECTOR, createCodeBlock, hydrateBlocks, serializeEditor, type BlockKind } from "../lib/blocks";
import { parseFence } from "../lib/codeLanguages";
import { currentBlock, topBlock } from "../lib/editorDom";
import { sanitizeHtml } from "../lib/html";
import { paperAttrs, paperStyle } from "../lib/pageColor";
import { caretCell, layoutTables, moveToCell } from "../lib/tableDom";
import { exitEmptyCheck, indentSelection, outdentAtCaretStart } from "../lib/indent";
import { getCollectionsState, rowInfo, subscribeCollections } from "../lib/collectionsStore";
import { rowTitle } from "../lib/collections";
import CollectionView, { type CollectionLinks } from "../collections/CollectionView";
import type { NoteFont } from "../lib/textStyle";
import CodeBlock from "./CodeBlock";
import FileCard from "./FileCard";
import ImageBlock from "./ImageBlock";
import InkLayer, { type InkTool } from "./InkLayer";
import TableTools from "./TableTools";

interface PageSurfaceProps {
  page: NotePage;
  zoom: number;
  background: PageBackground;
  mode: "text" | "ink";
  tool: InkTool;
  color: string;
  size: number;
  /** Forme automatiche della penna (tenere premuto a fine tratto). */
  shapes: boolean;
  /** In cima alla pagina, fuori dal testo modificabile (titolo e proprietà della nota sulla prima pagina). */
  header?: ReactNode;
  /** Font predefinito della nota (null = quello del tema). */
  noteFont?: NoteFont | null;
  /** Cartella della nota su disco (immagini e file dei blocchi). */
  noteDir: string | null;
  editorRef: RefObject<HTMLDivElement | null>;
  onContent: (html: string) => void;
  onInk: (strokes: InkStroke[]) => void;
  /** Un blocco (immagine, file) è cambiato: si salva come una modifica sola, non come digitazione. */
  onBlockChange: () => void;
  /** Incolla: true = gestito da chi chiama (file, HTML); altrimenti si incolla testo semplice. */
  onPaste?: (e: ClipboardEvent<HTMLDivElement>) => boolean;
  onNotice?: (message: string) => void;
  /** Tasti dentro il testo prima della pagina (menu "/" aperto): true = gestito. */
  onEditorKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => boolean;
  /** Dopo ogni modifica del testo (serve al menu "/"). */
  onAfterInput?: () => void;
  /** Annulla/ripeti chiesti dal browser (menu contestuale): si usa la cronologia della nota. */
  onHistory?: (direction: "undo" | "redo") => void;
  /** Note e navigazione per le viste collegate delle raccolte. */
  collections: CollectionLinks;
  /** Clic su un riferimento a una riga (@). */
  onRefClick?: (rowId: number) => void;
}

/** Testo dei riferimenti @ allineato ai dati della raccolta (e segno sulle righe eliminate). */
function refreshRefs(root: HTMLElement) {
  const s = getCollectionsState();
  if (!s.loaded) return;
  const ctx = { now: new Date(), noteTitle: () => null };
  root.querySelectorAll<HTMLElement>("[data-ref-row]").forEach((el) => {
    const info = rowInfo(s, Number(el.dataset.refRow));
    const gone = !info || info.row.deletedAt !== null || info.collection.deletedAt !== null;
    el.toggleAttribute("data-missing", gone);
    const title = info ? rowTitle(info.fields, info.row, ctx) : "Riga eliminata";
    if (el.textContent !== title) el.textContent = title;
    el.title = info ? `${info.collection.name}${gone ? " (eliminata)" : ""}` : "Riga eliminata";
  });
}

interface BlockEntry {
  id: number;
  el: HTMLElement;
  host: HTMLElement;
  kind: BlockKind;
}

/** Una riga di testo vuota senza niente dentro (<p></p>): alta zero, il cursore non ci entra. */
function isHollow(el: Element): boolean {
  return /^(P|DIV|H1|H2|H3)$/.test(el.tagName) && !el.hasAttribute("data-block") && el.childNodes.length === 0;
}

/**
 * Mette il cursore all'inizio della riga dopo `el`. Se dopo non c'è una riga di testo (niente,
 * un altro blocco, un elenco, una tabella, una linea) ne crea una in mezzo; a una riga vuota
 * senza <br> lo aggiunge, altrimenti il browser rimanderebbe il cursore sopra il blocco.
 */
function caretAfter(el: HTMLElement) {
  let next = el.nextElementSibling as HTMLElement | null;
  const textLine = next && /^(P|DIV|H1|H2|H3)$/.test(next.tagName) && !next.matches(BLOCK_SELECTOR);
  if (!next || !textLine) {
    const p = document.createElement("p");
    p.appendChild(document.createElement("br"));
    el.after(p);
    next = p;
  } else if (isHollow(next)) {
    next.appendChild(document.createElement("br"));
  }
  const range = document.createRange();
  range.setStart(next, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  next.closest<HTMLElement>("[contenteditable='true']")?.focus();
}

/**
 * Una pagina "di carta". Il testo è un contentEditable NON controllato da
 * React: l'HTML iniziale viene scritto una volta sola quando cambia pagina
 * (React non deve mai riscrivere il contenuto mentre si digita).
 * I blocchi immagine/file sono nell'HTML; React li disegna con dei portal nei loro nodi di
 * servizio, che un MutationObserver ritrova anche dopo annulla, incolla o spostamenti.
 * Le tabelle sono HTML normale modificabile; i loro comandi (TableTools) stanno sopra il testo.
 */
function PageSurface(props: PageSurfaceProps) {
  const { page, editorRef, onContent, onBlockChange } = props;
  const headRef = useRef<HTMLDivElement | null>(null);
  /** La pagina come stato (non ref): i comandi delle tabelle si posizionano dentro di lei. */
  const [paper, setPaper] = useState<HTMLDivElement | null>(null);
  const [blocks, setBlocks] = useState<BlockEntry[]>([]);
  const [selectedState, setSelected] = useState<HTMLElement | null>(null);
  const ids = useRef(new WeakMap<HTMLElement, number>());
  const nextId = useRef(1);
  // Il blocco selezionato vale solo finché è ancora nella pagina.
  const selected = selectedState && blocks.some((b) => b.el === selectedState) ? selectedState : null;

  // I tratti a mano sono salvati rispetto alla pagina com'era prima del titolo nella pagina (testata
  // alta 2.82em): l'inchiostro parte quindi da (altezza della testata − 2.82em), così resta sopra le
  // parole giuste anche quando il titolo va a capo. La misura va sulla pagina come variabile CSS.
  useLayoutEffect(() => {
    const head = headRef.current;
    const paper = head?.parentElement;
    if (!head || !paper) return;
    // Anche la larghezza della pagina: le immagini libere sono posizionate in frazioni di essa.
    const update = () => {
      paper.style.setProperty("--nq-head-h", `${head.offsetHeight}px`);
      paper.style.setProperty("--nq-paper-w", `${paper.clientWidth}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(head);
    observer.observe(paper);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // Prima l'osservatore, poi l'HTML: così anche i blocchi della pagina appena aperta vengono trovati.
    const scan = () => {
      // Dopo l'ultimo blocco (codice, immagine, file, vista) o tabella serve sempre una riga di testo:
      // senza, sotto non si può mettere il cursore (es. Backspace sulla riga vuota sotto il blocco).
      // Righe vuote senza niente dentro (<p></p>, salvate così da note vecchie): ricevono il loro
      // <br>, così hanno altezza e il cursore ci può entrare.
      for (const child of Array.from(el.children)) {
        if (isHollow(child)) child.appendChild(document.createElement("br"));
      }
      const last = el.lastElementChild;
      if (last && (last.matches(BLOCK_SELECTOR) || last.tagName === "TABLE")) {
        const p = document.createElement("p");
        p.appendChild(document.createElement("br"));
        el.appendChild(p); // l'osservatore richiama scan, che adesso trova la riga e si ferma
      }
      // Le larghezze delle colonne (colgroup) si rifanno da data-width: dopo annulla, incolla…
      layoutTables(el);
      refreshRefs(el);
      const found = hydrateBlocks(el).map((b) => {
        let id = ids.current.get(b.el);
        if (id === undefined) {
          id = nextId.current++;
          ids.current.set(b.el, id);
        }
        return { ...b, id };
      });
      setBlocks((prev) =>
        prev.length === found.length && prev.every((b, i) => b.el === found[i].el && b.host === found[i].host) ? prev : found
      );
    };
    const observer = new MutationObserver(scan);
    observer.observe(el, { childList: true });
    el.innerHTML = sanitizeHtml(page.content) || "<p><br></p>";
    // Invio crea un <p> (e non un <div>): le checklist e i titoli restano coerenti.
    document.execCommand("defaultParagraphSeparator", false, "p");
    return () => observer.disconnect();
    // Solo al cambio di pagina: page.content cambia a ogni tasto e NON deve rientrare qui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id, editorRef]);

  // I riferimenti @ seguono la raccolta: titolo cambiato, riga eliminata o ripristinata.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    return subscribeCollections(() => refreshRefs(el));
  }, [editorRef]);

  // Il blocco selezionato ha data-selected (forma per tema nel CSS); il resto no.
  useEffect(() => {
    for (const b of blocks) b.el.toggleAttribute("data-selected", b.el === selected);
  }, [blocks, selected]);

  // Click fuori dal blocco selezionato: si deseleziona.
  useEffect(() => {
    if (!selected) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !selected.contains(e.target)) setSelected(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [selected]);

  // L'annulla del browser conosce solo il testo: lo sostituisce la cronologia della nota (lib/history.ts).
  const historyRef = useRef(props.onHistory);
  useLayoutEffect(() => {
    historyRef.current = props.onHistory;
  });
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const onBeforeInput = (e: InputEvent) => {
      // Solo il testo della nota: i campi dentro una vista collegata hanno il loro annulla.
      if (e.target !== el) return;
      if (e.inputType !== "historyUndo" && e.inputType !== "historyRedo") return;
      e.preventDefault();
      historyRef.current?.(e.inputType === "historyUndo" ? "undo" : "redo");
    };
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  }, [editorRef]);

  function emit() {
    if (editorRef.current) onContent(serializeEditor(editorRef.current));
  }

  function selectBlock(el: HTMLElement) {
    setSelected(el);
    if (document.activeElement !== el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }

  function removeBlock(el: HTMLElement) {
    const root = editorRef.current;
    if (!root) return;
    const next = el.nextElementSibling as HTMLElement | null;
    const prev = el.previousElementSibling as HTMLElement | null;
    el.remove();
    if (!root.firstElementChild) root.innerHTML = "<p><br></p>";
    setSelected(null);
    const target = next ?? prev ?? (root.firstElementChild as HTMLElement | null);
    if (target && !target.matches(BLOCK_SELECTOR)) {
      const range = document.createRange();
      range.setStart(target, 0);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      root.focus();
    } else target?.focus();
    onBlockChange();
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    if (props.onPaste?.(e)) return;
    // Se nessuno lo gestisce si incolla testo semplice.
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  }

  // Click sul "cerchietto" di una voce di checklist = la spunta/toglie.
  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const root = editorRef.current;
    const ref = (e.target as HTMLElement).closest<HTMLElement>("[data-ref-row]");
    if (root && ref && root.contains(ref)) {
      props.onRefClick?.(Number(ref.dataset.refRow));
      return;
    }
    const block = (e.target as HTMLElement).closest("[data-check]");
    if (!root || !block || !root.contains(block)) return;
    const fontSize = parseFloat(getComputedStyle(block).fontSize) || 15;
    if (e.clientX - block.getBoundingClientRect().left > fontSize * 1.7) return;
    block.setAttribute("data-check", block.getAttribute("data-check") === "1" ? "0" : "1");
    emit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (props.onEditorKeyDown?.(e)) {
      e.preventDefault();
      return;
    }
    const target = e.target as HTMLElement;
    // Tasti su un blocco con il focus (immagine o file).
    if (target.parentElement === editorRef.current && target.matches(BLOCK_SELECTOR) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeBlock(target);
      } else if (e.key === "Enter") {
        e.preventDefault();
        setSelected(null);
        caretAfter(target);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSelected(null);
        target.blur();
      } else if (e.key === "Tab") {
        e.preventDefault(); // il focus resta nella pagina
      }
      return;
    }
    // Tabelle: Tab / Shift+Tab tra le celle (Tab nell'ultima aggiunge una riga), Invio = a capo nella cella.
    const cell = caretCell(editorRef.current);
    if (cell && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === "Tab") {
        e.preventDefault();
        if (moveToCell(cell, e.shiftKey ? -1 : 1) === "riga") onBlockChange();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        document.execCommand("insertLineBreak");
        return;
      }
    }
    // Tab / Shift+Tab nel testo: rientro di paragrafi, checklist e liste (lib/indent.ts), mai fuori
    // dall'editor. Solo nel testo della pagina: i campi dei blocchi (es. didascalie) hanno i loro tasti.
    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey && target === editorRef.current) {
      e.preventDefault();
      if (indentSelection(editorRef.current, e.shiftKey ? -1 : 1)) onBlockChange();
      return;
    }
    const plainKey = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && target === editorRef.current;
    // Backspace all'inizio di una riga rientrata: toglie un livello (non la unisce alla riga sopra).
    if (plainKey && e.key === "Backspace" && editorRef.current && outdentAtCaretStart(editorRef.current)) {
      e.preventDefault();
      onBlockChange();
      return;
    }
    // Invio su una riga "```py" (o solo "```"): la riga diventa un blocco di codice.
    if (plainKey && e.key === "Enter" && editorRef.current) {
      const line = topBlock(editorRef.current);
      const lang = line && /^(P|DIV)$/.test(line.tagName) && !line.hasAttribute("data-block") ? parseFence(line.textContent ?? "") : null;
      if (line && lang) {
        e.preventDefault();
        const pre = createCodeBlock(lang, "", true);
        line.replaceWith(pre);
        const next = pre.nextElementSibling;
        if (!next || next.matches(BLOCK_SELECTOR) || next.tagName === "TABLE") {
          const p = document.createElement("p");
          p.appendChild(document.createElement("br"));
          pre.after(p);
        }
        onBlockChange();
        return;
      }
    }
    // Invio su una riga di checklist vuota: si esce dalla checklist.
    if (plainKey && e.key === "Enter" && editorRef.current && exitEmptyCheck(editorRef.current)) {
      e.preventDefault();
      onBlockChange();
      return;
    }
    // Invio nella didascalia: la didascalia è una riga sola, si va al testo sotto l'immagine.
    const caption = target.closest?.("figcaption");
    if (caption && e.key === "Enter") {
      e.preventDefault();
      const figure = caption.closest<HTMLElement>("figure");
      if (figure) caretAfter(figure);
      return;
    }
    // Invio dentro una checklist: la nuova riga parte sempre da "non spuntata".
    // Ctrl+Invio spunta la riga (scorciatoia): non è un a capo.
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    window.setTimeout(() => {
      const block = currentBlock(editorRef.current);
      if (block?.hasAttribute("data-check")) block.setAttribute("data-check", "0");
    }, 0);
  }

  return (
    <div className="nq-paper-wrap">
      <div
        ref={setPaper}
        className="nq-paper"
        data-bg={props.background}
        data-note-font={props.noteFont ?? undefined}
        {...paperAttrs(page.color)}
        style={{ "--nq-zoom": props.zoom / 100, ...paperStyle(page.color) } as CSSProperties}
      >
        <div ref={headRef} className="nq-page-head">
          {props.header}
        </div>

        <div
          ref={editorRef}
          className="nq-doc nq-doc--editor"
          contentEditable={props.mode === "text"}
          suppressContentEditableWarning
          spellCheck
          onInput={() => {
            emit();
            props.onAfterInput?.();
          }}
          onPaste={handlePaste}
          onDrop={(e) => e.preventDefault()}
          // I blocchi si spostano col loro trascinamento (ImageBlock), mai con quello nativo del browser.
          onDragStart={(e) => {
            if (e.target instanceof Element && e.target.closest("[data-block]")) e.preventDefault();
          }}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onFocus={(e) => {
            const t = e.target as HTMLElement;
            if (t.parentElement === editorRef.current && t.matches(BLOCK_SELECTOR)) setSelected(t);
          }}
        />

        <InkLayer
          strokes={page.ink}
          active={props.mode === "ink"}
          tool={props.tool}
          color={props.color}
          size={props.size}
          shapes={props.shapes}
          onChange={props.onInk}
        />

        {paper && props.mode === "text" && (
          <TableTools paper={paper} editorRef={editorRef} onChange={onBlockChange} onNotice={(message) => props.onNotice?.(message)} />
        )}
      </div>

      {blocks.map((b) =>
        createPortal(
          b.kind === "view" ? (
            <CollectionView
              viewId={Number(b.el.dataset.view)}
              {...props.collections}
              onNotice={(message) => props.onNotice?.(message)}
              onRemove={() => removeBlock(b.el)}
            />
          ) : b.kind === "code" ? (
            <CodeBlock block={b.el} onCommit={onBlockChange} onRemove={() => removeBlock(b.el)} onExit={() => caretAfter(b.el)} />
          ) : b.kind === "image" ? (
            <ImageBlock
              figure={b.el}
              noteDir={props.noteDir}
              selected={b.el === selected}
              onSelect={() => selectBlock(b.el)}
              onCommit={onBlockChange}
              onDelete={() => removeBlock(b.el)}
              ink={{ tool: props.tool, color: props.color, size: props.size, shapes: props.shapes }}
            />
          ) : (
            <FileCard
              block={b.el}
              noteDir={props.noteDir}
              selected={b.el === selected}
              onSelect={() => selectBlock(b.el)}
              onDelete={() => removeBlock(b.el)}
              onError={(message) => props.onNotice?.(message)}
            />
          ),
          b.host,
          String(b.id)
        )
      )}
    </div>
  );
}

export default PageSurface;
