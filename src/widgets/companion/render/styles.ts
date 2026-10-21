import type { FaceFrame } from "../engine/animator";
import { drawLedFace } from "./ledRenderer";
import { drawSolidFace } from "./solidRenderer";

/**
 * Stili grafici della faccia. Ogni tema ne sceglie uno (CompanionFace.tsx):
 * il comportamento è lo stesso, cambia solo come vengono disegnate le
 * forme di faceShape.ts. Per aggiungerne uno basta un renderer con questa
 * firma e una voce qui.
 */
export interface StyleDrawOptions {
  color: string;
  showMouth: boolean;
  /** Pixel reali per pixel CSS. */
  dpr: number;
  /** Grandezza massima di un punto della faccia, in pixel CSS. */
  maxPointSize: number;
  /** Margine intorno alla faccia, in punti (default FACE_PADDING). */
  padding?: number;
}

export interface CompanionStyle {
  id: string;
  label: string;
  draw: (canvas: HTMLCanvasElement, frame: FaceFrame, options: StyleDrawOptions) => void;
}

/** Margine intorno alla faccia, in punti: tiene gli occhi proporzionati alla card come nei mockup. */
export const FACE_PADDING = 8;

function solid(id: string, label: string, roundness: number): CompanionStyle {
  return {
    id,
    label,
    draw: (canvas, frame, o) =>
      drawSolidFace(canvas, frame, { color: o.color, showMouth: o.showMouth, roundness, padding: o.padding ?? FACE_PADDING, maxScale: o.maxPointSize * o.dpr }),
  };
}

export const COMPANION_STYLES = {
  /** Notte: occhi pieni con gli angoli morbidi (l'alone è nel CSS della card). */
  soft: solid("soft", "Forme morbide", 0.78),
  /** Opaco e Quaderno: occhi a pillola, come macchie d'inchiostro. */
  pill: solid("pill", "Pillole", 1),
  /** Fosforo: matrice di punti; i punti spenti li disegna la texture del display. */
  led: {
    id: "led",
    label: "Matrice LED",
    draw: (canvas, frame, o) =>
      drawLedFace(canvas, frame, { color: o.color, offAlpha: 0, showMouth: o.showMouth, padding: o.padding ?? FACE_PADDING, maxPitch: o.maxPointSize * o.dpr }),
  },
} satisfies Record<string, CompanionStyle>;
