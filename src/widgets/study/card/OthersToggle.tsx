import type { MouseEvent } from "react";
import type { StudyCardData } from "./useStudyCard";

/**
 * Pulsante "Altre materie": apre e chiude in linea le materie non previste oggi.
 * Il testo da chiuso cambia per tema (`label`); da aperto è sempre "Nascondi altre materie".
 * Senza altre materie non c'è.
 */
function OthersToggle({ data, className, label }: { data: StudyCardData; className: string; label: string }) {
  if (data.otherRows.length === 0) return null;
  return (
    <button
      type="button"
      className={className}
      aria-expanded={data.othersOpen}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        data.toggleOthers();
      }}
    >
      {data.othersOpen ? "Nascondi altre materie" : label}
    </button>
  );
}

export default OthersToggle;
