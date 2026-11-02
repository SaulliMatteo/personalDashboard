import type { MouseEvent } from "react";
import OtherSubjectsPopup from "../components/OtherSubjectsPopup";
import type { StudyCardData } from "./useStudyCard";

/**
 * Pulsante "Altre materie": apre il pop-up con le materie non previste oggi (nella cella non ci stanno).
 * Il testo cambia per tema (`label`). Senza altre materie non c'è.
 */
function OthersToggle({ data, className, label }: { data: StudyCardData; className: string; label: string }) {
  if (data.otherRows.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className={className}
        aria-haspopup="dialog"
        aria-expanded={data.othersOpen}
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          data.openOthers();
        }}
      >
        {label}
      </button>
      {data.othersOpen && (
        <OtherSubjectsPopup
          rows={data.otherRows}
          onPick={(id) => void data.switchSubject(id)}
          onClose={data.closeOthers}
        />
      )}
    </>
  );
}

export default OthersToggle;
