/**
 * Funzioni di distanza (SDF) nello spazio della faccia, in punti: < 0 dentro
 * la forma, > 0 fuori. Le usano faccia (faceShape.ts) e costumi (costumes.ts).
 */

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Luminosità 0..1 da una distanza: bordo morbido, più netto con `sharpness` alto. */
export function lit(d: number, sharpness: number, alpha = 1): number {
  return alpha * clamp(0.55 - d * sharpness, 0, 1);
}

export function sdRoundBox(px: number, py: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(px) - hx + r;
  const qy = Math.abs(py) - hy + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

/** Segmento da (ax, ay) a (bx, by) con spessore `r`. */
export function sdSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number, r: number): number {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}

/** Segmento che si assottiglia: spessore `ra` in A, `rb` in B (punte di fiamma, lame). */
export function sdTaper(px: number, py: number, ax: number, ay: number, bx: number, by: number, ra: number, rb: number): number {
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp(((px - ax) * bax + (py - ay) * bay) / (bax * bax + bay * bay), 0, 1);
  return Math.hypot(px - ax - bax * h, py - ay - bay * h) - (ra + (rb - ra) * h);
}

export function sdCircle(px: number, py: number, cx: number, cy: number, r: number): number {
  return Math.hypot(px - cx, py - cy) - r;
}

/** Ellisse approssimata (abbastanza precisa per forme piccole). */
export function sdEllipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number): number {
  return (Math.hypot((px - cx) / rx, (py - cy) / ry) - 1) * Math.min(rx, ry);
}

/** Unione morbida di due forme. */
export function smin(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}

/** Il punto (x, y) è nel triangolo ABC. */
export function inTriangle(x: number, y: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  const s1 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  const s2 = (cx - bx) * (y - by) - (cy - by) * (x - bx);
  const s3 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

/** Ruota (x, y) di `-a` intorno a (px, py): per disegnare una forma ruotata di `a`. */
export function rotate(x: number, y: number, px: number, py: number, a: number): [number, number] {
  const c = Math.cos(-a);
  const s = Math.sin(-a);
  return [px + (x - px) * c - (y - py) * s, py + (x - px) * s + (y - py) * c];
}
