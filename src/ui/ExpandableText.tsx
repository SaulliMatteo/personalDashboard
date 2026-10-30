import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import "./ExpandableText.css";

interface ExpandableTextProps {
  id?: string;
  /** Classe del paragrafo (colore, grandezza): il componente aggiunge solo il taglio e il pulsante. */
  className?: string;
  children: ReactNode;
}

/**
 * Paragrafo tagliato a due righe con "Più info" per leggerlo tutto. Il pulsante compare solo se il testo è davvero
 * tagliato (rimisurato quando cambia la larghezza): un testo corto resta com'è. Il testo intero è sempre nel DOM,
 * quindi un `aria-describedby` sul paragrafo lo legge tutto anche da chiuso.
 */
function ExpandableText({ id, className = "", children }: ExpandableTextProps) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const p = ref.current;
    // da aperto non si misura: resta l'ultimo valore, così "Meno" non sparisce
    if (!p || expanded) return;
    const measure = () => setOverflows(p.scrollHeight > p.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(p);
    return () => observer.disconnect();
  }, [expanded, children]);

  return (
    <div className="xt">
      <p ref={ref} id={id} className={`${className}${expanded ? "" : " xt-clamped"}`}>
        {children}
      </p>
      {overflows && (
        <button type="button" className="xt-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Meno" : "Più info"}
        </button>
      )}
    </div>
  );
}

export default ExpandableText;
