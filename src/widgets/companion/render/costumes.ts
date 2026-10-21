import { aimPos, kernelPos, planePos, type CostumeId } from "../engine/poses";
import { inTriangle, lit, rotate, sdCircle, sdEllipse, sdRoundBox, sdSeg, sdTaper, smin } from "./sdf";

/**
 * I costumi del Companion, nello spazio della faccia (30×20 punti, y verso
 * il basso; possono uscire di qualche punto, dentro il margine della card).
 * Tutto monocolore: ogni costume dice solo QUANTO è acceso un punto.
 * Fonte grafica: il mockup approvato "Pixy, nuove pose".
 *
 *  - shape:   luminosità del costume in (x, y) al tempo `t` (secondi);
 *  - occlude: quanto il costume copre la faccia (coperta, libro, joystick…);
 *  - dots:    punti singoli (testo, simboli, particelle), disegnati come i simboli;
 *  - form:    la faccia DIVENTA la forma (fiamma): occhi e bocca restano forati;
 *  - head:    segue i movimenti della testa; gazeFollow anche lo sguardo (occhiali);
 *  - fixed:   resta ferma anche se la faccia si muove (coperta, mirino).
 */

export type CostumeDot = [x: number, y: number, alpha: number];

export interface CostumeDef {
  form?: boolean;
  head?: boolean;
  gazeFollow?: boolean;
  fixed?: boolean;
  /** `value` = avanzamento 0..1 per i costumi che lo mostrano (null = animazione dimostrativa). */
  shape: (x: number, y: number, t: number, sharpness: number, value: number | null) => number;
  occlude?: (x: number, y: number, t: number) => number;
  dots?: (t: number) => CostumeDot[];
}

// ----------------------------------------------------------------- pixel art

const BITS = {
  flask: [".###.", "..#..", "..#..", ".#.#.", "#...#", "#.#.#", ".###."],
  hourglass: ["#####", "#...#", ".#.#.", "..#..", ".#.#.", "#.#.#", "#####"],
  brush: ["....#", "...#.", "..#..", ".##..", "###..", "##..."],
};

/** Font 3×5 per le scritte sopra la testa. */
const FONT: Record<string, string[]> = {
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["##.", "..#", ".#.", "#..", "###"],
  "+": ["...", ".#.", "###", ".#.", "..."],
  "=": ["...", "###", "...", "###", "..."],
  A: [".#.", "#.#", "###", "#.#", "#.#"],
  a: ["...", ".##", "#.#", "#.#", ".##"],
  "<": ["..#", ".#.", "#..", ".#.", "..#"],
  ">": ["#..", ".#.", "..#", ".#.", "#.."],
  "/": ["..#", "..#", ".#.", "#..", "#.."],
};

function bitmapDots(rows: string[], x0: number, y0: number, alpha: number, out: CostumeDot[]): void {
  rows.forEach((row, y) => [...row].forEach((c, x) => c === "#" && out.push([x0 + x, y0 + y, alpha])));
}

function textDots(text: string, cx: number, y0: number, alpha: number, out: CostumeDot[]): void {
  const w = text.length * 4 - 1;
  [...text].forEach((ch, i) => {
    const glyph = FONT[ch];
    if (glyph) bitmapDots(glyph, Math.round(cx - w / 2) + i * 4, y0, alpha, out);
  });
}

// ----------------------------------------------------------------- pezzi condivisi

function headphones(x: number, y: number, s: number): number {
  let b = 0;
  if (y < 8.5) b = lit(Math.abs(sdCircle(x, y, 15, 9.5, 15.2)) - 0.6, s);
  b = Math.max(b, lit(sdRoundBox(x - 0.1, y - 10.5, 1.7, 3.7, 1.3), s));
  return Math.max(b, lit(sdRoundBox(x - 29.9, y - 10.5, 1.7, 3.7, 1.3), s));
}

