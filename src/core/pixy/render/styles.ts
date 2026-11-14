import { perMode, type ThemeVariants } from "../../theme/variants";
import type { FaceFrame } from "../engine/animator";
import { drawLedFace } from "./ledRenderer";
import { drawOmbraFace, type OmbraBody } from "./ombraRenderer";
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
  /** Grandezza minima di un punto LED, in pixel CSS (assente = quella di sempre). */
  minPointSize?: number;
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

function ombra(id: string, label: string, body: OmbraBody): CompanionStyle {
  return {
    id,
    label,
    draw: (canvas, frame, o) =>
      drawOmbraFace(canvas, frame, { body, color: o.color, showMouth: o.showMouth, dpr: o.dpr, maxPointSize: o.maxPointSize, padding: o.padding ?? FACE_PADDING }),
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
      drawLedFace(canvas, frame, {
        color: o.color,
        offAlpha: 0,
        showMouth: o.showMouth,
        padding: o.padding ?? FACE_PADDING,
        maxPitch: o.maxPointSize * o.dpr,
        minPitch: o.minPointSize === undefined ? undefined : o.minPointSize * o.dpr,
      }),
  },
  /** Vetro: matrice di punti tondi; quelli spenti si vedono appena, dentro il riquadro lucido della card. */
  glass: {
    id: "glass",
    label: "Punti di vetro",
    draw: (canvas, frame, o) =>
      drawLedFace(canvas, frame, {
        color: o.color,
        offAlpha: 0.18,
        showMouth: o.showMouth,
        padding: o.padding ?? FACE_PADDING,
        maxPitch: o.maxPointSize * o.dpr,
        minPitch: o.minPointSize === undefined ? undefined : o.minPointSize * o.dpr,
      }),
  },
  /** Ombra, variante Ombra: un corpo d'ombra con gli occhi luminosi (ombraRenderer.ts). */
  shadow: ombra("shadow", "Ombra", "shadow"),
  /** Ombra, variante Fiamma: un globo bianco con le fiamme. */
  flame: ombra("flame", "Fiamma", "flame"),
} satisfies Record<string, CompanionStyle>;

/** Come viene disegnata la faccia in ogni tema (mockup: card del Companion). Usato dal canvas e dalle notifiche. */
export const FACE_STYLES: ThemeVariants<CompanionStyle> = {
  notte: COMPANION_STYLES.soft,
  opaco: COMPANION_STYLES.pill,
  quaderno: COMPANION_STYLES.pill,
  fosforo: COMPANION_STYLES.led,
  vetro: COMPANION_STYLES.glass,
  // L'unico tema in cui la variante cambia anche il Pixy (docs/TEMI.md).
  ombra: perMode({ notte: COMPANION_STYLES.shadow, giorno: COMPANION_STYLES.flame }),
};
