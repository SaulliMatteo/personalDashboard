import { useRef, type ReactNode } from "react";
import { CONTRAST_SMALL } from "../lib/titleColor";
import { useTitleColor } from "../lib/useTitleColor";

interface NoteTitleProps {
  /** Colore del titolo scelto dall'utente (null = quello del tema). */
  color: string | null;
  as?: "span" | "b" | "h3" | "strong";
  className?: string;
  /** Contrasto minimo sullo sfondo (titoli piccoli: 4,5). */
  min?: number;
  /** Valori che cambiano lo sfondo sotto il titolo (es. riga attiva): si ricalcola. */
  deps?: readonly unknown[];
  children: ReactNode;
}

/** Titolo di una nota nel suo colore, reso leggibile sullo sfondo su cui sta. */
function NoteTitle({ color, as = "span", className, min = CONTRAST_SMALL, deps = [], children }: NoteTitleProps) {
  const ref = useRef<HTMLElement | null>(null);
  useTitleColor(ref, color, min, deps);
  const Tag = as;
  return (
    <Tag
      ref={(el: HTMLElement | null) => {
        ref.current = el;
      }}
      className={className}
    >
      {children}
    </Tag>
  );
}

export default NoteTitle;