/** Trapuntato della coperta sotto il bordo `edge`. */
function quilt(x: number, y: number, edge: number, s: number): number {
  let b = lit(Math.abs(y - edge) - 0.6, s);
  b = Math.max(b, lit(Math.abs(y - edge - 2.3) - 0.4, s, 0.55));
  if (y > edge + 3.5) {
    const m1 = Math.abs((((x + y) % 6) + 6) % 6 - 3);
    const m2 = Math.abs((((x - y) % 6) + 6) % 6 - 3);
    if (Math.min(m1, m2) < 0.5) b = Math.max(b, 0.35);
  }
  return b;
}

const blanketEdge = (x: number, t: number) => 12.9 + Math.sin(x * 0.45 + 1) * 0.35 - (Math.sin((t * 2 * Math.PI) / 4.2) + 1) * 0.35;
const scaredEdge = (x: number, t: number) => 9.6 + Math.sin(x * 0.45 + 1) * 0.35 + Math.sin(t * 1.3) * 1.1;

/** Libro aperto sotto gli occhi; una pagina gira ogni 5 secondi. */
function book(x: number, y: number, t: number, s: number): number {
  let d = Infinity;
  for (const side of [-1, 1]) {
    const ox = 15 + side * 10.5;
    d = Math.min(d, sdSeg(x, y, 15, 15.2, ox, 14, 0.45), sdSeg(x, y, ox, 14, ox, 21.6, 0.45), sdSeg(x, y, ox, 21.6, 15, 22.6, 0.45));
  }
  d = Math.min(d, sdSeg(x, y, 15, 15.2, 15, 22.6, 0.45));
  let b = lit(d, s);
  for (const side of [-1, 1]) {
    for (const ly of [16.8, 18.4, 20]) b = Math.max(b, lit(sdSeg(x, y, 15 + side * 2.2, ly, 15 + side * 8.4, ly - 0.4, 0.3), s, 0.45));
  }
  const p = (t % 5) / 0.9;
  if (p < 1) {
    const a = p * Math.PI;
    const tx = 15 + Math.cos(a) * 10.5;
    const ty = 15.2 - Math.sin(a) * 4;
    b = Math.max(b, lit(Math.min(sdSeg(x, y, 15, 15.2, tx, ty, 0.45), sdSeg(x, y, tx, ty, tx, ty + 7.4 - Math.sin(a) * 2, 0.45)), s));
  }
  return b;
}
const bookOcclude = (x: number, y: number) => (y > 13.6 && x > 3.5 && x < 26.5 ? 1 : 0);

function studyCostume(symbol: ((alpha: number, t: number, out: CostumeDot[]) => void) | null): CostumeDef {
  return {
    shape: (x, y, t, s) => book(x, y, t, s),
    occlude: bookOcclude,
    dots: symbol
      ? (t) => {
          const out: CostumeDot[] = [];
          symbol(0.6 + 0.4 * Math.abs(Math.sin(t * 1.6)), t, out);
          return out;
        }
      : undefined,
  };
}

function scrollbar(x: number, y: number, t: number, s: number): number {
  const y0 = 1.5 + (Math.sin(t * 0.9) * 0.5 + 0.5) * 14.5;
  return Math.max(lit(sdSeg(x, y, 33, 1.5, 33, 21, 0.3), s, 0.35), lit(sdSeg(x, y, 33, y0, 33, y0 + 5, 0.65), s));
}

function sparkle(x: number, y: number, cx: number, cy: number, r: number): number {
  return Math.min(
    sdTaper(x, y, cx, cy, cx, cy - r, 0.55, 0.05),
    sdTaper(x, y, cx, cy, cx, cy + r, 0.55, 0.05),
    sdTaper(x, y, cx, cy, cx - r, cy, 0.55, 0.05),
    sdTaper(x, y, cx, cy, cx + r, cy, 0.55, 0.05)
  );
}

// ----------------------------------------------------------------- catalogo

