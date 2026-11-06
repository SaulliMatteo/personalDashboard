import { useEffect, useRef, useState } from "react";
import { MdOutlinePictureAsPdf } from "react-icons/md";
import "./PdfRangeDialog.css";

interface PdfRangeDialogProps {
  name: string;
  /** Pagine del PDF (0 = non si sa: PDF protetto, si inseriscono tutte). */
  pages: number;
  onConfirm: (from: number, to: number) => void;
  onCancel: () => void;
}

/** Prima di inserire un PDF in una nota: tutte le pagine o un intervallo. */
function PdfRangeDialog({ name, pages, onConfirm, onCancel }: PdfRangeDialogProps) {
  const [all, setAll] = useState(true);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(Math.max(1, pages));
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const valid = all || (from >= 1 && to >= from && to <= pages);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div className="nq-pdf-range-backdrop" onMouseDown={onCancel}>
      <form
        className="nq-menu nq-pdf-range"
        role="dialog"
        aria-label="Pagine del PDF da inserire"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onCancel();
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onConfirm(all ? 1 : from, all ? pages : to);
        }}
      >
        <header>
          <MdOutlinePictureAsPdf aria-hidden="true" />
          <strong title={name}>{name}</strong>
        </header>
        <p>Le pagine vanno subito dopo questa pagina della nota; nel testo resta un collegamento.</p>
        <label className="nq-pdf-range-choice">
          <input type="radio" name="range" checked={all} onChange={() => setAll(true)} />
          Tutte le pagine{pages > 0 ? ` (${pages})` : ""}
        </label>
        {pages > 1 && (
          <label className="nq-pdf-range-choice">
            <input type="radio" name="range" checked={!all} onChange={() => setAll(false)} />
            Dalla pagina
            <input
              type="number"
              min={1}
              max={pages}
              value={from}
              disabled={all}
              aria-label="Prima pagina"
              onChange={(e) => setFrom(Number(e.target.value))}
            />
            alla
            <input
              type="number"
              min={1}
              max={pages}
              value={to}
              disabled={all}
              aria-label="Ultima pagina"
              onChange={(e) => setTo(Number(e.target.value))}
            />
          </label>
        )}
        {!valid && <small className="nq-pdf-range-error">Intervallo non valido (1–{pages}).</small>}
        <footer>
          <button type="button" className="nq-btn nq-btn--small" onClick={onCancel}>
            Annulla
          </button>
          <button ref={confirmRef} type="submit" className="nq-btn nq-btn--small nq-btn--primary" disabled={!valid}>
            Inserisci
          </button>
        </footer>
      </form>
    </div>
  );
}

export default PdfRangeDialog;
