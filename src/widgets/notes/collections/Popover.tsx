import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import "./Popover.css";

interface PopoverProps {
  /** Il pulsante che lo apre: il menu si mette sotto (o sopra, se sotto non c'è posto). */
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** "start" = allineato a sinistra del pulsante, "end" = a destra. */
  align?: "start" | "end";
  className?: string;
  role?: string;
  label?: string;
  children: ReactNode;
}

/**
 * Menu a comparsa sopra tutta la pagina (portal nel body, posizione fissa): non viene tagliato
 * dai contenitori che scorrono, come la tabella della raccolta. Clic fuori o Esc lo chiudono.
 */
function Popover({ anchor, onClose, align = "start", className, role = "dialog", label, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      const a = anchor.current?.getBoundingClientRect();
      if (!el || !a) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const margin = 8;
      let left = align === "end" ? a.right - w : a.left;
      left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
      let top = a.bottom + 6;
      if (top + h > window.innerHeight - margin && a.top - h - 6 >= margin) top = a.top - h - 6;
      top = Math.max(margin, Math.min(top, window.innerHeight - h - margin));
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.visibility = "visible";
    };
    place();
    const observer = new ResizeObserver(place);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, align]);

  return createPortal(
    <>
      {/* Il clic fuori fa perdere il focus ai campi (che così si salvano), poi chiude. */}
      <div className="nq-pop-backdrop" onClick={onClose} />
      <div
        ref={ref}
        className={`nq-pop${className ? ` ${className}` : ""}`}
        role={role}
        aria-label={label}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
            anchor.current?.focus();
          }
        }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

export default Popover;
