import type { CSSProperties } from "react";
import "./addWidgetSlot.css";

interface AddWidgetSlotProps {
  style: CSSProperties;
  onClick: () => void;
}

/**
 * Riquadro tratteggiato nella prima cella libera della griglia: apre il
 * catalogo dei widget. Il "+" è un'icona o un carattere a seconda del tema
 * (token --slot-*), come nei mockup.
 */
function AddWidgetSlot({ style, onClick }: AddWidgetSlotProps) {
  return (
    <button type="button" className="add-widget-slot" style={style} onClick={onClick}>
      <svg className="add-widget-slot-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span className="add-widget-slot-plus" aria-hidden="true">
        +
      </span>
      Aggiungi widget
    </button>
  );
}

export default AddWidgetSlot;
