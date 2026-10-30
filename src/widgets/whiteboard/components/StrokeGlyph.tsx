import { useId } from "react";
import "./StrokeGlyph.css";

/** Il giro del pennarello e la punta della freccia (mockup docs/design/temi/lavagna.html). */
const LOOP = "M14 70 C 18 44, 44 30, 52 46 C 58 60, 38 70, 34 56 C 30 40, 56 30, 84 34";
const ARROW = "M71 24 L 85 34 L 72 44";

/**
 * Il segno della Lavagna: un tratto di pennarello che fa un giro e finisce in
 * una freccia. Stesso tracciato in ogni tema, cambia solo l'inchiostro (CSS).
 * Al passaggio del mouse sulla cella la maschera lo ridisegna.
 */
function StrokeGlyph({ className = "" }: { className?: string }) {
  // Più glifi nella stessa pagina: ogni maschera ha il suo id.
  const maskId = `wb-mask-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg className={`wb-glyph ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120">
          <path className="wb-reveal" pathLength={1} d={`${LOOP} ${ARROW}`} />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <path className="wb-ink" d={LOOP} />
        <path className="wb-ink" d={ARROW} />
      </g>
    </svg>
  );
}

export default StrokeGlyph;
