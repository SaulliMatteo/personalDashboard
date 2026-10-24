import type { FaceFrame } from "../engine/animator";
import { tweakFace } from "../engine/animator";
import { emotionFace } from "../engine/face";
import type { FaceTweak } from "../engine/personalities";
import type { CompanionStyle } from "../render/styles";
import type { PixyLook } from "./pixyNotifications";

/** Lato dell'immagine della notifica, in pixel. Windows la rimpicciolisce da sé. */
const SIZE = 128;
/** Punto della faccia molto più grande che nella card: l'immagine è piccola e va letta al volo. */
const POINT = 10;

/**
 * Disegna Pixy per una notifica: stessa forma del tema attivo (LED in Fosforo,
 * forme piene negli altri), colori letti dai token, sfondo della card arrotondato.
 * `tokensFrom` è l'elemento da cui leggere i token: una faccia già a schermo (così in
 * Opaco vale il pigmento del Companion) o la radice del documento.
 */
export function renderNotificationFace(
  look: PixyLook,
  opts: { style: CompanionStyle; tweak: FaceTweak; showMouth: boolean; useAccent: boolean; tokensFrom: Element }
): string {
  const css = getComputedStyle(opts.tokensFrom);
  const color = css.getPropertyValue(opts.useAccent ? "--accent" : "--face-on").trim() || "#ffffff";
  const background = firstColor(css.getPropertyValue("--card-bg")) ?? "#000000";

  const frame: FaceFrame = {
    face: tweakFace(emotionFace(look.emotion), look.emotion, opts.tweak),
    gazeX: 0,
    gazeY: 0,
    offsetX: 0,
    offsetY: 0,
    // Età scelta perché il simbolo sia ben visibile, non a metà dissolvenza.
    glyph: look.glyph ? { id: look.glyph, age: 300, alpha: 1 } : null,
    costume: null,
    glow: 0,
    glowPos: 0,
  };

  const face = document.createElement("canvas");
  face.width = SIZE;
  face.height = SIZE;
  opts.style.draw(face, frame, { color, showMouth: opts.showMouth, dpr: 1, maxPointSize: POINT, padding: 4 });

  const out = document.createElement("canvas");
  out.width = SIZE;
  out.height = SIZE;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D non disponibile");
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(0, 0, SIZE, SIZE, SIZE * 0.22);
  ctx.fill();
  ctx.drawImage(face, 0, 0);
  return out.toDataURL("image/png");
}

/** Il primo colore di un valore CSS: `--card-bg` in alcuni temi è un gradiente. */
function firstColor(value: string): string | null {
  const match = value.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/i);
  return match ? match[0] : value.trim() || null;
}
