import { useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { MdClose } from "react-icons/md";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import type { OtherRow } from "../card/useStudyCard";
import "./subjectSettingsPopup.css";
import "./otherSubjectsPopup.css";

interface OtherSubjectsPopupProps {
  rows: OtherRow[];
  /** Materia scelta: si passa a quella (il pop-up si chiude da solo). */
  onPick: (subjectId: number) => void;
  onClose: () => void;
}

/**
 * Pop-up "Altre materie" della card: le materie non previste oggi, che nella cella non ci stanno.
 * Sta in un portale su `body` (la cella della griglia ha un transform, un `position: fixed` resterebbe dentro);
 * gli eventi React risalgono comunque fino alla cella, quindi si fermano qui (niente dettaglio aperto da un doppio click).
 */
function OtherSubjectsPopup({ rows, onPick, onClose }: OtherSubjectsPopupProps) {
  const closeRef = useLatestRef(onClose);

  // Esc chiude il pop-up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeRef]);

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return createPortal(
    <div
      className="study-popup-overlay"
      onMouseDown={(e) => {
        stop(e);
        if (e.target === e.currentTarget) onClose();
      }}
      onClick={stop}
      onDoubleClick={stop}
    >
      <div className="study-popup study-others-popup" role="dialog" aria-modal="true" aria-label="Altre materie">
        <div className="study-popup-header">
          <h3>Altre materie</h3>
          <button type="button" className="study-popup-close" onClick={onClose} aria-label="Chiudi">
            <MdClose />
          </button>
        </div>
        <p className="study-others-intro">Non previste oggi: scegline una per studiarla adesso.</p>
        <div className="study-others-list">
          {rows.map((row) => (
            <button
              key={row.subject.id}
              type="button"
              className="study-others-row"
              style={{ "--subject-color": row.color } as CSSProperties}
              title={`Studia ${row.subject.name}`}
              onClick={() => {
                onPick(row.subject.id);
                onClose();
              }}
            >
              <span className="study-others-dot" aria-hidden="true" />
              <span className="study-others-name">{row.subject.name}</span>
              {row.daysText && <span className="study-others-days">di {row.daysText}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default OtherSubjectsPopup;
