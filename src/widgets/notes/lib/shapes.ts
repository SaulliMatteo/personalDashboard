/**
 * Forme automatiche della penna: si disegna un tratto, si tiene fermo il puntatore e il tratto
 * diventa una forma pulita (retta, freccia, rettangolo, cerchio/ellisse, triangolo, poligono).
 *
 * Logica PURA: niente DOM, orologio e soglie iniettati, così si prova con uno script .mts
 * lanciato con node. Le coordinate sono quelle dei tratti (normalizzate sulla larghezza della
 * pagina), ma tutte le soglie sono relative alla grandezza del tratto, quindi valgono a ogni scala.
 */

export type Pt = readonly [number, number];

export type Shape =
  | { kind: "line"; a: Pt; b: Pt }
  | { kind: "arrow"; a: Pt; b: Pt; head: number }
  | { kind: "rect"; c: Pt; w: number; h: number; angle: number }
  | { kind: "ellipse"; c: Pt; rx: number; ry: number; angle: number }
  | { kind: "polygon"; vertices: Pt[] };

export interface Recognized {
  shape: Shape;
  /** 0..1: quanto il tratto somiglia alla forma. */
  confidence: number;
}

// ---------------------------------------------------------------------
// Tenere premuto

export interface HoldOptions {
  now: () => number;
  /** Tempo fermo che fa scattare la forma. */
  holdMs?: number;
  /** Movimento ammesso mentre si tiene fermo (stesse unità dei punti). */
  tolerance: number;
}

export interface HoldDetector {
  /** Nuovo punto del tratto. */
  feed(p: Pt): void;
  /** True una sola volta, quando il puntatore è rimasto fermo abbastanza a lungo. */
  check(): boolean;
  reset(): void;
}

export function createHoldDetector({ now, holdMs = 500, tolerance }: HoldOptions): HoldDetector {
  let anchor: Pt | null = null;
  let since = 0;
  let fired = false;
  return {
    feed(p) {
      if (fired) return;
      if (!anchor || dist(p, anchor) > tolerance) {
        anchor = p;
        since = now();
      }
    },
    check() {
      if (fired || !anchor || now() - since < holdMs) return false;
      fired = true;
      return true;
    },
    reset() {
      anchor = null;
      fired = false;
    },
  };
}

// ---------------------------------------------------------------------
// Geometria

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function pathLength(pts: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

function rotate(p: Pt, c: Pt, angle: number, scale = 1): Pt {
  const cos = Math.cos(angle) * scale;
  const sin = Math.sin(angle) * scale;
  const x = p[0] - c[0];
  const y = p[1] - c[1];
  return [c[0] + x * cos - y * sin, c[1] + x * sin + y * cos];
}

/** Angolo tra due vettori, 0..π. */
function angleBetween(ux: number, uy: number, vx: number, vy: number): number {
  const lu = Math.hypot(ux, uy);
  const lv = Math.hypot(vx, vy);
  if (lu === 0 || lv === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv))));
}

