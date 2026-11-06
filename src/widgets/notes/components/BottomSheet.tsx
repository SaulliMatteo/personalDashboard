import type { MouseEvent, ReactNode } from "react";
import "./BottomSheet.css";

interface BottomSheetProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/** Non togliere il fuoco al testo della pagina (resta la selezione e la tastiera non si chiude), salvo i campi. */
function keepSelection(e: MouseEvent) {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLSelectElement) && !(t instanceof HTMLTextAreaElement)) e.preventDefault();
}

/**
 * Foglio dal basso dell'editor sul telefono (docs/design/mobile/quaderno.html). Si chiude toccando fuori, con Esc
 * e quindi con l'indietro di Android (core/nav/overlays.ts manda Esc al dialogo in cima).
 */
function BottomSheet({ label, onClose, children }: BottomSheetProps) {
  return (
    <>
      <div className="nq-sheet-scrim" onMouseDown={keepSelection} onClick={onClose} aria-hidden="true" />
      <div
        className="nq-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={keepSelection}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="nq-sheet-grip" aria-hidden="true" />
        {children}
      </div>
    </>
  );
}

export default BottomSheet;
