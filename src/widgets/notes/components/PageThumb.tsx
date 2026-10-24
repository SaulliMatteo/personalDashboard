import { memo, useMemo, useState, type CSSProperties } from "react";
import { useElementSize } from "../../../core/hooks/useElementSize";
import type { NotePage } from "../data/notesRepository";
import { sanitizeHtml } from "../lib/html";
import { THEME_INK } from "../lib/ink";
import { paperStyle } from "../lib/pageColor";

/** Pagina "di riferimento": la miniatura è questa pagina scalata, quindi identica all'originale. */
const PAPER_W = 870;
const PAPER_H = 1100;

interface PageThumbProps {
  page: NotePage;
  kicker: string;
  dateLabel: string;
}

function PageThumb({ page, kicker, dateLabel }: PageThumbProps) {
  const [box, setBox] = useState<HTMLSpanElement | null>(null);
  const { width } = useElementSize(box);
  const html = useMemo(() => sanitizeHtml(page.content), [page.content]);

  return (
    <span ref={setBox} className="nq-thumb-box" aria-hidden="true">
      {width > 0 && (
        <span
          className="nq-paper nq-thumb-paper"
          data-bg={page.background}
          style={{ ...paperStyle(page.color), "--nq-zoom": 1, transform: `scale(${width / PAPER_W})` } as CSSProperties}
        >
          <span className="nq-paper-head">
            <span>{kicker}</span>
            <span>{dateLabel}</span>
          </span>
          <span className="nq-doc" dangerouslySetInnerHTML={{ __html: html }} />
          {page.ink.length > 0 && (
            <svg className="nq-thumb-ink" viewBox={`0 0 1 ${PAPER_H / PAPER_W}`} preserveAspectRatio="none">
              {page.ink.map((s, i) => (
                <polyline
                  key={i}
                  points={s.points.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={s.color.toLowerCase() === THEME_INK ? "var(--text-primary)" : s.color}
                  strokeWidth={(s.size * (s.tool === "highlighter" ? 5 : 1)) / 900}
                  strokeOpacity={s.tool === "highlighter" ? 0.35 : 1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </svg>
          )}
        </span>
      )}
    </span>
  );
}

// memo: scrivendo si ridisegna solo la miniatura della pagina cambiata.
export default memo(PageThumb);