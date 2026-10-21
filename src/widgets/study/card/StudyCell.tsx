import type { CSSProperties, ReactNode } from "react";
import { useSingleClick } from "../../../core/hooks/useSingleClick";
import type { StudyCardData } from "./useStudyCard";

/**
 * Taglia 1×1: tutta la cella è il pulsante play/pausa. Il click singolo
 * aspetta un attimo, così il doppio click apre il dettaglio senza
 * mettere in pausa e riprendere (data-cell-action, vedi Dashboard).
 */
function StudyCell({ data, className, children }: { data: StudyCardData; className: string; children: ReactNode }) {
  const onClick = useSingleClick(data.primaryAction);
  return (
    <button
      type="button"
      data-cell-action
      className={className}
      onClick={onClick}
      disabled={data.isIdle && !data.canStart}
      aria-label={data.cellLabel}
      title={data.cellLabel}
      style={{ "--chars": data.clockText.length } as CSSProperties}
    >
      {children}
    </button>
  );
}

export default StudyCell;
