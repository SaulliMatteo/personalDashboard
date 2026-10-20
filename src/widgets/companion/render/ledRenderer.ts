import type { FaceFrame } from "../engine/animator";
import type { EyeParams, GlyphId } from "../engine/face";

/**
 * Stile "matrice LED": tutta la card è una griglia di punti spenti e la
 * faccia accende i punti che cadono dentro le sue forme. Le forme sono
 * funzioni di distanza (SDF): un punto a metà del bordo si accende a metà,
 * così anche su una griglia grossa le transizioni restano morbide.
 *
 * Per un nuovo stile grafico: un altro file con la stessa firma di
 * `drawLedFace` e una voce in render/styles.ts.
 */

/** Spazio della faccia, in punti. */
const FACE_W = 30;
const FACE_H = 20;
const EYE_CX = [9, 21] as const;
const EYE_CY = 8.5;
const EYE_HW = 4.1;
const EYE_HH = 5.1;
const MOUTH_CY = 16.2;
const GAZE_X = 2.6;
const GAZE_Y = 1.9;

export interface LedOptions {
  /** Colore dei punti accesi (qualunque colore CSS risolto, es. "#f2f2f4"). */
  color: string;
  /** Opacità dei punti spenti. */
  offAlpha: number;
  showMouth: boolean;
  /** Margine minimo intorno alla faccia, in punti. */
  padding?: number;
}

// ----------------------------------------------------------------- forme

