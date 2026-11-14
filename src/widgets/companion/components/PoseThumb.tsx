import { useEffect, useRef } from "react";
import { FaceAnimator } from "../../../core/pixy/engine/animator";
import { EMOTIONS, type EmotionId } from "../../../core/pixy/engine/face";
import type { PersonalityId } from "../../../core/pixy/engine/personalities";
import { poseSnapshot } from "../../../core/pixy/engine/poseSnapshot";
import type { PoseId } from "../../../core/pixy/engine/poses";
import { FACE_STYLES } from "../../../core/pixy/render/styles";
import { useTheme } from "../../../core/theme/useTheme";
import { useThemeVariant } from "../../../core/theme/variants";

/** Lato della miniatura, in pixel CSS. */
const SIZE = 52;

/**
 * Una posa ferma, disegnata una volta nello stile del tema: le miniature della galleria di Pixy in Ombra
 * (Temi Vetro e Ombra.html, pagina Pixy). `emotion` per le emozioni casuali, che non hanno una posa.
 */
function PoseThumb({ pose, emotion, personality, showMouth }: { pose: PoseId; emotion?: EmotionId; personality: PersonalityId; showMouth: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const style = useThemeVariant(FACE_STYLES);
  const theme = useTheme();

  useEffect(() => {
    // Al frame dopo: cambiando tema o variante, gli attributi su <html> (e quindi i token) arrivano dopo questo effect.
    const raf = requestAnimationFrame(() => {
      const canvas = ref.current;
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(SIZE * dpr);
      canvas.height = Math.round(SIZE * dpr);
      const base = poseSnapshot(pose, personality);
      const posed = emotion ? { ...base, mood: emotion, glyph: EMOTIONS[emotion].glyph ?? null } : base;
      const snap = { ...posed, blink: false, wander: false, breath: false };
      const animator = new FaceAnimator(() => 0.5);
      const opts = { blinkMs: [1e9, 1e9] as [number, number], pointer: null, still: true };
      animator.advance(1000, snap, opts);
      // Un secondo fotogramma: il simbolo appare con una dissolvenza che parte dal primo.
      const frame = animator.advance(1600, snap, opts);
      const color = getComputedStyle(canvas).getPropertyValue("--face-on").trim();
      style.draw(canvas, frame, { color, showMouth, dpr, maxPointSize: 7, padding: 4 });
    });
    return () => cancelAnimationFrame(raf);
  }, [pose, emotion, personality, showMouth, style, theme.id, theme.mode, theme.accent]);

  return <canvas ref={ref} className="companion-pose-thumb" style={{ width: SIZE, height: SIZE }} aria-hidden="true" />;
}

export default PoseThumb;
