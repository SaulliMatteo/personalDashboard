import type { FaceFrame } from "../engine/animator";
import type { EyeParams, GlyphId } from "../engine/face";
import { COSTUMES, type CostumeDot } from "./costumes";
import { lit, sdRoundBox } from "./sdf";

/**
 * Geometria della faccia, comune a tutti gli stili grafici. Le forme sono
 * funzioni di distanza (SDF) nello "spazio della faccia", misurato in punti:
 * ogni renderer decide come trasformare quei punti in pixel (matrice LED,
 * forme piene...).
 */

/** Spazio della faccia, in punti. */
export const FACE_W = 30;
export const FACE_H = 20;
const EYE_CX = [9, 21] as const;
const EYE_CY = 8.5;
const EYE_HW = 4.1;
export const EYE_HH = 5.1;
const MOUTH_CY = 16.2;
const GAZE_X = 2.6;
const GAZE_Y = 1.9;

// ----------------------------------------------------------------- forme

/** Cuore con la punta in (0,0) e i lobi verso y = 1 (Inigo Quilez). */
function sdHeart(x: number, y: number): number {
  x = Math.abs(x);
  if (y + x > 1) return Math.hypot(x - 0.25, y - 0.75) - Math.SQRT2 / 4;
  const a = (x - 0) ** 2 + (y - 1) ** 2;
  const m = 0.5 * Math.max(x + y, 0);
  const b = (x - m) ** 2 + (y - m) ** 2;
  return Math.sqrt(Math.min(a, b)) * Math.sign(x - y);
}

function eyeDistance(px: number, py: number, cx: number, cy: number, eye: EyeParams, side: 1 | -1, roundness: number): number {
  const hw = EYE_HW * eye.scaleX;
  const hhFull = EYE_HH * eye.scaleY;
  const hh = Math.max(0.45, hhFull * Math.max(0.06, eye.open));
  const lx = px - cx;
  const ly = py - cy;

  let d = sdRoundBox(lx, ly, hw, hh, Math.min(hw, hh) * roundness);

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

export const GLYPH_BITS: Record<GlyphId, [number, number][]> = Object.fromEntries(
  (Object.keys(GLYPHS) as GlyphId[]).map((id) => {
    const bits: [number, number][] = [];
    GLYPHS[id].forEach((row, y) => [...row].forEach((c, x) => c === "#" && bits.push([x, y])));
    return [id, bits];
  })
) as Record<GlyphId, [number, number][]>;

/** Posizione (in punti faccia, angolo in alto a sinistra) e alpha del simbolo nel tempo. */
export function glyphPlacement(id: GlyphId, age: number): { x: number; y: number; alpha: number } {
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

// ----------------------------------------------------------------- campo

export interface FaceFieldOptions {
  showMouth: boolean;
  /** Arrotondamento degli angoli degli occhi: 0 = rettangoli, 1 = pillole. */
  roundness?: number;
}

export interface FaceField {
  /**
   * Luminosità 0..1 della faccia nel punto (fx, fy), in punti faccia. Senza
   * simboli. `sharpness` è quanti campioni cadono in un punto: più è alto,
   * più il bordo delle forme è netto.
   */
  brightness: (fx: number, fy: number, sharpness?: number) => number;
}

/** Spostamento del costume: segue la testa (e, per gli occhiali, anche lo sguardo); quelli "fissi" no. */
function costumeOffset(frame: FaceFrame): [number, number] {
  const c = frame.costume ? COSTUMES[frame.costume.id] : null;
  if (!c || c.fixed) return [0, 0];
  const k = c.gazeFollow ? 1 : c.head ? 0.5 : 0;
  return [frame.offsetX + frame.gazeX * GAZE_X * k, frame.offsetY + frame.gazeY * GAZE_Y * k * 0.9];
}

/** Punti singoli del costume (testo, simboli, particelle), già spostati e sfumati. */
export function costumeDots(frame: FaceFrame): CostumeDot[] {
  const costume = frame.costume;
  const dots = costume ? COSTUMES[costume.id].dots : undefined;
  if (!costume || !dots) return [];
  const [dx, dy] = costumeOffset(frame);
  return dots(costume.t).map(([x, y, a]) => [Math.round(x + dx), Math.round(y + dy), a * costume.alpha]);
}

/** Prepara le forme di un fotogramma: occhi, bocca, rossore, bagliore e costume. */
export function faceField(frame: FaceFrame, options: FaceFieldOptions): FaceField {
  const roundness = options.roundness ?? 0.55;
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
  const costume = frame.costume;
  const def = costume ? COSTUMES[costume.id] : null;
  const [cdx, cdy] = costumeOffset(frame);

  return {
    brightness(fx, fy, sharpness = 1) {
      let d = Math.min(eyeDistance(fx, fy, lcx, ecy, face.left, 1, roundness), eyeDistance(fx, fy, rcx, ecy, face.right, -1, roundness));
      if (showMouth) d = Math.min(d, mouthDistance(fx, fy, mcx, mcy, face.mouthCurve, face.mouthOpen, face.mouthWidth));
      let b = lit(d, sharpness);

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

      if (!costume || !def) return b;
      const cx = fx - cdx;
      const cy = fy - cdy;
      const cb = def.shape(cx, cy, costume.t, sharpness, costume.value) * costume.alpha;
      // La faccia diventa la forma: occhi e bocca restano forati (con un piccolo bordo per leggerli).
      if (def.form) return Math.max(b * (1 - costume.alpha), cb * (1 - lit(d - 0.9, sharpness)));
      const occ = def.occlude ? def.occlude(cx, cy, costume.t) * costume.alpha : 0;
      return Math.max(b * (1 - occ), cb);
    },
  };
}