function sdRoundBox(px: number, py: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(px) - hx + r;
  const qy = Math.abs(py) - hy + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

/** Cuore con la punta in (0,0) e i lobi verso y = 1 (Inigo Quilez). */
function sdHeart(x: number, y: number): number {
  x = Math.abs(x);
  if (y + x > 1) return Math.hypot(x - 0.25, y - 0.75) - Math.SQRT2 / 4;
  const a = (x - 0) ** 2 + (y - 1) ** 2;
  const m = 0.5 * Math.max(x + y, 0);
  const b = (x - m) ** 2 + (y - m) ** 2;
  return Math.sqrt(Math.min(a, b)) * Math.sign(x - y);
}

function eyeDistance(px: number, py: number, cx: number, cy: number, eye: EyeParams, side: 1 | -1): number {
  const hw = EYE_HW * eye.scaleX;
  const hhFull = EYE_HH * eye.scaleY;
  const hh = Math.max(0.45, hhFull * Math.max(0.06, eye.open));
  const lx = px - cx;
  const ly = py - cy;

  let d = sdRoundBox(lx, ly, hw, hh, Math.min(hw, hh) * 0.55);

  if (eye.heart > 0.001) {
    const s = (2 * hhFull) / 1.12;
    const dh = sdHeart(lx / s, (hhFull - ly) / s) * s;
    d = d + (dh - d) * eye.heart;
  }

  // Palpebra superiore (con inclinazione: >0 = angolo interno più basso).
  if (eye.lidTop > 0.001 || Math.abs(eye.tilt) > 0.001) {
    const edge = cy - hh + eye.lidTop * 2 * hh + eye.tilt * side * lx * 0.6 + Math.abs(eye.tilt) * 0.8;
    d = Math.max(d, edge - py);
  }
  // Arco dal basso: occhi a mezzaluna.
  if (eye.lidBottom > 0.001) {
    const u = Math.min(1, (lx / hw) ** 2);
    const edge = cy + hh - eye.lidBottom * 2 * hh * (1 - u * 0.75);
    d = Math.max(d, py - edge);
  }
  return d;
}

function mouthDistance(px: number, py: number, mx: number, my: number, curve: number, open: number, width: number): number {
  const hw = 0.5 + 3.6 * width;
  const u = Math.max(-1, Math.min(1, (px - mx) / hw));
  const bend = 1 - u * u;
  const centerY = my + curve * 1.7 * bend - curve * 0.6;
  const halfT = 0.5 + open * 1.9 * Math.sqrt(bend);
  return Math.max(Math.abs(px - mx) - hw, Math.abs(py - centerY) - halfT);
}

// ----------------------------------------------------------------- simboli

/** Bitmap 5×5 ("#" = acceso). */
const GLYPHS: Record<GlyphId, string[]> = {
  z: ["#####", "...#.", "..#..", ".#...", "#####"],
  heart: [".#.#.", "#####", "#####", ".###.", "..#.."],
  note: ["..###", "..#.#", "..#..", "###..", "###.."],
  exclaim: ["..#..", "..#..", "..#..", ".....", "..#.."],
  question: [".###.", "#...#", "..##.", ".....", "..#.."],
  sweat: ["..#..", ".###.", ".###.", "..#..", "....."],
  star: ["..#..", "#.#.#", ".###.", "#.#.#", "..#.."],
  dots: [".....", ".....", ".....", ".....", "#.#.#"],
  anger: [".#.#.", "##.##", ".....", "##.##", ".#.#."],
  spark: ["#...#", ".#.#.", ".....", ".#.#.", "#...#"],
};

const GLYPH_BITS: Record<GlyphId, [number, number][]> = Object.fromEntries(
  (Object.keys(GLYPHS) as GlyphId[]).map((id) => {
    const bits: [number, number][] = [];
    GLYPHS[id].forEach((row, y) => [...row].forEach((c, x) => c === "#" && bits.push([x, y])));
    return [id, bits];
  })
) as Record<GlyphId, [number, number][]>;

/** Posizione (in punti faccia, angolo in alto a sinistra) e alpha del simbolo nel tempo. */
function glyphPlacement(id: GlyphId, age: number): { x: number; y: number; alpha: number } {
  const s = age / 1000;
  switch (id) {
    case "z": {
      const p = (s % 2.2) / 2.2;
      return { x: 26 + p * 2, y: 0.5 - p * 3.5, alpha: p < 0.75 ? 1 : (1 - p) / 0.25 };
    }
    case "heart":
    case "note": {
      const p = (s % 1.8) / 1.8;
      return { x: 26 + Math.sin(p * Math.PI * 2) * 0.8, y: 1 - p * 3, alpha: p < 0.7 ? 1 : (1 - p) / 0.3 };
    }
    case "sweat": {
      const p = (s % 2) / 2;
      return { x: -1, y: 1 + p * 3, alpha: p < 0.8 ? 1 : (1 - p) / 0.2 };
    }
    case "dots":
      return { x: 24, y: 13, alpha: Math.floor(s * 2) % 2 === 0 ? 1 : 0.55 };
    case "star":
    case "spark":
      return { x: 25.5, y: -0.5, alpha: 0.55 + 0.45 * Math.abs(Math.sin(s * 5)) };
    default:
      return { x: 25.5, y: -0.5 + Math.sin(s * 6) * 0.4, alpha: 1 };
  }
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
  const pitch = Math.max(3, Math.min(W / (FACE_W + pad * 2), H / (FACE_H + pad * 2)));
  const cols = Math.floor(W / pitch);
  const rows = Math.floor(H / pitch);
  // Griglia centrata nella card.
  const ox = (W - (cols - 1) * pitch) / 2;
  const oy = (H - (rows - 1) * pitch) / 2;

  ctx.drawImage(offGrid(canvas, W, H, cols, rows, pitch, ox, oy, options.color, options.offAlpha), 0, 0);

  // Punto (i, j) della griglia → coordinate faccia.
  const faceX0 = (cols - 1) / 2 - FACE_W / 2;
  const faceY0 = (rows - 1) / 2 - FACE_H / 2;

  const { face } = frame;
  const gx = frame.gazeX * GAZE_X;
  const gy = frame.gazeY * GAZE_Y;
  const lcx = EYE_CX[0] + gx + frame.offsetX;
  const rcx = EYE_CX[1] + gx + frame.offsetX;
  const ecy = EYE_CY + gy + frame.offsetY;
  // La bocca segue lo sguardo solo a metà: la faccia "ruota" un po'.
  const mcx = FACE_W / 2 + gx * 0.5 + frame.offsetX;
  const mcy = MOUTH_CY + gy * 0.45 + frame.offsetY;
  const showMouth = options.showMouth && face.mouthWidth > 0.04;

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

  for (let j = 0; j < rows; j++) {
    const fy = j - faceY0;
    for (let i = 0; i < cols; i++) {
      const fx = i - faceX0;
      let d = Math.min(
        eyeDistance(fx, fy, lcx, ecy, face.left, 1),
        eyeDistance(fx, fy, rcx, ecy, face.right, -1)
      );
      if (showMouth) d = Math.min(d, mouthDistance(fx, fy, mcx, mcy, face.mouthCurve, face.mouthOpen, face.mouthWidth));
      let b = Math.max(0, Math.min(1, 0.55 - d));

      // Rossore: due macchie tenui sotto gli occhi.
      if (face.blush > 0.02 && b < 0.3) {
        for (const cx of [lcx - 1.5, rcx + 1.5]) {
          const e = ((fx - cx) / 2.3) ** 2 + ((fy - (ecy + EYE_HH + 1.3)) / 0.9) ** 2;
          if (e < 1) b = Math.max(b, 0.32 * face.blush);
        }
      }

      // Bagliore dello schermo: una banda diagonale che scorre.
      if (frame.glow > 0.01 && b > 0) {
        const band = Math.exp(-(((fx + fy * 0.6) / FACE_W - frame.glowPos) ** 2) / 0.006);
        b *= 1 - frame.glow * 0.38 + frame.glow * 0.38 * band * 1.6;
        b = Math.min(1, b);
      }

      if (glyphSet && glyphSet.has(Math.round(fy) * 1000 + Math.round(fx))) b = Math.max(b, glyphAlpha);

      if (b < 0.04) continue;
      ctx.globalAlpha = b;
      ctx.drawImage(sprite, ox + i * pitch - half, oy + j * pitch - half);
    }
  }
  ctx.globalAlpha = 1;
}
