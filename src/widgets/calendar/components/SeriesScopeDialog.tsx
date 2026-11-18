import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { SeriesScope } from "../data/occurrenceOps";
import "./controls.css";
import "./SeriesScopeDialog.css";

interface SeriesScopeDialogProps {
  action: "change" | "delete";
  onChoose: (scope: SeriesScope) => void;
  onCancel: () => void;
}

/** "Solo questa / Tutte" per un elemento che si ripete. Esc o clic fuori annullano. */
function SeriesScopeDialog({ action, onChoose, onCancel }: SeriesScopeDialogProps) {
  const firstRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);
  const title = action === "delete" ? "Elimina un elemento che si ripete" : "Modifica un elemento che si ripete";
  return createPortal(
    <div className="cal-scope-overlay" onClick={onCancel}>
      <div
        className="cal-scope"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
      >
        <h2>{title}</h2>
        <div className="cal-scope-actions">
          <button ref={firstRef} type="button" className="cal-btn-ghost" onClick={() => onChoose("one")}>
            Solo questa
          </button>
          <button type="button" className={action === "delete" ? "cal-btn-ghost cal-btn-danger" : "cal-btn-primary"} onClick={() => onChoose("all")}>
            Tutte
          </button>
        </div>
        <button type="button" className="cal-scope-cancel" onClick={onCancel}>
          Annulla
        </button>
      </div>
    </div>,
    document.body
  );
}

export default SeriesScopeDialog;