/** Punti equidistanti lungo il percorso (la densità dei punti non pesa sulle stime). */
function resample(pts: readonly Pt[], n: number): Pt[] {
  const total = pathLength(pts);
  if (total === 0 || pts.length < 2) return [pts[0]];
  const step = total / (n - 1);
  const out: Pt[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length && out.length < n; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let d = dist(a, b);
    while (d > 0 && acc + d >= step && out.length < n) {
      const t = (step - acc) / d;
      const q: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      out.push(q);
      a = q;
      d = dist(a, b);
      acc = 0;
    }
    acc += d;
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out;
}

/** Ramer–Douglas–Peucker: indici dei vertici che restano. */
function rdp(pts: readonly Pt[], eps: number, from = 0, to = pts.length - 1, out: number[] = [from]): number[] {
  let maxD = 0;
  let idx = -1;
  for (let i = from + 1; i < to; i++) {
    const d = distToSegment(pts[i], pts[from], pts[to]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (idx !== -1 && maxD > eps) {
    rdp(pts, eps, from, idx, out);
    rdp(pts, eps, idx, to, out);
  } else {
    out.push(to);
  }
  return out;
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** Distanza massima dei punti dal contorno chiuso del poligono. */
function polygonDeviation(pts: readonly Pt[], vertices: readonly Pt[]): number {
  let max = 0;
  for (const p of pts) {
    let best = Infinity;
    for (let i = 0; i < vertices.length; i++) best = Math.min(best, distToSegment(p, vertices[i], vertices[(i + 1) % vertices.length]));
    max = Math.max(max, best);
  }
  return max;
}

/** Porta un angolo a un multiplo di `step` se ci è entro `within`. */
function snapAngle(angle: number, step: number, within: number): number {
  const k = Math.round(angle / step) * step;
  return Math.abs(angle - k) <= within ? k : angle;
}

// ---------------------------------------------------------------------
// Riconoscimento

export interface RecognizeOptions {
  /** Grandezza minima del tratto (diagonale del riquadro): sotto è un puntino, resta a mano. */
  minSize: number;
  /** Punti finali entro questa distanza dall'ultimo sono il "tenere fermo" e si tolgono. */
  tailTolerance?: number;
  /** Scarto ammesso per la retta, rispetto alla sua lunghezza. */
  lineTolerance?: number;
  /** Scarto medio del raggio ammesso per l'ellisse. */
  ellipseTolerance?: number;
  /** Scarto ammesso per i poligoni, rispetto alla diagonale. */
  polygonTolerance?: number;
  /** Quanto può gonfiarsi un lato del poligono rispetto alla sua lunghezza. */
  bulgeTolerance?: number;
  /** Estremi più vicini di questa frazione del percorso = tratto chiuso. */
  closeRatio?: number;
  /** Sotto questa sicurezza il tratto resta a mano libera. */
  minConfidence?: number;
}

const DEG = Math.PI / 180;

/** Riconosce la forma di un tratto; null = nessuna con sicurezza sufficiente. */
export function recognizeShape(input: readonly Pt[], opts: RecognizeOptions): Recognized | null {
  const {
    minSize,
    tailTolerance = 0,
    lineTolerance = 0.06,
    ellipseTolerance = 0.11,
    polygonTolerance = 0.09,
    bulgeTolerance = 0.11,
    closeRatio = 0.2,
    minConfidence = 0.3,
  } = opts;

  // Toglie la coda ferma (il tenere premuto) lasciando il primo punto del gruppo.
  let end = input.length - 1;
  while (end > 1 && dist(input[end - 1], input[input.length - 1]) <= tailTolerance) end--;
  const pts = input.slice(0, end + 1);
  if (pts.length < 2) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const diag = Math.hypot(maxX - minX, maxY - minY);
  if (diag < minSize) return null;

  const first = pts[0];
  const last = pts[pts.length - 1];
  const chord = dist(first, last);
  const total = pathLength(pts);
  const candidates: Recognized[] = [];
  const push = (shape: Shape, error: number, tol: number, weight = 1) => {
    const confidence = Math.max(0, 1 - error / tol) * weight;
    if (confidence > 0) candidates.push({ shape, confidence });
  };

  const closed = chord <= closeRatio * total;

  if (!closed) {
    // Retta: tutti i punti vicini alla corda, e il percorso non torna indietro.
    let dev = 0;
    for (const p of pts) dev = Math.max(dev, distToSegment(p, first, last));
    if (chord > 0 && total / chord < 1.25) {
      const angle = Math.atan2(last[1] - first[1], last[0] - first[0]);
      const snapped = snapAngle(angle, 90 * DEG, 3 * DEG);
      push({ kind: "line", a: first, b: rotate(last, first, snapped - angle) }, dev / chord, lineTolerance);
    }

    // Freccia: asta lunga e poi la punta (uno o due segmenti corti indietro, vicino al vertice).
    const arrow = recognizeArrow(pts, diag);
    if (arrow) push(arrow.shape, arrow.error, lineTolerance);
  } else {
    const sample = resample(pts, 72);
    // Il primo e l'ultimo punto quasi coincidono: tolgo l'ultimo.
    const ring = sample.slice(0, -1);

    // Ellisse: centro e assi dalla covarianza dei punti equidistanti.
    const ellipse = fitEllipse(ring);
    if (ellipse) push(ellipse.shape, ellipse.error, ellipseTolerance);

    // Poligoni: vertici dal percorso chiuso.
    const poly = fitPolygon(ring, diag * polygonTolerance * 0.7);
    if (poly) {
      // Errore relativo (1 = al limite): scarto dal contorno e lati non dritti.
      const error = Math.max(polygonDeviation(ring, poly.vertices) / diag / polygonTolerance, poly.bulge / bulgeTolerance);
      const before = candidates.length;
      push(polygonShape(poly.vertices), error, 1);
      // Lati dritti: anche un esagono somiglia a un cerchio, ma un cerchio non ha mai lati dritti
      // (come poligono ha sempre sicurezza ~0), quindi qui vince il poligono.
      if (candidates.length > before && candidates[candidates.length - 1].confidence >= 0.15) {
        const poly = candidates.pop()!;
        candidates.length = 0;
        candidates.push({ shape: poly.shape, confidence: Math.max(poly.confidence, minConfidence) });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((x, y) => y.confidence - x.confidence);
  const best = candidates[0];
  return best.confidence >= minConfidence ? best : null;
}

function recognizeArrow(pts: readonly Pt[], diag: number): { shape: Shape; error: number } | null {
  const idx = rdp(pts, diag * 0.06);
  if (idx.length < 3 || idx.length > 6) return null;
  const a = pts[idx[0]];
  const tip = pts[idx[1]];
  const shaft = dist(a, tip);
  if (shaft < diag * 0.6) return null;
  // Lo scarto dell'asta dalla sua corda.
  let dev = 0;
  for (let i = idx[0]; i <= idx[1]; i++) dev = Math.max(dev, distToSegment(pts[i], a, tip));
  const back: [number, number] = [a[0] - tip[0], a[1] - tip[1]];
  const barbs: Pt[] = [];
  for (let k = 2; k < idx.length; k++) {
    const v = pts[idx[k]];
    const d = dist(v, tip);
    if (d > shaft * 0.45) return null;
    if (d < shaft * 0.06) continue; // ritorno sul vertice
    const ang = angleBetween(v[0] - tip[0], v[1] - tip[1], back[0], back[1]);
    if (ang < 12 * DEG || ang > 80 * DEG) return null;
    barbs.push(v);
  }
  if (barbs.length === 0 || barbs.length > 2) return null;
  const head = barbs.reduce((s, v) => s + dist(v, tip), 0) / barbs.length;
  return { shape: { kind: "arrow", a, b: tip, head }, error: dev / shaft };
}

function fitEllipse(ring: readonly Pt[]): { shape: Shape; error: number } | null {
  const n = ring.length;
  if (n < 8) return null;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of ring) {
    cx += x;
    cy += y;
  }
  cx /= n;
  cy /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of ring) {
    sxx += (x - cx) ** 2;
    syy += (y - cy) ** 2;
    sxy += (x - cx) * (y - cy);
  }
  sxx /= n;
  syy /= n;
  sxy /= n;
  let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let su = 0;
  let sv = 0;
  for (const [x, y] of ring) {
    const u = (x - cx) * cos + (y - cy) * sin;
    const v = -(x - cx) * sin + (y - cy) * cos;
    su += u * u;
    sv += v * v;
  }
  // Per un'ellisse la varianza lungo un asse è r²/2 (circa, con punti equidistanti).
  let rx = Math.sqrt((2 * su) / n);
  let ry = Math.sqrt((2 * sv) / n);
  if (rx === 0 || ry === 0) return null;
  // Il tratto deve girare tutto attorno al centro.
  let swept = 0;
  for (let i = 1; i < n; i++) {
    const a0 = Math.atan2(ring[i - 1][1] - cy, ring[i - 1][0] - cx);
    const a1 = Math.atan2(ring[i][1] - cy, ring[i][0] - cx);
    let d = a1 - a0;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    swept += d;
  }
  if (Math.abs(swept) < 300 * DEG) return null;
  let error = 0;
  for (const [x, y] of ring) {
    const u = (x - cx) * cos + (y - cy) * sin;
    const v = -(x - cx) * sin + (y - cy) * cos;
    error += Math.abs(Math.hypot(u / rx, v / ry) - 1);
  }
  error /= n;
  if (Math.min(rx, ry) / Math.max(rx, ry) > 0.88) {
    rx = ry = (rx + ry) / 2; // cerchio
    angle = 0;
  } else {
    angle = snapAngle(angle, 90 * DEG, 6 * DEG);
  }
  return { shape: { kind: "ellipse", c: [cx, cy], rx, ry, angle }, error };
}

/** Vertici di un percorso chiuso (senza ripetere il primo alla fine). */
function fitPolygon(ring: readonly Pt[], eps: number): { vertices: Pt[]; bulge: number } | null {
  // Si parte dal punto più lontano dal primo, così il punto d'inizio non diventa per forza un vertice.
  let far = 0;
  for (let i = 1; i < ring.length; i++) if (dist(ring[i], ring[0]) > dist(ring[far], ring[0])) far = i;
  if (far === 0) return null;
  const loop = [...ring, ring[0]];
  const a = rdp(loop, eps, 0, far);
  const b = rdp(loop, eps, far, loop.length - 1);
  let idx = [...a, ...b.slice(1, -1)];
  // Toglie i vertici quasi allineati con i vicini (es. il punto d'inizio a metà di un lato).
  let changed = true;
  while (changed && idx.length > 3) {
    changed = false;
    for (let i = 0; i < idx.length; i++) {
      const prev = loop[idx[(i + idx.length - 1) % idx.length]];
      const next = loop[idx[(i + 1) % idx.length]];
      if (distToSegment(loop[idx[i]], prev, next) < eps || dist(loop[idx[i]], next) < eps) {
        idx = idx.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  if (idx.length < 3 || idx.length > 8) return null;
  // RDP può fermarsi a un paio di punti dall'angolo vero: ogni vertice si sposta, tra i vicini,
  // sul punto più lontano dalla retta dei due vertici accanto (lo spigolo).
  const ringLen = loop.length - 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < idx.length; k++) {
      const prev = loop[idx[(k + idx.length - 1) % idx.length]];
      const next = loop[idx[(k + 1) % idx.length]];
      let best = idx[k];
      let bestD = -1;
      for (let o = -4; o <= 4; o++) {
        const i = (idx[k] + o + ringLen) % ringLen;
        const d = distToSegment(loop[i], prev, next);
        if (d > bestD) {
          bestD = d;
          best = i;
        }
      }
      idx[k] = best;
    }
  }
  idx.sort((x, y) => x - y);
  const vertices = idx.map((i) => loop[i]);
  // Quanto si gonfia ogni lato rispetto alla sua corda: in un poligono i lati sono dritti,
  // in un cerchio "spezzato" in lati no (esagono ≈ 0,13, pentagono ≈ 0,16).
  let bulge = 0;
  for (let k = 0; k < idx.length; k++) {
    const from = idx[k];
    const to = k + 1 < idx.length ? idx[k + 1] : loop.length - 1 + idx[0];
    const p = loop[from];
    const q = loop[to % (loop.length - 1)];
    const len = dist(p, q);
    if (len === 0) continue;
    let dev = 0;
    for (let i = from; i <= to; i++) dev = Math.max(dev, distToSegment(loop[i % (loop.length - 1)], p, q));
    bulge = Math.max(bulge, dev / len);
  }
  // Solo poligoni semplici: lati che non si incrociano.
  const m = vertices.length;
  for (let i = 0; i < m; i++) {
    for (let j = i + 2; j < m; j++) {
      if (i === 0 && j === m - 1) continue;
      if (segmentsCross(vertices[i], vertices[(i + 1) % m], vertices[j], vertices[(j + 1) % m])) return null;
    }
  }
  return { vertices, bulge };
}

/** Quattro vertici quasi ad angolo retto → rettangolo (quadrato se i lati sono quasi uguali). */
function polygonShape(vertices: Pt[]): Shape {
  if (vertices.length === 4) {
    const right = vertices.every((v, i) => {
      const p = vertices[(i + 3) % 4];
      const n = vertices[(i + 1) % 4];
      return Math.abs(angleBetween(p[0] - v[0], p[1] - v[1], n[0] - v[0], n[1] - v[1]) - 90 * DEG) < 18 * DEG;
    });
    if (right) {
      // Direzione media dei lati, ripiegata su 0..90°.
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < 4; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % 4];
        const t = Math.atan2(b[1] - a[1], b[0] - a[0]) * 4; // ×4: i lati a 90° coincidono
        const len = dist(a, b);
        sx += Math.cos(t) * len;
        sy += Math.sin(t) * len;
      }
      const angle = snapAngle(Math.atan2(sy, sx) / 4, 90 * DEG, 8 * DEG);
      const c: Pt = [vertices.reduce((s, v) => s + v[0], 0) / 4, vertices.reduce((s, v) => s + v[1], 0) / 4];
      const local = vertices.map((v) => rotate(v, c, -angle));
      let w = Math.max(...local.map((v) => v[0])) - Math.min(...local.map((v) => v[0]));
      let h = Math.max(...local.map((v) => v[1])) - Math.min(...local.map((v) => v[1]));
      if (Math.abs(w - h) / Math.max(w, h) < 0.12) w = h = (w + h) / 2; // quadrato
      return { kind: "rect", c, w, h, angle };
    }
  }
  return { kind: "polygon", vertices };
}

// ---------------------------------------------------------------------
// Regolazione mentre si tiene premuto

export interface AdjustOptions {
  /** Shift: la retta (e la freccia) a 0/45/90°, le altre forme senza rotazione. */
  constrain?: boolean;
}

/** Centro della forma: perno di scala e rotazione. */
export function shapeCenter(shape: Shape): Pt {
  switch (shape.kind) {
    case "line":
    case "arrow":
      return [(shape.a[0] + shape.b[0]) / 2, (shape.a[1] + shape.b[1]) / 2];
    case "rect":
    case "ellipse":
      return shape.c;
    case "polygon": {
      const n = shape.vertices.length;
      return [shape.vertices.reduce((s, v) => s + v[0], 0) / n, shape.vertices.reduce((s, v) => s + v[1], 0) / n];
    }
  }
}

/**
 * Forma regolata: `grab` è dov'era il puntatore allo scatto, `pointer` dov'è adesso.
 * Si parte sempre dalla forma dello scatto, non da quella regolata prima.
 */
export function adjustShape(shape: Shape, grab: Pt, pointer: Pt, { constrain = false }: AdjustOptions = {}): Shape {
  if (shape.kind === "line" || shape.kind === "arrow") {
    let b: Pt = [shape.b[0] + pointer[0] - grab[0], shape.b[1] + pointer[1] - grab[1]];
    if (constrain) {
      const angle = Math.atan2(b[1] - shape.a[1], b[0] - shape.a[0]);
      b = rotate(b, shape.a, Math.round(angle / (45 * DEG)) * 45 * DEG - angle);
    }
    return { ...shape, b };
  }
  const c = shapeCenter(shape);
  const g0 = Math.hypot(grab[0] - c[0], grab[1] - c[1]);
  const g1 = Math.hypot(pointer[0] - c[0], pointer[1] - c[1]);
  if (g0 < 1e-6) return shape;
  const scale = Math.max(0.05, g1 / g0);
  const rot = constrain ? 0 : Math.atan2(pointer[1] - c[1], pointer[0] - c[0]) - Math.atan2(grab[1] - c[1], grab[0] - c[0]);
  switch (shape.kind) {
    case "rect":
      return { ...shape, w: shape.w * scale, h: shape.h * scale, angle: shape.angle + rot };
    case "ellipse":
      return { ...shape, rx: shape.rx * scale, ry: shape.ry * scale, angle: shape.rx === shape.ry ? 0 : shape.angle + rot };
    case "polygon":
      return { kind: "polygon", vertices: shape.vertices.map((v) => rotate(v, c, rot, scale)) };
  }
}

// ---------------------------------------------------------------------
// Dalla forma ai punti del tratto

function sampleSegment(out: Pt[], a: Pt, b: Pt, step: number) {
  const n = Math.max(1, Math.ceil(dist(a, b) / step));
  for (let i = 1; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
}

function samplePath(vertices: readonly Pt[], step: number, close: boolean): Pt[] {
  const out: Pt[] = [vertices[0]];
  for (let i = 1; i < vertices.length; i++) sampleSegment(out, vertices[i - 1], vertices[i], step);
  if (close) sampleSegment(out, vertices[vertices.length - 1], vertices[0], step);
  return out;
}

/** Vertici del rettangolo, in ordine. */
function rectCorners(shape: Extract<Shape, { kind: "rect" }>): Pt[] {
  const { c, w, h, angle } = shape;
  return ([
    [c[0] - w / 2, c[1] - h / 2],
    [c[0] + w / 2, c[1] - h / 2],
    [c[0] + w / 2, c[1] + h / 2],
    [c[0] - w / 2, c[1] + h / 2],
  ] as Pt[]).map((p) => rotate(p, c, angle));
}

/**
 * Punti del contorno, uno ogni `step` circa: è un tratto normale, quindi la gomma (che tocca
 * i punti) lo cancella come gli altri. La freccia è una polilinea sola che ripassa la punta.
 */
export function shapeToPoints(shape: Shape, step: number): [number, number][] {
  let pts: Pt[];
  switch (shape.kind) {
    case "line":
      pts = samplePath([shape.a, shape.b], step, false);
      break;
    case "arrow": {
      const { a, b } = shape;
      const len = dist(a, b);
      const head = Math.min(shape.head, len * 0.5) || len * 0.25;
      const ux = len > 0 ? (a[0] - b[0]) / len : 1;
      const uy = len > 0 ? (a[1] - b[1]) / len : 0;
      const back: Pt = [b[0] + ux * head, b[1] + uy * head];
      const left = rotate(back, b, 28 * DEG);
      const right = rotate(back, b, -28 * DEG);
      pts = samplePath([a, b, left, b, right], step, false);
      break;
    }
    case "rect":
      pts = samplePath(rectCorners(shape), step, true);
      break;
    case "polygon":
      pts = samplePath(shape.vertices, step, true);
      break;
    case "ellipse": {
      const { c, rx, ry, angle } = shape;
      // Perimetro (Ramanujan) per decidere quanti punti.
      const per = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
      const n = Math.max(24, Math.ceil(per / step));
      pts = [];
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * 2 * Math.PI;
        pts.push(rotate([c[0] + rx * Math.cos(t), c[1] + ry * Math.sin(t)], c, angle));
      }
      break;
    }
  }
  return pts.map((p) => [p[0], p[1]]);
}
