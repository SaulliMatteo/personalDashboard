import type { MouseEvent } from "react";

/**
 * True se il doppio click arriva da un controllo interno (non deve aprire il dettaglio).
 * Usato dalle celle della griglia e dagli spazi dell'intestazione.
 */
export function fromInnerControl(e: MouseEvent<HTMLElement>): boolean {
  const control = (e.target as HTMLElement).closest("button, a, input, textarea, select, [role='button']");
  // data-cell-action: pulsante che occupa tutta la cella (1×1), il doppio click apre comunque il dettaglio.
  return control !== null && !control.hasAttribute("data-cell-action");
}
