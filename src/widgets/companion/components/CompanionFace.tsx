import { useEffect, useRef } from "react";
import { useSettings } from "../../../core/settings/SettingsContext";
import { resolveTheme, useSystemPrefersLight } from "../../../core/settings/theme";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import { useCompanion } from "../CompanionContext";
import { DEFAULT_STYLE } from "../render/styles";
import "./CompanionFace.css";

interface CompanionFaceProps {
  /** Mostra il fumetto sopra la faccia. */
  showBubble?: boolean;
  bubbleSize?: "small" | "normal" | "large";
  /** Spazio intorno alla faccia, in punti della matrice. */
  padding?: number;
  className?: string;
}

/** ~30 fotogrammi al secondo bastano e costano la metà. */
const FRAME_MS = 1000 / 30;

/**
 * Canvas che disegna il Companion condiviso. Ce ne possono essere più di
 * uno contemporaneamente (widget + fantasma del drag + pagina): leggono
 * tutti lo stesso fotogramma dal provider.
 */
function CompanionFace({ showBubble = true, bubbleSize = "normal", padding, className = "" }: CompanionFaceProps) {
  const { sampleFrame, snapshot } = useCompanion();
  const { settings } = useSettings();
  const systemPrefersLight = useSystemPrefersLight();
  const isLight = resolveTheme(settings.theme, systemPrefersLight) === "light";

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Colore dei LED: accent, oppure il colore del testo del tema (letto dal CSS).
  const colorRef = useRef("#f2f2f4");
  useEffect(() => {
    if (settings.companionColor === "accent") {
      colorRef.current = settings.accentColor;
    } else {
      const css = getComputedStyle(document.documentElement).getPropertyValue("--text-primary").trim();
      colorRef.current = css || (isLight ? "#1a1a1e" : "#f2f2f4");
    }
  }, [settings.companionColor, settings.accentColor, isLight]);

  const drawOpts = useLatestRef({ isLight, showMouth: settings.companionShowMouth, padding });

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
      DEFAULT_STYLE.draw(canvas, frame, { color: colorRef.current, isLight: o.isLight, showMouth: o.showMouth, padding: o.padding });
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
