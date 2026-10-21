import type { FaceFrame } from "../engine/animator";
import { FACE_H, FACE_W, GLYPH_BITS, costumeDots, faceField, glyphPlacement } from "./faceShape";

/**
 * Stile "forme piene": occhi e bocca sono macchie di colore pieno con il
 * bordo morbido, come nei mockup di Notte, Opaco e Quaderno. Le forme
 * (faceShape.ts) vengono campionate su un canvas piccolo, che poi viene
 * ingrandito con lo smussamento del browser: costa poco anche a 30 fps.
 */

export interface SolidOptions {
  /** Colore della faccia (qualunque colore CSS risolto, letto dai token del tema). */
  color: string;
  showMouth: boolean;
  /** Arrotondamento degli occhi: 0 = rettangoli, 1 = pillole. */
  roundness: number;
  /** Margine minimo intorno alla faccia, in punti. */
  padding: number;
  /** Grandezza massima di un punto, in pixel reali: oltre, la faccia non cresce. */
  maxScale: number;
}

/** Distanza tra due campioni, in pixel reali: sotto non si vede la differenza. */
const SAMPLE_PX = 1.5;
/** Area campionata intorno alla faccia, in punti (sguardo e spostamenti ci stanno dentro). */
const MARGIN = 4;

interface MaskBuffer {
  canvas: HTMLCanvasElement;
  image: ImageData;
}

const maskCache = new WeakMap<HTMLCanvasElement, MaskBuffer>();

function maskBuffer(owner: HTMLCanvasElement, w: number, h: number): MaskBuffer | null {
  const cached = maskCache.get(owner);
  if (cached && cached.image.width === w && cached.image.height === h) return cached;
  const canvas = cached?.canvas ?? document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const image = g.createImageData(w, h);
  // Il colore vero arriva dopo (source-in): qui conta solo l'alpha.
  image.data.fill(255);
  const buffer = { canvas, image };
  maskCache.set(owner, buffer);
  return buffer;
}

/**
 * Disegna un fotogramma. `canvas` ha già dimensioni in pixel reali
 * (width/height = CSS × devicePixelRatio).
 */
export function drawSolidFace(canvas: HTMLCanvasElement, frame: FaceFrame, options: SolidOptions): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (W < 4 || H < 4) return;

  const pad = options.padding;
  const scale = Math.min(W / (FACE_W + pad * 2), H / (FACE_H + pad * 2), options.maxScale);
  // Angolo in alto a sinistra dello spazio faccia, in pixel: faccia centrata.
  const originX = (W - FACE_W * scale) / 2;
  const originY = (H - FACE_H * scale) / 2;

  // Campioni per punto: abbastanza per un bordo netto, mai troppi.
  const k = Math.max(1, Math.min(8, scale / SAMPLE_PX));
  const sw = Math.ceil((FACE_W + MARGIN * 2) * k);
  const sh = Math.ceil((FACE_H + MARGIN * 2) * k);
  const buffer = maskBuffer(canvas, sw, sh);
  if (!buffer) return;

  const field = faceField(frame, { showMouth: options.showMouth, roundness: options.roundness });
  const data = buffer.image.data;
  for (let j = 0; j < sh; j++) {
    const fy = (j + 0.5) / k - MARGIN;
    for (let i = 0; i < sw; i++) {
      const fx = (i + 0.5) / k - MARGIN;
      data[(j * sw + i) * 4 + 3] = Math.round(field.brightness(fx, fy, k) * 255);
    }
  }

  const g = buffer.canvas.getContext("2d");
  if (!g) return;
  g.globalCompositeOperation = "source-over";
  g.putImageData(buffer.image, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = options.color;
  g.fillRect(0, 0, sw, sh);

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(buffer.canvas, 0, 0, sw, sh, originX - MARGIN * scale, originY - MARGIN * scale, (sw / k) * scale, (sh / k) * scale);

  // Punti del costume (scritte, particelle): come i simboli, punti tondi.
  const r = scale * 0.4;
  ctx.fillStyle = options.color;
  for (const [x, y, a] of costumeDots(frame)) {
    if (a < 0.04) continue;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(originX + x * scale, originY + y * scale, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Simbolo: punti tondi sopra la faccia, tenuti dentro il canvas.
  if (frame.glyph) {
    const place = glyphPlacement(frame.glyph.id, frame.glyph.age);
    const alpha = place.alpha * frame.glyph.alpha;
    if (alpha < 0.04) return;
    const maxX = (W - originX) / scale - 5;
    const minY = -originY / scale;
    const gx0 = Math.min(place.x + frame.offsetX, maxX);
    const gy0 = Math.max(place.y + frame.offsetY, minY);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = options.color;
    ctx.beginPath();
    for (const [bx, by] of GLYPH_BITS[frame.glyph.id]) {
      const x = originX + (gx0 + bx) * scale;
      const y = originY + (gy0 + by) * scale;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
