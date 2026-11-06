import { useEffect, useMemo, useRef, useState } from "react";
import { MdClose, MdKeyboardArrowDown, MdKeyboardArrowUp } from "react-icons/md";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { FIND_ALL, FIND_CURRENT, clearHighlights, countIn, highlightsSupported, rangesIn } from "../../lib/findHighlight";
import "../FindBar.css";

interface PdfFindProps {
  doc: PDFDocumentProxy;
  /** Numeri delle pagine del PDF mostrate dal blocco. */
  pages: number[];
  /** Il blocco: dentro ci sono i livelli di testo delle pagine disegnate. */
  container: HTMLElement | null;
  /** Cambia quando una pagina finisce di disegnare il suo testo (si rifanno le evidenziazioni). */
  textVersion: number;
  onGoToPage: (pageNumber: number) => void;
  onClose: () => void;
}

/**
 * Ctrl+F nel PDF: il testo di ogni pagina si estrae una volta (anche delle pagine non disegnate) e
 * si tiene in memoria; si evidenziano i risultati nelle pagine disegnate, come FindBar nelle note.
 */
function PdfFind({ doc, pages, container, textVersion, onGoToPage, onClose }: PdfFindProps) {
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const [texts, setTexts] = useState<Map<number, string>>(new Map());
  /** Testi già estratti (restano anche cambiando la ricerca). */
  const cache = useRef(new Map<number, string>());
  const inputRef = useRef<HTMLInputElement | null>(null);
  const needle = query.trim().toLowerCase();
  const wanted = needle.length > 0;

  useEffect(() => {
    inputRef.current?.focus();
    return clearHighlights;
  }, []);

  // Testo delle pagine, a gruppi (un PDF lungo non blocca la finestra).
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    void (async () => {
      const store = cache.current;
      let fresh = 0;
      for (const n of pages) {
        if (cancelled) return;
        if (store.has(n)) continue;
        try {
          const page = await doc.getPage(n);
          const content = await page.getTextContent();
          store.set(n, content.items.map((item) => ("str" in item ? item.str : "")).join("").toLowerCase());
        } catch {
          store.set(n, "");
        }
        if (++fresh % 20 === 0 && !cancelled) setTexts(new Map(store));
      }
      if (!cancelled) setTexts(new Map(store));
    })();
    return () => {
      cancelled = true;
    };
  }, [wanted, doc, pages]);

  const perPage = useMemo(() => pages.map((n) => countIn(texts.get(n) ?? "", needle)), [pages, texts, needle]);
  const total = perPage.reduce((a, b) => a + b, 0);
  const safeCurrent = total === 0 ? 0 : Math.min(current, total - 1);
  let target = { page: -1, local: 0 };
  for (let i = 0, seen = 0; i < perPage.length; seen += perPage[i], i++) {
    if (safeCurrent < seen + perPage[i]) {
      target = { page: pages[i], local: safeCurrent - seen };
      break;
    }
  }

  useEffect(() => {
    if (target.page > 0) onGoToPage(target.page);
  }, [target.page, target.local, onGoToPage]);

  // Evidenziazioni nelle pagine disegnate.
  useEffect(() => {
    if (!container || !highlightsSupported()) return;
    const all: Range[] = [];
    let mine: Range | undefined;
    if (needle) {
      container.querySelectorAll<HTMLElement>("[data-pdf-page]").forEach((pageEl) => {
        const layer = pageEl.querySelector<HTMLElement>(".nq-pdf-text");
        if (!layer) return;
        const ranges = rangesIn(layer, needle);
        all.push(...ranges);
        if (Number(pageEl.dataset.pdfPage) === target.page) mine = ranges[target.local];
      });
    }
    CSS.highlights.set(FIND_ALL, new Highlight(...all));
    if (mine) CSS.highlights.set(FIND_CURRENT, new Highlight(mine));
    else CSS.highlights.delete(FIND_CURRENT);
  }, [container, needle, textVersion, target.page, target.local]);

  const searching = needle.length > 0 && texts.size < pages.length;

  function step(delta: number) {
    if (total === 0) return;
    setCurrent((safeCurrent + delta + total) % total);
  }

  return (
    <div className="nq-find nq-pdf-find" role="search" aria-label="Cerca nel PDF">
      <input
        ref={inputRef}
        value={query}
        placeholder="Cerca nel PDF"
        aria-label="Testo da cercare nel PDF"
        onChange={(e) => {
          setQuery(e.target.value);
          setCurrent(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <span className="nq-find-count" aria-live="polite">
        {needle ? (total === 0 ? (searching ? "Cerco…" : "Nessun risultato") : `${safeCurrent + 1} di ${total}${searching ? "…" : ""}`) : ""}
      </span>
      <button type="button" className="nq-icon-btn" onClick={() => step(-1)} disabled={total === 0} aria-label="Risultato precedente" title="Precedente (Maiusc+Invio)">
        <MdKeyboardArrowUp />
      </button>
      <button type="button" className="nq-icon-btn" onClick={() => step(1)} disabled={total === 0} aria-label="Risultato successivo" title="Successivo (Invio)">
        <MdKeyboardArrowDown />
      </button>
      <button type="button" className="nq-icon-btn" onClick={onClose} aria-label="Chiudi la ricerca" title="Chiudi (Esc)">
        <MdClose />
      </button>
    </div>
  );
}

export default PdfFind;
