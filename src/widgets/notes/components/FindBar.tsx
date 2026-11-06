import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { MdClose, MdKeyboardArrowDown, MdKeyboardArrowUp } from "react-icons/md";
import type { NotePage } from "../data/notesRepository";
import { sanitizeHtml } from "../lib/html";
import { FIND_ALL, FIND_CURRENT, clearHighlights, countIn, highlightsSupported, rangesIn } from "../lib/findHighlight";
import "./FindBar.css";

interface FindBarProps {
  pages: NotePage[];
  index: number;
  editorRef: RefObject<HTMLDivElement | null>;
  onGoToPage: (index: number) => void;
  onClose: () => void;
}

function pageText(html: string): string {
  return new DOMParser().parseFromString(sanitizeHtml(html), "text/html").body.textContent ?? "";
}

/** Cerca nella nota (Ctrl+F): conta in tutte le pagine, Invio va alla successiva. */
function FindBar({ pages, index, editorRef, onGoToPage, onClose }: FindBarProps) {
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const needle = query.trim().toLowerCase();

  // Quante volte compare in ogni pagina (il testo della pagina aperta cambia mentre si scrive).
  const perPage = useMemo(
    () => pages.map((p) => countIn(pageText(p.content).toLowerCase(), needle)),
    [pages, needle]
  );
  const total = perPage.reduce((a, b) => a + b, 0);
  const safeCurrent = total === 0 ? 0 : Math.min(current, total - 1);

  // Pagina e posizione dentro la pagina della corrispondenza corrente.
  let target = { page: -1, local: 0 };
  for (let i = 0, seen = 0; i < perPage.length; seen += perPage[i], i++) {
    if (safeCurrent < seen + perPage[i]) {
      target = { page: i, local: safeCurrent - seen };
      break;
    }
  }

  useEffect(() => {
    inputRef.current?.focus();
    return clearHighlights;
  }, []);

  useEffect(() => {
    if (target.page >= 0 && target.page !== index) onGoToPage(target.page);
  }, [target.page, index, onGoToPage]);

  useEffect(() => {
    const root = editorRef.current;
    if (!root || !highlightsSupported()) return;
    const ranges = needle ? rangesIn(root, needle) : [];
    CSS.highlights.set(FIND_ALL, new Highlight(...ranges));
    const mine = target.page === index ? ranges[target.local] : undefined;
    if (mine) {
      CSS.highlights.set(FIND_CURRENT, new Highlight(mine));
      mine.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
    } else {
      CSS.highlights.delete(FIND_CURRENT);
    }
  }, [needle, pages, index, target.page, target.local, editorRef]);

  function step(delta: number) {
    if (total === 0) return;
    setCurrent((safeCurrent + delta + total) % total);
  }

  return (
    <div className="nq-find" role="search" aria-label="Cerca nella nota">
      <input
        ref={inputRef}
        value={query}
        placeholder="Cerca nella nota"
        aria-label="Testo da cercare nella nota"
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
        {needle ? (total === 0 ? "Nessun risultato" : `${safeCurrent + 1} di ${total}`) : ""}
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

export default FindBar;