export const COSTUMES: Record<CostumeId, CostumeDef> = {
  // --- Meteo
  flame: {
    form: true,
    shape(x, y, t, s) {
      let d = sdEllipse(x, y, 15, 13.2, 13.6, 9.6);
      const tips: [number, number, number][] = [[15, -7.5, 5], [6.2, -2, 3.6], [23.8, -2, 3.6], [10.5, -4.6, 2.6], [19.5, -4.6, 2.6]];
      tips.forEach(([cx, ty, r], i) => {
        const tx = cx + Math.sin(t * 6.3 + i * 1.7) * 1.1;
        const yy = ty + Math.sin(t * 8.1 + i * 2.3) * 1.1;
        d = smin(d, sdTaper(x, y, cx, 9, tx, yy, r, 0.25), 2.2);
      });
      return lit(d, s);
    },
    dots(t) {
      const out: CostumeDot[] = [];
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.7 + i / 3) % 1;
        out.push([Math.round(9 + i * 6 + Math.sin(i * 4 + t * 3) * 1.5), Math.round(-7 - p * 6), p < 0.7 ? 1 : (1 - p) / 0.3]);
      }
      return out;
    },
  },
  snow: {
    shape(x, y, t, s) {
      let d = Infinity;
      const a0 = t * 0.35;
      for (let k = 0; k < 6; k++) {
        const a = a0 + (k * Math.PI) / 3;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const at = (r: number): [number, number] => [15 + ca * r, 10 + sa * r];
        const [ax, ay] = at(12.2);
        const [bx, by] = at(17.2);
        const [mx, my] = at(14.6);
        d = Math.min(d, sdSeg(x, y, ax, ay, bx, by, 0.55));
        for (const side of [-1, 1]) {
          const b = a + side * 0.75;
          d = Math.min(d, sdSeg(x, y, mx, my, mx + Math.cos(b) * 2.3, my + Math.sin(b) * 2.3, 0.45));
        }
      }
      return lit(d, s);
    },
    dots(t) {
      const out: CostumeDot[] = [];
      for (let i = 0; i < 7; i++) out.push([Math.round(-5 + ((i * 11) % 40) + Math.sin(t + i) * 0.8), Math.round(-8 + ((t * 2.2 + i * 5.3) % 36)), 0.45]);
      return out;
    },
  },

  // --- Notte
  nightcap: {
    head: true,
    shape(x, y, t, s) {
      const tx = 28 + Math.sin(t * 1.3) * 0.7;
      const ty = -5.6;
      let b = lit(sdRoundBox(x - 15, y - 1.2, 10.6, 1.25, 1), s);
      b = Math.max(b, lit(Math.min(sdSeg(x, y, 5, 0, tx, ty, 0.5), sdSeg(x, y, 25, 0, tx, ty, 0.5)), s));
      // Righe da pigiama dentro la cuffia.
      if (y < 0 && y > ty && inTriangle(x, y, 5, 0, 25, 0, tx, ty) && Math.sin((x + y * 1.4) * 1.15) > 0.35) b = Math.max(b, 0.6);
      b = Math.max(b, lit(sdCircle(x, y, tx + 1.3, ty + 0.9, 1.6), s));
      // Colletto del pigiama con il bottone.
      b = Math.max(b, lit(Math.min(sdSeg(x, y, 8, 20.2, 15, 23.2, 0.5), sdSeg(x, y, 15, 23.2, 22, 20.2, 0.5)), s, 0.8));
      return Math.max(b, lit(sdCircle(x, y, 15, 25.4, 0.7), s, 0.8));
    },
  },
  blanket: {
    fixed: true,
    shape(x, y, t, s) {
      if (x < -4 || x > 34 || y > 27) return 0;
      const edge = blanketEdge(x, t);
      let b = quilt(x, y, edge, s);
      // Il cuscino, dietro la testa.
      if (y < edge - 0.8) b = Math.max(b, lit(Math.abs(sdRoundBox(x - 15, y - 5.5, 16, 7, 4)) - 0.45, s, 0.4));
      return b;
    },
    occlude: (x, y, t) => (y > blanketEdge(x, t) - 0.7 ? 1 : 0),
  },

  // --- Studio
  book: studyCostume(null),
  book_math: studyCostume((a, _t, out) => textDots("1+1=2", 15, -7, a, out)),
  book_science: studyCostume((a, t, out) => {
    bitmapDots(BITS.flask, 13, -8, a, out);
    const p = (t * 0.8) % 1;
    out.push([20, Math.round(-3 - p * 5), 1 - p]);
  }),
  book_lang: studyCostume((a, _t, out) => textDots("Aa", 15, -7, a, out)),
  book_history: studyCostume((a, _t, out) => bitmapDots(BITS.hourglass, 13, -8, a, out)),
  book_art: studyCostume((a, _t, out) => bitmapDots(BITS.brush, 13, -7, a, out)),
  book_code: studyCostume((a, _t, out) => textDots("</>", 15, -7, a, out)),

  // --- App per tipo
  headphones: { head: true, shape: (x, y, _t, s) => headphones(x, y, s) },
  headset: {
    head: true,
    shape: (x, y, _t, s) => Math.max(headphones(x, y, s), lit(sdSeg(x, y, 0.9, 14, 6.4, 18.6, 0.45), s), lit(sdCircle(x, y, 7.3, 19.1, 1), s)),
  },
  chat: {
    shape: (x, y, _t, s) => lit(Math.min(Math.abs(sdRoundBox(x - 28, y + 3.6, 5, 3.2, 1.6)) - 0.45, sdSeg(x, y, 25.2, -0.5, 23.4, 1.9, 0.45)), s),
    dots(t) {
      const step = Math.floor(t * 2.5) % 4;
      return [0, 1, 2].map((i): CostumeDot => [26 + i * 2, -4, i < step ? 1 : 0.25]);
    },
  },
  glasses: {
    head: true,
    gazeFollow: true,
    shape(x, y, _t, s) {
      let d = Infinity;
      for (const cx of [9, 21]) d = Math.min(d, Math.abs(sdRoundBox(x - cx, y - 8.5, 5.6, 6.3, 2.4)) - 0.45);
      d = Math.min(d, sdSeg(x, y, 14.6, 7.2, 15.4, 7.2, 0.45), sdSeg(x, y, 3.4, 6.6, 0.8, 5.8, 0.45), sdSeg(x, y, 26.6, 6.6, 29.2, 5.8, 0.45));
      return lit(d, s);
    },
  },
  beret: {
    head: true,
    shape: (x, y, _t, s) => Math.max(lit(sdEllipse(x, y, 12.8, 0.3, 9.8, 2.3), s), lit(sdSeg(x, y, 12.8, -2, 13.6, -3.4, 0.5), s)),
  },
  gamepad: {
    shape(x, y, t, s) {
      let b = lit(Math.abs(sdRoundBox(x - 15, y - 18.8, 7.6, 3.7, 2.6)) - 0.45, s);
      b = Math.max(b, lit(Math.min(sdSeg(x, y, 10, 18.8, 13, 18.8, 0.45), sdSeg(x, y, 11.5, 17.3, 11.5, 20.3, 0.45)), s));
      const press = Math.floor(t * 3) % 3;
      b = Math.max(b, lit(sdCircle(x, y, 18.4, 18, 0.8), s, press === 0 ? 0.35 : 1));
      return Math.max(b, lit(sdCircle(x, y, 20.1, 19.8, 0.8), s, press === 1 ? 0.35 : 1));
    },
    occlude: (x, y) => (y > 14.6 && x > 6.8 && x < 23.2 ? 1 : 0),
  },
  scroll: { shape: (x, y, t, s) => scrollbar(x, y, t, s) },

  // --- App specifiche
  sword: {
    shape(x, y, t, s) {
      const [rx, ry] = rotate(x, y, 31.6, 13, Math.sin(t * 1.6) * 0.12);
      let b = lit(sdTaper(rx, ry, 31.6, 12, 31.6, -6, 0.85, 0.2), s);
      b = Math.max(b, lit(sdSeg(rx, ry, 29, 12.4, 34.2, 12.4, 0.5), s));
      b = Math.max(b, lit(sdSeg(rx, ry, 31.6, 13, 31.6, 15.8, 0.5), s, 0.8));
      return Math.max(b, lit(sdCircle(rx, ry, 31.6, 16.9, 0.85), s));
    },
  },
  opera: {
    shape(x, y, t, s) {
      const ring = Math.abs(sdEllipse(x, y, 28, -4, 3, 3.4)) - 0.5;
      const inner = Math.abs(sdEllipse(x, y, 28, -4, 1.1, 2.2)) - 0.4;
      return Math.max(scrollbar(x, y, t, s), lit(Math.min(ring, inner), s));
    },
  },
  pickaxe: {
    shape(x, y, t, s) {
      const [rx, ry] = rotate(x, y, 27, 19, Math.sin(t * 3) * 0.25);
      return lit(Math.min(sdSeg(rx, ry, 27, 19, 31.5, 6, 0.55), sdSeg(rx, ry, 27.6, 5.2, 31.5, 4.4, 0.6), sdSeg(rx, ry, 31.5, 4.4, 35, 6.8, 0.6)), s);
    },
  },
  crosshair: {
    fixed: true,
    shape(x, y, t, s) {
      const [cx, cy] = aimPos(t);
      let d = Math.abs(sdCircle(x, y, cx, cy, 3)) - 0.4;
      d = Math.min(d, sdSeg(x, y, cx - 5.2, cy, cx - 1.6, cy, 0.4), sdSeg(x, y, cx + 1.6, cy, cx + 5.2, cy, 0.4));
      d = Math.min(d, sdSeg(x, y, cx, cy - 5.2, cx, cy - 1.6, 0.4), sdSeg(x, y, cx, cy + 1.6, cx, cy + 5.2, 0.4));
      return lit(d, s);
    },
  },
  popcorn: {
    shape(x, y, _t, s) {
      let d = Math.min(sdSeg(x, y, 8.5, 15.5, 10.3, 23.5, 0.45), sdSeg(x, y, 21.5, 15.5, 19.7, 23.5, 0.45), sdSeg(x, y, 10.3, 23.5, 19.7, 23.5, 0.45));
      for (const sx of [12.6, 15, 17.4]) d = Math.min(d, sdSeg(x, y, sx, 16.2, sx + (sx - 15) * 0.1, 22.8, 0.35));
      let b = lit(d, s);
      for (const [cx, r] of [[10, 1.5], [12.6, 1.8], [15.2, 1.6], [17.6, 1.8], [20, 1.5]]) b = Math.max(b, lit(sdCircle(x, y, cx, 14.6, r), s));
      return b;
    },
    occlude: (x, y) => (y > 12.8 && x > 7.5 && x < 22.5 ? 1 : 0),
    dots(t) {
      const [kx, ky] = kernelPos(t);
      return [[Math.round(kx), Math.round(ky), 1 - ((t * 0.9) % 1) * 0.6]];
    },
  },
  play: {
    shape(x, y, _t, s) {
      if (inTriangle(x, y, 13.8, -6.6, 13.8, -2.6, 17, -4.6)) return 0;
      return lit(sdRoundBox(x - 15, y + 4.6, 4.8, 3.3, 1.6), s);
    },
  },
  live: {
    shape(x, y, t, s) {
      let b = lit(sdCircle(x, y, 29.5, -4, 1.7), s, Math.sin(t * 4) > 0 ? 1 : 0.3);
      const p = (t * 0.8) % 1;
      b = Math.max(b, lit(Math.abs(sdCircle(x, y, 29.5, -4, 2.4 + p * 3)) - 0.35, s, 1 - p));
      return b;
    },
  },
  webcam: {
    shape(x, y, t, s) {
      let b = lit(Math.abs(sdRoundBox(x - 15, y + 3.8, 3.8, 2.4, 1.2)) - 0.45, s);
      b = Math.max(b, lit(sdCircle(x, y, 15, -3.8, 1.1), s));
      b = Math.max(b, lit(sdSeg(x, y, 15, -1.2, 15, 0.8, 0.45), s));
      return Math.max(b, lit(sdCircle(x, y, 18, -5.2, 0.5), s, Math.sin(t * 3) > 0 ? 1 : 0.2));
    },
  },
  plane: {
    fixed: true,
    shape(x, y, t, s) {
      const [px, py] = planePos(t);
      const d = Math.min(
        sdSeg(x, y, px + 3, py, px - 3, py - 2.2, 0.4),
        sdSeg(x, y, px + 3, py, px - 3, py + 2.2, 0.4),
        sdSeg(x, y, px - 3, py - 2.2, px - 1.4, py + 0.4, 0.4),
        sdSeg(x, y, px - 3, py + 2.2, px - 1.4, py + 0.4, 0.4)
      );
      let b = lit(d, s);
      for (let i = 1; i <= 3; i++) b = Math.max(b, lit(sdCircle(x, y, px - 3 - i * 2.4, py + Math.sin(t * 2 - i * 0.4) * 1.2, 0.45), s, 0.5));
      return b;
    },
  },
  sheet: {
    shape(x, y, t, s) {
      if (x < 5.5 || x > 24.5 || y < 14.6 || y > 23.8) return 0;
      let d = Math.abs(sdRoundBox(x - 15, y - 19.2, 9, 4.4, 0.6)) - 0.4;
      for (const gx of [9.8, 14.6, 19.4]) d = Math.min(d, Math.abs(x - gx) - 0.3);
      for (const gy of [17.6, 20.6]) d = Math.min(d, Math.abs(y - gy) - 0.3);
      const cell = Math.floor(t * 1.5) % 12;
      const x0 = 6 + (cell % 4) * 4.8;
      const y0 = 15.2 + Math.floor(cell / 4) * 3;
      if (x > x0 + 0.6 && x < x0 + 3.6 && y > y0 + 0.5 && y < y0 + 2.1) return 1;
      return lit(d, s, 0.8);
    },
    occlude: (x, y) => (y > 14 && x > 5 && x < 25 ? 1 : 0),
  },
  slides: {
    shape(x, y, t, s) {
      let b = lit(Math.abs(sdRoundBox(x - 29, y + 3.6, 5.2, 3.8, 0.6)) - 0.4, s);
      b = Math.max(b, lit(sdSeg(x, y, 29, 0.2, 29, 2.4, 0.4), s));
      const g = Math.sin(t * 1.5) * 0.5 + 0.5;
      const bars: [number, number][] = [[25.6, 0.4], [28, 0.65], [30.4, 1]];
      bars.forEach(([bx, h], i) => {
        const top = -0.8 - h * 4.8 * (0.4 + 0.6 * ((g + i * 0.2) % 1));
        b = Math.max(b, lit(sdSeg(x, y, bx, -0.9, bx, top, 0.55), s));
      });
      return b;
    },
  },
  cube: {
    shape(x, y, t, s) {
      const a = t * 0.9;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const cb = Math.cos(0.5);
      const sb = Math.sin(0.5);
      const v: [number, number][] = [];
      for (const vx of [-1, 1]) {
        for (const vy of [-1, 1]) {
          for (const vz of [-1, 1]) {
            const z1 = vx * sa + vz * ca;
            v.push([29.5 + (vx * ca - vz * sa) * 2.6, -3.5 + (vy * cb - z1 * sb) * 2.6]);
          }
        }
      }
      const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
      let d = Infinity;
      for (const [i, j] of edges) d = Math.min(d, sdSeg(x, y, v[i][0], v[i][1], v[j][0], v[j][1], 0.4));
      return lit(d, s);
    },
  },
  equalizer: {
    head: true,
    shape(x, y, t, s) {
      let b = headphones(x, y, s);
      [9, 11.4, 13.8, 16.2, 18.6, 21].forEach((bx, i) => {
        const h = 1 + 3.4 * Math.abs(Math.sin(t * (3 + i * 0.7) + i * 1.3));
        b = Math.max(b, lit(sdSeg(x, y, bx, 24.5, bx, 24.5 - h, 0.6), s, 0.85));
      });
      return b;
    },
  },
  ai: {
    shape(x, y, t, s) {
      let b = 0;
      const stars: [number, number, number, number][] = [[29.5, -4, 3.4, 0], [1, -5, 2.4, 2], [32.5, 5, 2, 4]];
      for (const [cx, cy, r, phase] of stars) b = Math.max(b, lit(sparkle(x, y, cx, cy, r * (0.35 + 0.65 * Math.abs(Math.sin(t * 1.6 + phase)))), s));
      return b;
    },
  },
  folder: {
    shape(x, y, t, s) {
      const lift = Math.max(0, Math.sin(t * 1.4)) * 1.2;
      const d = Math.min(Math.abs(sdRoundBox(x - 15, y + 3.6, 5.2, 3.2, 0.8)) - 0.45, sdSeg(x, y, 9.8, -6.8, 13, -6.8, 0.45), sdSeg(x, y, 13, -6.8, 14, -5.8, 0.45));
      return Math.max(lit(d, s), lit(sdSeg(x, y, 11.5, -5.2 - lift, 18.5, -5.2 - lift, 0.4), s, 0.6));
    },
  },

  // --- Video
  scared: {
    fixed: true,
    shape: (x, y, t, s) => (x < -4 || x > 34 || y > 27 ? 0 : quilt(x, y, scaredEdge(x, t), s)),
    occlude: (x, y, t) => (y > scaredEdge(x, t) - 0.7 ? 1 : 0),
  },
  tears: {
    shape: () => 0,
    dots(t) {
      const out: CostumeDot[] = [];
      for (const [ex, phase] of [[6.5, 0], [23.5, 0.5]]) {
        const p = (t * 0.7 + phase) % 1;
        out.push([ex, Math.round(14 + p * 9), p < 0.75 ? 1 : (1 - p) / 0.25]);
      }
      return out;
    },
  },
  glasses3d: {
    head: true,
    gazeFollow: true,
    shape(x, y, _t, s) {
      let d = Infinity;
      for (const cx of [9, 21]) d = Math.min(d, Math.abs(sdRoundBox(x - cx, y - 8.5, 5.7, 5.2, 1.2)) - 0.7);
      d = Math.min(d, sdSeg(x, y, 14.4, 6.6, 15.6, 6.6, 0.6), sdSeg(x, y, 3.3, 6, 0.6, 5.2, 0.5), sdSeg(x, y, 26.7, 6, 29.4, 5.2, 0.5));
      let b = lit(d, s);
      // Una lente "colorata": righe fitte.
      if (sdRoundBox(x - 9, y - 8.5, 5, 4.5, 1) < 0 && Math.sin((x - y) * 1.6) > 0.55) b = Math.max(b, 0.4);
      return b;
    },
  },
  progress: {
    fixed: true,
    shape(x, y, t, s, value) {
      const p = value ?? (t % 24) / 24;
      return Math.max(lit(sdSeg(x, y, 4, 24.2, 26, 24.2, 0.3), s, 0.35), lit(sdSeg(x, y, 4, 24.2, 4 + 22 * p, 24.2, 0.6), s));
    },
  },
  pause: {
    shape(x, y, t, s) {
      const a = 0.55 + 0.45 * Math.abs(Math.sin(t * 1.5));
      return lit(Math.min(sdSeg(x, y, 13.4, -7.6, 13.4, -2.6, 0.8), sdSeg(x, y, 16.6, -7.6, 16.6, -2.6, 0.8)), s, a);
    },
  },
  confetti: {
    shape(x, y, t, s) {
      // Due manine che applaudono.
      const gap = 4.2 - 3 * Math.abs(Math.sin(t * 5));
      return Math.max(lit(sdCircle(x, y, 15 - gap - 1.4, 21.6, 1.6), s), lit(sdCircle(x, y, 15 + gap + 1.4, 21.6, 1.6), s));
    },
    dots(t) {
      const out: CostumeDot[] = [];
      for (let i = 0; i < 16; i++) {
        out.push([Math.round(-4 + ((i * 13) % 40) + Math.sin(t * 3 + i) * 1.2), Math.round(-8 + ((t * 5 + i * 3.7) % 34)), Math.floor(t * 6 + i) % 3 === 0 ? 0.4 : 1]);
      }
      return out;
    },
  },
};
