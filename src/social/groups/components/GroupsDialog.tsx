import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import "./groupsUi.css";

interface GroupsDialogProps {
  title: string;
  /** Riga sotto il titolo. */
  intro?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Finestra dei Gruppi (finestre.html): sopra tutto, chiusa con Esc o cliccando fuori.
 * Aperta da un widget, i suoi click non devono arrivare alla cella: col portale gli eventi React risalgono
 * comunque l'albero dei componenti, quindi si fermano qui (niente dettaglio aperto da un doppio click).
 */
function GroupsDialog({ title, intro, onClose, children }: GroupsDialogProps) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useLatestRef(onClose);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    boxRef.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [closeRef]);

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return createPortal(
    <div
      className="grp-overlay"
      onMouseDown={(e) => {
        stop(e);
        if (e.target === e.currentTarget) onClose();
      }}
      onClick={stop}
      onDoubleClick={stop}
    >
      <div ref={boxRef} className="grp-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="grp-dialog-head">
          <h2 id={titleId}>{title}</h2>
          {intro && <p>{intro}</p>}
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export default GroupsDialog;
