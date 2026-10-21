import type { FaceFrame } from "../engine/animator";
import { FACE_H, FACE_W, GLYPH_BITS, costumeDots, faceField, glyphPlacement } from "./faceShape";

/**
 * Stile "matrice LED": tutta la card è una griglia di punti spenti e la
 * faccia accende i punti che cadono dentro le sue forme (faceShape.ts). Un
 * punto a metà del bordo si accende a metà, così anche su una griglia
 * grossa le transizioni restano morbide.
 */

export interface LedOptions {
  /** Colore dei punti accesi (qualunque colore CSS risolto, letto dai token del tema). */
  color: string;
  /** Opacità dei punti spenti. */
  offAlpha: number;
  showMouth: boolean;
  /** Margine minimo intorno alla faccia, in punti. */
  padding?: number;
  /** Passo massimo della griglia, in pixel reali: oltre, la faccia non cresce. */
  maxPitch?: number;
}

// ----------------------------------------------------------------- sprite

const spriteCache = new Map<string, HTMLCanvasElement>();

/** Un punto acceso con un piccolo alone, disegnato una volta e poi copiato. */
function litSprite(color: string, pitchPx: number): HTMLCanvasElement {
  const key = `${color}|${pitchPx.toFixed(2)}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const size = Math.ceil(pitchPx * 2);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (g) {
    const mid = size / 2;
    const r = pitchPx * 0.36;
    const halo = g.createRadialGradient(mid, mid, r * 0.6, mid, mid, pitchPx * 0.95);
    halo.addColorStop(0, color);
    halo.addColorStop(1, "transparent");
    g.globalAlpha = 0.28;
    g.fillStyle = halo;
    g.fillRect(0, 0, size, size);
    g.globalAlpha = 1;
    g.fillStyle = color;
    g.beginPath();
    g.arc(mid, mid, r, 0, Math.PI * 2);
    g.fill();
  }
  if (spriteCache.size > 40) spriteCache.clear();
  spriteCache.set(key, c);
  return c;
}

/** Griglia dei punti spenti: cambia solo con taglia/colore, quindi si ridisegna di rado. */
const gridCache = new WeakMap<HTMLCanvasElement, { key: string; canvas: HTMLCanvasElement }>();

function offGrid(owner: HTMLCanvasElement, w: number, h: number, cols: number, rows: number, pitch: number, ox: number, oy: number, color: string, alpha: number): HTMLCanvasElement {
  const key = `${w}x${h}|${cols}|${rows}|${pitch}|${color}|${alpha}`;
  const cached = gridCache.get(owner);
  if (cached && cached.key === key) return cached.canvas;
  const c = cached?.canvas ?? document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (g) {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color;
    g.globalAlpha = alpha;
    const r = pitch * 0.3;
    g.beginPath();
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = ox + i * pitch;
        const y = oy + j * pitch;
        g.moveTo(x + r, y);
        g.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    g.fill();
  }
  gridCache.set(owner, { key, canvas: c });
  return c;
}

// ----------------------------------------------------------------- disegno

/**
 * Disegna un fotogramma. `canvas` ha già dimensioni in pixel reali
 * (width/height = CSS × devicePixelRatio).
 */
export function drawLedFace(canvas: HTMLCanvasElement, frame: FaceFrame, options: LedOptions): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (W < 4 || H < 4) return;

  const pad = options.padding ?? 1.5;
  const pitch = Math.max(3, Math.min(W / (FACE_W + pad * 2), H / (FACE_H + pad * 2), options.maxPitch ?? Infinity));
  const cols = Math.floor(W / pitch);
  const rows = Math.floor(H / pitch);
  // Griglia centrata nella card.
  const ox = (W - (cols - 1) * pitch) / 2;
  const oy = (H - (rows - 1) * pitch) / 2;

  if (options.offAlpha > 0) ctx.drawImage(offGrid(canvas, W, H, cols, rows, pitch, ox, oy, options.color, options.offAlpha), 0, 0);

  // Punto (i, j) della griglia → coordinate faccia.
  const faceX0 = (cols - 1) / 2 - FACE_W / 2;
  const faceY0 = (rows - 1) / 2 - FACE_H / 2;

  const field = faceField(frame, { showMouth: options.showMouth });

  const sprite = litSprite(options.color, pitch);
  const half = sprite.width / 2;

  // Simbolo: insieme di punti accesi in coordinate faccia.
  let glyphSet: Set<number> | null = null;
  let glyphAlpha = 0;
  if (frame.glyph) {
    const place = glyphPlacement(frame.glyph.id, frame.glyph.age);
    glyphAlpha = place.alpha * frame.glyph.alpha;
    glyphSet = new Set();
    // Tenuto dentro la griglia visibile: nelle card basse il bordo è vicino alla faccia.
    const gx0 = Math.min(Math.round(place.x + frame.offsetX), Math.floor(cols - 1 - faceX0) - 4);
    const gy0 = Math.max(Math.round(place.y + frame.offsetY), Math.ceil(-faceY0));
    for (const [bx, by] of GLYPH_BITS[frame.glyph.id]) glyphSet.add((gy0 + by) * 1000 + (gx0 + bx));
  }
  // Punti del costume (scritte, particelle): chiave = riga * 1000 + colonna, valore = luminosità.
  const dotMap = new Map<number, number>();
  for (const [x, y, a] of costumeDots(frame)) dotMap.set(y * 1000 + x, Math.max(a, dotMap.get(y * 1000 + x) ?? 0));

  for (let j = 0; j < rows; j++) {
    const fy = j - faceY0;
    for (let i = 0; i < cols; i++) {
      const fx = i - faceX0;
      let b = field.brightness(fx, fy);

      const key = Math.round(fy) * 1000 + Math.round(fx);
      if (glyphSet && glyphSet.has(key)) b = Math.max(b, glyphAlpha);
      const dot = dotMap.get(key);
      if (dot !== undefined) b = Math.max(b, dot);

      if (b < 0.04) continue;
      ctx.globalAlpha = b;
      ctx.drawImage(sprite, ox + i * pitch - half, oy + j * pitch - half);
    }
  }
  ctx.globalAlpha = 1;
}
