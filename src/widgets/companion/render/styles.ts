import type { FaceFrame } from "../engine/animator";
import { drawLedFace } from "./ledRenderer";

/**
 * Stili grafici disponibili. Oggi solo "led"; per aggiungerne uno basta un
 * renderer con questa firma (riceve gli stessi parametri della faccia) e
 * una voce qui, più l'opzione nell'impostazione quando ce ne sarà più d'uno.
 */
export interface StyleDrawOptions {
  color: string;
  isLight: boolean;
  showMouth: boolean;
  /** Spazio libero intorno alla faccia, in "punti". */
  padding?: number;
}

export interface CompanionStyle {
  id: string;
  label: string;
  draw: (canvas: HTMLCanvasElement, frame: FaceFrame, options: StyleDrawOptions) => void;
}

export const COMPANION_STYLES: Record<string, CompanionStyle> = {
  led: {
    id: "led",
    label: "Matrice LED",
    draw: (canvas, frame, o) =>
      drawLedFace(canvas, frame, { color: o.color, offAlpha: o.isLight ? 0.1 : 0.075, showMouth: o.showMouth, padding: o.padding }),
  },
};

export const DEFAULT_STYLE = COMPANION_STYLES.led;
