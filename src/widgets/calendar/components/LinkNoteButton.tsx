import { useRef, useState } from "react";
import type { NoteRef } from "../../../core/notes/noteRefsRepository";
import NotePicker from "./NotePicker";

/** Pulsante che apre la scelta di una nota da collegare ("+ Aggiungi", "+ Collega una nota", "+"). */
function LinkNoteButton({
  label,
  ariaLabel,
  className,
  exclude,
  onPick,
}: {
  label: string;
  ariaLabel?: string;
  className?: string;
  exclude?: readonly number[];
  onPick: (note: NoteRef) => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open && (
        <NotePicker
          anchor={ref}
          exclude={exclude}
          onPick={(n) => {
            setOpen(false);
            onPick(n);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export default LinkNoteButton;
