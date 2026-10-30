import { useEffect, useRef, type ReactNode } from "react";
import { useLatestRef } from "../hooks/useLatestRef";
import { useTheme } from "../theme/useTheme";
import { useThemeVariant } from "../theme/variants";
import type { FaceFrame } from "./engine/animator";
import { FACE_STYLES } from "./render/styles";
import "./PixyFace.css";

/** Un fumetto da mostrare sopra la faccia. */
export interface PixyBubbleData {
  id: number;
  text: string;
  durationMs: number;
}

export interface PixyFaceProps {
  /** Il fotogramma da disegnare all'istante `t` (ms di requestAnimationFrame), dato il rettangolo del canvas. */
  sample: (t: number, rect: DOMRect | null) => FaceFrame;
  /** "accent" = colore d'accento del tema, "face" = colore della faccia del tema. */
  color: "accent" | "face";
  showMouth: boolean;
  bubble?: PixyBubbleData | null;
  bubbleSize?: "small" | "normal" | "large";
  /** Grandezza massima di un punto della faccia, in pixel CSS: limita quanto crescono gli occhi. */
  maxPointSize?: number;
  /** Grandezza minima di un punto LED (Fosforo), in pixel CSS: solo per facce minuscole, come nella Stanza comune. */
  minPointSize?: number;
  /** Margine intorno alla faccia, in punti: più piccolo nei riquadri piccoli. */
  padding?: number;
  /** Ingrandimento CSS applicato da fuori (es. `transform: scale` della Stanza comune): il canvas si disegna a quella risoluzione. */
  renderScale?: number;
  className?: string;
  children?: ReactNode;
}

/** Nei mockup un punto della faccia è grande circa 7px (occhi di ~46×64 nella card 2×2). */
const MAX_POINT_SIZE = 7;

/** ~30 fotogrammi al secondo bastano e costano la metà. */
const FRAME_MS = 1000 / 30;

/** Pixel reali per pixel CSS: densità dello schermo (al massimo 2) per l'ingrandimento esterno. */
function pixelRatio(renderScale: number): number {
  return Math.min(2, window.devicePixelRatio || 1) * renderScale;
}

/**
 * Canvas che disegna un Pixy nello stile del tema: il proprio (Companion) o quello di un compagno di gruppo.
 * Chi lo usa decide solo da dove vengono i fotogrammi.
 */
function PixyFace({
  sample,
  color,
  showMouth,
  bubble = null,
  bubbleSize = "normal",
  maxPointSize = MAX_POINT_SIZE,
  minPointSize,
  padding,
  renderScale = 1,
  className = "",
  children,
}: PixyFaceProps) {
  const theme = useTheme();
  const style = useThemeVariant(FACE_STYLES);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Colore dei LED: accent oppure il colore della faccia del tema, letti dal CSS
  // dell'elemento stesso (così in Opaco valgono i token del pigmento).
  const colorRef = useRef("");
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const token = color === "accent" ? "--accent" : "--face-on";
    const css = getComputedStyle(wrap).getPropertyValue(token).trim();
    if (css) colorRef.current = css;
  }, [color, theme.accent, theme.id, theme.mode]);

  const drawOpts = useLatestRef({ style, showMouth, maxPointSize, minPointSize, padding, renderScale, sample });

  // Dimensioni reali del canvas = dimensioni CSS × densità dello schermo (× ingrandimento esterno).
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const dpr = pixelRatio(renderScale);
      const w = Math.max(1, Math.round(wrap.clientWidth * dpr));
      const h = Math.max(1, Math.round(wrap.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [renderScale]);

  // Ciclo di disegno. requestAnimationFrame si ferma da solo a finestra nascosta.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < FRAME_MS) return;
      last = t;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const o = drawOpts.current;
      const frame = o.sample(t, canvas.getBoundingClientRect());
      const dpr = pixelRatio(o.renderScale);
      o.style.draw(canvas, frame, {
        color: colorRef.current,
        showMouth: o.showMouth,
        dpr,
        maxPointSize: o.maxPointSize,
        minPointSize: o.minPointSize,
        padding: o.padding,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [drawOpts]);

  return (
    <div ref={wrapRef} className={`pixy-face ${className}`}>
      <canvas ref={canvasRef} className="pixy-face-canvas" aria-hidden="true" />
      {bubble && (
        <div
          key={bubble.id}
          className={`pixy-bubble pixy-bubble--${bubbleSize}`}
          style={{ animationDuration: `${bubble.durationMs}ms` }}
          role="status"
        >
          {bubble.text}
        </div>
      )}
      {children}
    </div>
  );
}

export default PixyFace;
