import { useEffect, useRef, type ReactNode } from "react";
import { MdClose } from "react-icons/md";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Larghezza massima in px. */
  width?: number;
}

/** Finestra modale: Esc e click sullo sfondo chiudono; il focus parte dal primo campo. */
function Dialog({ title, onClose, children, width = 460 }: DialogProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, button:not(.yt-dialog-close)");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="yt-dialog-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className="yt-dialog" role="dialog" aria-modal="true" aria-label={title} style={{ width: `min(${width}px, 92vw)` }}>
        <div className="yt-dialog-head">
          <h2>{title}</h2>
          <button type="button" className="yt-dialog-close" onClick={onClose} aria-label="Chiudi">
            <MdClose />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default Dialog;
