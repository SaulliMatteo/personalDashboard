import { useLayoutEffect, type CSSProperties, type ClipboardEvent, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import type { InkStroke, NotePage, PageBackground } from "../data/notesRepository";
import { currentBlock } from "../lib/editorDom";
import { sanitizeHtml } from "../lib/html";
import InkLayer, { type InkTool } from "./InkLayer";
import { paperStyle } from "../lib/pageColor";

interface PageSurfaceProps {
  page: NotePage;
  pageNumber: number;
  zoom: number;
  background: PageBackground;
  mode: "text" | "ink";
  tool: InkTool;
  color: string;
  size: number;
  kicker: string;
  dateLabel: string;
  footerLabel: string;
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
        <div className="nq-paper-head">
          <span>{props.kicker}</span>
          <span>{props.dateLabel}</span>
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

        <div className="nq-paper-foot">
          <span>{props.footerLabel}</span>
          <span>{String(props.pageNumber).padStart(2, "0")}</span>
        </div>

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
