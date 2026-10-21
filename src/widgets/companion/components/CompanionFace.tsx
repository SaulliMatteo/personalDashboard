import { useEffect, useRef } from "react";
import { useSettings } from "../../../core/settings/useSettings";
import { useTheme } from "../../../core/theme/useTheme";
import { useThemeVariant, type ThemeVariants } from "../../../core/theme/variants";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import { useCompanion } from "../useCompanion";
import { COMPANION_STYLES, type CompanionStyle } from "../render/styles";
import "./CompanionFace.css";

interface CompanionFaceProps {
  /** Mostra il fumetto sopra la faccia. */
  showBubble?: boolean;
  bubbleSize?: "small" | "normal" | "large";
  /** Grandezza massima di un punto della faccia, in pixel CSS: limita quanto crescono gli occhi. */
  maxPointSize?: number;
  /** Margine intorno alla faccia, in punti: più piccolo nei riquadri piccoli (es. il mini dell'intestazione). */
  padding?: number;
  className?: string;
}

/** Come viene disegnata la faccia in ogni tema (mockup: card del Companion). */
const FACE_STYLES: ThemeVariants<CompanionStyle> = {
  notte: COMPANION_STYLES.soft,
  opaco: COMPANION_STYLES.pill,
  quaderno: COMPANION_STYLES.pill,
  fosforo: COMPANION_STYLES.led,
};

/** Nei mockup un punto della faccia è grande circa 7px (occhi di ~46×64 nella card 2×2). */
const MAX_POINT_SIZE = 7;

/** ~30 fotogrammi al secondo bastano e costano la metà. */
const FRAME_MS = 1000 / 30;

/**
 * Canvas che disegna il Companion condiviso. Ce ne possono essere più di
 * uno contemporaneamente (widget + fantasma del drag + pagina): leggono
 * tutti lo stesso fotogramma dal provider.
 */
function CompanionFace({ showBubble = true, bubbleSize = "normal", maxPointSize = MAX_POINT_SIZE, padding, className = "" }: CompanionFaceProps) {
  const { sampleFrame, snapshot } = useCompanion();
  const { settings } = useSettings();
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
    const token = settings.companionColor === "accent" ? "--accent" : "--face-on";
    const css = getComputedStyle(wrap).getPropertyValue(token).trim();
    if (css) colorRef.current = css;
  }, [settings.companionColor, settings.accentColor, settings.accentOverride, theme.id]);

  const drawOpts = useLatestRef({ style, showMouth: settings.companionShowMouth, maxPointSize, padding });

  // Dimensioni reali del canvas = dimensioni CSS × densità dello schermo.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
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
  }, []);

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
      const frame = sampleFrame(t, canvas.getBoundingClientRect());
      const o = drawOpts.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      o.style.draw(canvas, frame, { color: colorRef.current, showMouth: o.showMouth, dpr, maxPointSize: o.maxPointSize, padding: o.padding });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sampleFrame, drawOpts]);

  const bubble = showBubble ? snapshot.bubble : null;

  return (
    <div ref={wrapRef} className={`companion-face ${className}`}>
      <canvas ref={canvasRef} className="companion-face-canvas" aria-hidden="true" />
      {bubble && (
        <div
          key={bubble.id}
          className={`companion-bubble companion-bubble--${bubbleSize}`}
          style={{ animationDuration: `${bubble.durationMs}ms` }}
          role="status"
        >
          {bubble.text}
        </div>
      )}
    </div>
  );
}

export default CompanionFace;
