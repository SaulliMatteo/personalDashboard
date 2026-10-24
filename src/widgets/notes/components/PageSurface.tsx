import { useLayoutEffect, useRef, type CSSProperties, type ClipboardEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import type { InkStroke, NotePage, PageBackground } from "../data/notesRepository";
import { currentBlock } from "../lib/editorDom";
import { sanitizeHtml } from "../lib/html";
import InkLayer, { type InkTool } from "./InkLayer";
import { paperStyle } from "../lib/pageColor";

interface PageSurfaceProps {
  page: NotePage;
  zoom: number;
  background: PageBackground;
  mode: "text" | "ink";
  tool: InkTool;
  color: string;
  size: number;
  /** In cima alla pagina, fuori dal testo modificabile (titolo e proprietà della nota sulla prima pagina). */
  header?: ReactNode;
  editorRef: RefObject<HTMLDivElement | null>;
  onContent: (html: string) => void;
  onInk: (strokes: InkStroke[]) => void;
}

/**
 * Una pagina "di carta". Il testo è un contentEditable NON controllato da
 * React: l'HTML iniziale viene scritto una volta sola quando cambia pagina
 * (React non deve mai riscrivere il contenuto mentre si digita).
 */
function PageSurface(props: PageSurfaceProps) {
  const { page, editorRef, onContent } = props;
  const headRef = useRef<HTMLDivElement | null>(null);

  // I tratti a mano sono salvati rispetto alla pagina com'era prima del titolo nella pagina (testata
  // alta 2.82em): l'inchiostro parte quindi da (altezza della testata − 2.82em), così resta sopra le
  // parole giuste anche quando il titolo va a capo. La misura va sulla pagina come variabile CSS.
  useLayoutEffect(() => {
    const head = headRef.current;
    const paper = head?.parentElement;
    if (!head || !paper) return;
    const update = () => paper.style.setProperty("--nq-head-h", `${head.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(head);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = sanitizeHtml(page.content) || "<p><br></p>";
    // Invio crea un <p> (e non un <div>): le checklist e i titoli restano coerenti.
    document.execCommand("defaultParagraphSeparator", false, "p");
    // Solo al cambio di pagina: page.content cambia a ogni tasto e NON deve rientrare qui.
  }, [page.id, editorRef]);

  function emit() {
    if (editorRef.current) onContent(editorRef.current.innerHTML);
  }

  // Incolla sempre testo semplice: niente HTML esterno dentro le note.
  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  }

  // Click sul "cerchietto" di una voce di checklist = la spunta/toglie.
  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const root = editorRef.current;
    const block = (e.target as HTMLElement).closest("[data-check]");
    if (!root || !block || !root.contains(block)) return;
    const fontSize = parseFloat(getComputedStyle(block).fontSize) || 15;
    if (e.clientX - block.getBoundingClientRect().left > fontSize * 1.7) return;
    block.setAttribute("data-check", block.getAttribute("data-check") === "1" ? "0" : "1");
    emit();
  }

  // Invio dentro una checklist: la nuova riga parte sempre da "non spuntata".
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    window.setTimeout(() => {
      const block = currentBlock(editorRef.current);
      if (block?.hasAttribute("data-check")) block.setAttribute("data-check", "0");
    }, 0);
  }

  return (
    <div className="nq-paper-wrap">
      <div
        className="nq-paper"
        data-bg={props.background}
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
          onInput={emit}
          onPaste={handlePaste}
          onDrop={(e) => e.preventDefault()}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
        />

        <InkLayer
          strokes={page.ink}
          active={props.mode === "ink"}
          tool={props.tool}
          color={props.color}
          size={props.size}
          onChange={props.onInk}
        />
      </div>
    </div>
  );
}

export default PageSurface;
