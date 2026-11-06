import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useLatestRef } from "../../../../core/hooks/useLatestRef";
import type { InkStroke } from "../../data/notesRepository";
import { PDF_PAPER, type PdfJs } from "../../lib/pdf/pdfDocument";
import InkLayer, { type InkTool } from "../InkLayer";

/** Destinazione di un link del PDF: una pagina del documento (dest da risolvere) o un indirizzo. */
export type PdfLinkTarget = { dest: unknown } | { url: string };

interface PdfLink {
  left: number;
  top: number;
  width: number;
  height: number;
  target: PdfLinkTarget;
}

interface PdfPageViewProps {
  lib: PdfJs;
  doc: PDFDocumentProxy;
  pageNumber: number;
  /** Dimensioni della pagina in punti (già ruotata). */
  size: [number, number];
  /** Px CSS per punto. */
  scale: number;
  invert: boolean;
  /** Il contenitore che scorre: le pagine si disegnano solo quando gli sono vicine. */
  root: HTMLElement | null;
  mode: "text" | "ink";
  tool: InkTool;
  color: string;
  inkSize: number;
  shapes: boolean;
  strokes: InkStroke[];
  onInk: (strokes: InkStroke[]) => void;
  /** Il livello di testo è pronto (la ricerca rifà le evidenziazioni). */
  onTextReady: () => void;
  onLink: (target: PdfLinkTarget) => void;
}

/** Tetto ai pixel di un canvas (i browser rifiutano quelli enormi, e la memoria non è infinita). */
const MAX_CANVAS_PX = 16_000_000;

/**
 * Una pagina del PDF: segnaposto delle sue proporzioni finché è lontana, poi canvas nitido
 * (× devicePixelRatio), testo selezionabile, link e inchiostro. Allontanandosi libera il canvas.
 */
function PdfPageView(props: PdfPageViewProps) {
  const { lib, doc, pageNumber, size, scale, root } = props;
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [links, setLinks] = useState<PdfLink[]>([]);
  const textReady = useLatestRef(props.onTextReady);

  // Vicina allo schermo (una schermata e mezza sopra e sotto): si disegna.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), {
      root,
      rootMargin: "150% 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const canvasBox = canvasRef.current;
    const textBox = textRef.current;
    if (!canvasBox || !textBox) return;
    if (!near) {
      canvasBox.replaceChildren();
      textBox.replaceChildren();
      return;
    }
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    let textLayer: { cancel: () => void } | null = null;
    // Durante lo zoom si aspetta un attimo: intanto il canvas di prima si allarga con il CSS.
    const timer = window.setTimeout(async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        let renderScale = scale * dpr;
        const px = size[0] * renderScale * size[1] * renderScale;
        if (px > MAX_CANVAS_PX) renderScale *= Math.sqrt(MAX_CANVAS_PX / px);
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const render = page.render({ canvasContext: ctx, viewport, annotationMode: lib.AnnotationMode.ENABLE, background: PDF_PAPER });
        task = render;
        await render.promise;
        if (cancelled) return;
        canvasBox.replaceChildren(canvas);
        setRendered(true);

        // Testo selezionabile, nelle coordinate CSS della pagina.
        const cssViewport = page.getViewport({ scale });
        textBox.replaceChildren();
        textBox.style.setProperty("--scale-factor", String(scale));
        const layer = new lib.TextLayer({ textContentSource: page.streamTextContent(), container: textBox, viewport: cssViewport });
        textLayer = layer;
        await layer.render();
        if (cancelled) return;
        textReady.current();

        // Link: solo quelli veri (niente moduli, niente script), in frazioni della pagina.
        const annotations = await page.getAnnotations({ intent: "display" });
        if (cancelled) return;
        const found: PdfLink[] = [];
        for (const a of annotations as { subtype?: string; rect?: number[]; url?: string; dest?: unknown }[]) {
          if (a.subtype !== "Link" || !a.rect) continue;
          const target: PdfLinkTarget | null = typeof a.url === "string" && a.url ? { url: a.url } : a.dest ? { dest: a.dest } : null;
          if (!target) continue;
          const [x1, y1, x2, y2] = cssViewport.convertToViewportRectangle(a.rect);
          found.push({
            left: Math.min(x1, x2) / cssViewport.width,
            top: Math.min(y1, y2) / cssViewport.height,
            width: Math.abs(x2 - x1) / cssViewport.width,
            height: Math.abs(y2 - y1) / cssViewport.height,
            target,
          });
        }
        setLinks(found);
      } catch (error) {
        if ((error as { name?: string })?.name !== "RenderingCancelledException" && !cancelled) {
          console.error(`Pagina ${pageNumber} del PDF non disegnata:`, error);
        }
      }
    }, rendered ? 120 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      task?.cancel();
      textLayer?.cancel();
    };
    // `rendered` serve solo a scegliere l'attesa: non deve far ridisegnare.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, scale, doc, lib, pageNumber, size, textReady]);

  const width = size[0] * scale;
  const height = size[1] * scale;

  return (
    <div
      ref={boxRef}
      className={`nq-pdf-page${props.invert ? " is-inverted" : ""}${props.mode === "ink" ? " is-ink" : ""}`}
      data-pdf-page={pageNumber}
      style={{ width, height } as CSSProperties}
    >
      <div ref={canvasRef} className="nq-pdf-canvas" aria-hidden="true" />
      {!near && <span className="nq-pdf-placeholder">Pagina {pageNumber}</span>}
      <div ref={textRef} className="textLayer nq-pdf-text" />
      {props.mode === "text" && links.length > 0 && (
        <div className="nq-pdf-links">
          {links.map((l, i) => (
            <button
              key={i}
              type="button"
              className="nq-pdf-link"
              style={{ left: `${l.left * 100}%`, top: `${l.top * 100}%`, width: `${l.width * 100}%`, height: `${l.height * 100}%` }}
              title={"url" in l.target ? l.target.url : "Vai alla pagina"}
              aria-label={"url" in l.target ? `Link: ${l.target.url}` : "Link a un'altra pagina del PDF"}
              onClick={() => props.onLink(l.target)}
            />
          ))}
        </div>
      )}
      <InkLayer
        className="nq-pdf-ink"
        strokes={props.strokes}
        active={props.mode === "ink" && props.tool !== "pin"}
        tool={props.tool}
        color={props.color}
        size={props.inkSize}
        shapes={props.shapes}
        onChange={props.onInk}
      />
      <span className="nq-pdf-number" aria-hidden="true">
        {pageNumber}
      </span>
    </div>
  );
}

export default PdfPageView;
