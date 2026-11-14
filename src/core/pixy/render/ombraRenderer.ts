import type { FaceFrame } from "../engine/animator";
import type { EmotionId, EyeParams, GlyphId } from "../engine/face";
import type { CostumeId, PoseId } from "../engine/poses";
import { costumeDots, costumeField, glyphPlacement } from "./faceShape";
import { paintField } from "./solidRenderer";

/**
 * Il Pixy di Ombra (mockup "Temi Vetro e Ombra", `pixyO()`): non una faccia nello spazio dei punti ma un corpo.
 *  - "shadow" (variante Ombra): corpo nero con la base a tentacoli e il bordo che luccica, occhi chiari luminosi;
 *  - "flame" (variante Fiamma): globo bianco con cinque fiamme e un alone dorato, occhi grigi.
 *
 * Si disegna nel riquadro 100×100 del mockup. Le forme non sono pose fisse: vengono dai parametri continui
 * dell'animatore (apertura, palpebre, inclinazione, bocca), così battiti di ciglia e passaggi tra pose restano
 * fluidi come negli altri stili. Gli oggetti del mockup (libro, cuffia, coperta…) sostituiscono i costumi
 * corrispondenti; gli altri costumi si disegnano come negli stili a punti, nel colore degli occhi.
 * I colori vengono dai token `--pixy-*` (tokens.css); l'inchiostro è il colore della faccia scelto dall'utente.
 */

export type OmbraBody = "shadow" | "flame";

export interface OmbraOptions {
  body: OmbraBody;
  /** Colore degli occhi e dei tratti (--face-on o --accent). */
  color: string;
  showMouth: boolean;
  /** Pixel reali per pixel CSS. */
  dpr: number;
  /** Come negli altri stili: grandezza massima di un punto della faccia, in pixel CSS (un punto = 2 unità qui). */
  maxPointSize: number;
  /** Margine intorno alla faccia, in punti (8 = quello di sempre). */
  padding: number;
}

// ----------------------------------------------------------------- colori

const TOKENS = [
  "body-1",
  "body-2",
  "body-3",
  "body-line",
  "body-glow",
  "ink-glow",
  "eye-dot",
  "halo",
  "flame",
  "flame-line",
  "flame-glow",
  "deco",
  "fill",
  "pop",
  "blush",
  "steel",
  "cool",
  "screen",
  "lens-l",
  "lens-r",
  "mask",
] as const;
type Palette = Record<(typeof TOKENS)[number], string>;

const paletteCache = new WeakMap<HTMLCanvasElement, { key: string; palette: Palette }>();

/** I token del Pixy, letti dal canvas (o dalla radice, per i canvas fuori pagina delle notifiche) e tenuti finché tema e modo non cambiano. */
function paletteFor(canvas: HTMLCanvasElement): Palette {
  const root = document.documentElement;
  const key = `${root.dataset.theme}|${root.dataset.mode}|${canvas.isConnected}`;
  const cached = paletteCache.get(canvas);
  if (cached && cached.key === key) return cached.palette;
  const css = getComputedStyle(canvas.isConnected ? canvas : root);
  const palette = Object.fromEntries(TOKENS.map((t) => [t, css.getPropertyValue(`--pixy-${t}`).trim() || "transparent"])) as Palette;
  paletteCache.set(canvas, { key, palette });
  return palette;
}

// ----------------------------------------------------------------- stato per canvas

/**
 * Altezza della fiamma, schiacciamento e rimpicciolimento dell'ombra: cambiano con l'espressione, quindi vanno
 * avvicinati piano come fa l'animatore con la faccia. Per canvas: un canvas nuovo (le notifiche) parte già arrivato.
 */
interface BodyState {
  flame: number;
  squash: number;
  small: number;
}
const bodyStates = new WeakMap<HTMLCanvasElement, BodyState>();

const FLAME_BY_EMOTION: Partial<Record<EmotionId, number>> = {
  angry: 1.7,
  excited: 1.8,
  proud: 1.8,
  determined: 1.4,
  laugh: 1.3,
  happy: 1.1,
  sad: 0.5,
  sleepy: 0.5,
  sleep: 0.3,
  bored: 0.6,
  relaxed: 0.7,
  cold: 0.35,
};

function targetState(frame: FaceFrame): BodyState {
  const hot = frame.costume?.id === "flame";
  const e = frame.emotion;
  return {
    flame: hot ? 1.9 : ((e && FLAME_BY_EMOTION[e]) ?? 1),
    // L'ombra si scioglie in una pozza quando dorme o è triste, e si rimpicciolisce col caldo.
    squash: e === "sleep" || e === "sad" ? 0.6 : 1,
    small: hot ? 0.8 : 1,
  };
}

function bodyState(canvas: HTMLCanvasElement, frame: FaceFrame): BodyState {
  const target = targetState(frame);
  const prev = bodyStates.get(canvas);
  if (!prev) {
    bodyStates.set(canvas, target);
    return target;
  }
  const k = 0.12;
  prev.flame += (target.flame - prev.flame) * k;
  prev.squash += (target.squash - prev.squash) * k;
  prev.small += (target.small - prev.small) * k;
  return prev;
}

// ----------------------------------------------------------------- forme

const SHADOW_BODY = new Path2D(
  "M16 52 C16 28 32 12 50 12 C68 12 84 28 84 52 L84 80 C80 86 76 78 72 84 C68 92 62 80 58 86 C54 94 46 82 42 88 C38 94 32 80 28 86 C24 92 20 82 16 86 Z"
);

/** Le cinque fiamme sopra il globo: centro, altezza, mezza larghezza. */
const FLAMES: [number, number, number][] = [
  [38, 13, 5],
  [50, 20, 6.5],
  [62, 12, 5],
  [44, 9, 3.5],
  [56, 10, 3.5],
];

/** Espressioni con le scintille negli occhi (Fiamma). */
const SPARK_EYES = new Set<EmotionId>(["focused", "excited", "proud", "determined", "aim"]);
/** Espressioni con la maschera (Ombra): quando studia o lavora sparisce dietro una maschera. */
const MASKED = new Set<EmotionId>(["focused", "serious"]);
/** Costumi disegnati come oggetti del mockup: gli altri vanno a punti. */
const VECTOR_COSTUMES = new Set<CostumeId>([
  "flame",
  "snow",
  "nightcap",
  "blanket",
  "book",
  "book_math",
  "book_science",
  "book_lang",
  "book_history",
  "book_art",
  "book_code",
  "sword",
  "popcorn",
  "glasses3d",
  "progress",
  "pause",
  "confetti",
]);
const SUBJECT_SYMBOL: Partial<Record<CostumeId, string>> = {
  book_math: "∫ dx",
  book_science: "H₂O",
  book_lang: "Aa",
  book_history: "1789",
  book_art: "✦",
  book_code: "</>",
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function star4(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const q = r * 0.28;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + q, y - q);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + q, y + q);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - q, y + q);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - q, y - q);
  ctx.closePath();
}

function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  // Il cuore del mockup (punta in basso a 78,30), scalato da k intorno al suo centro.
  const p = (dx: number, dy: number): [number, number] => [x + dx * k, y + dy * k];
  ctx.beginPath();
  ctx.moveTo(...p(0, 5));
  ctx.bezierCurveTo(...p(-4, 1), ...p(-6, -3), ...p(-3, -5));
  ctx.bezierCurveTo(...p(-1, -7), ...p(0, -5), ...p(0, -4));
  ctx.bezierCurveTo(...p(0, -5), ...p(1, -7), ...p(3, -5));
  ctx.bezierCurveTo(...p(6, -3), ...p(4, 1), ...p(0, 5));
  ctx.closePath();
}

// ----------------------------------------------------------------- disegno

interface Ctx {
  ctx: CanvasRenderingContext2D;
  P: Palette;
  ink: string;
  sun: boolean;
  /** Pixel reali per unità del riquadro 100×100. */
  s: number;
}

/** Bagliore degli occhi dell'ombra (il filtro `g` del mockup); niente per la fiamma. */
function glowOn(c: Ctx): void {
  if (!c.sun) return;
  c.ctx.shadowColor = c.P["ink-glow"];
  c.ctx.shadowBlur = 2.2 * c.s;
}

function glowOff(c: Ctx): void {
  c.ctx.shadowColor = "transparent";
  c.ctx.shadowBlur = 0;
}

function strokeInk(c: Ctx, width: number): void {
  const { ctx } = c;
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawShadowBody(c: Ctx): void {
  const { ctx, P } = c;
  const g = ctx.createRadialGradient(50, 44.8, 0, 50, 44.8, 46);
  g.addColorStop(0, P["body-1"]);
  g.addColorStop(0.7, P["body-2"]);
  g.addColorStop(1, P["body-3"]);
  ctx.shadowColor = P["body-glow"];
  ctx.shadowBlur = 4.8 * c.s;
  ctx.fillStyle = g;
  ctx.fill(SHADOW_BODY);
  glowOff(c);
  ctx.strokeStyle = P["body-line"];
  ctx.lineWidth = 0.8;
  ctx.stroke(SHADOW_BODY);
}

function drawFlameBody(c: Ctx, f: number): void {
  const { ctx, P } = c;
  // Alone: un disco dorato sfumato (al posto del filtro blur del mockup, che non c'è in ogni WebView).
  const halo = ctx.createRadialGradient(50, 54, 0, 50, 54, 46);
  halo.addColorStop(0, P.halo);
  halo.addColorStop(0.62, P.halo);
  halo.addColorStop(1, "transparent");
  ctx.globalAlpha = clamp(0.22 + f * 0.12, 0, 1);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(50, 54, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.shadowColor = P["flame-glow"];
  ctx.shadowBlur = 3.2 * c.s;
  ctx.fillStyle = P.flame;
  ctx.strokeStyle = P["flame-line"];
  ctx.lineWidth = 0.7;
  for (const [cx, h0, w] of FLAMES) {
    const h = h0 * f;
    const base = 34;
    ctx.beginPath();
    ctx.moveTo(cx - w, base);
    ctx.bezierCurveTo(cx - w, base - h * 0.5, cx - w * 0.2, base - h * 0.6, cx, base - h);
    ctx.bezierCurveTo(cx + w * 0.3, base - h * 0.6, cx + w, base - h * 0.5, cx + w, base);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  glowOff(c);

  const g = ctx.createRadialGradient(47, 46.8, 0, 47, 46.8, 39);
  g.addColorStop(0, P["body-1"]);
  g.addColorStop(0.65, P["body-2"]);
  g.addColorStop(1, P["body-3"]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(50, 54, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = P["body-line"];
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

/** Un occhio. `inner` = da che parte sta il naso (+1 per l'occhio sinistro). */
function drawEye(c: Ctx, x: number, y: number, e: EyeParams, inner: 1 | -1, emotion: EmotionId | undefined): void {
  const { ctx, sun, P } = c;
  const open = Math.max(0, e.open);
  ctx.fillStyle = c.ink;

  if (e.heart > 0.5) {
    glowOn(c);
    heartPath(ctx, x, y, sun ? 1.3 : 0.9);
    ctx.fill();
    glowOff(c);
    return;
  }

  // Chiuso (anche a metà battito di ciglia): un arco verso il basso.
  if (open < 0.3) {
    const w = sun ? 7 : 5;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x, y + (sun ? 4 : 3.5), x + w, y);
    glowOn(c);
    strokeInk(c, sun ? 2 : 1.6);
    glowOff(c);
    return;
  }

  // Felice: mezzaluna all'insù.
  if (e.lidBottom > 0.45 && e.lidTop < 0.35) {
    const w = sun ? 7 : 5;
    ctx.beginPath();
    ctx.moveTo(x - w, y + 2);
    ctx.quadraticCurveTo(x, y - (sun ? 6 : 4), x + w, y + 2);
    glowOn(c);
    strokeInk(c, sun ? 2.2 : 1.6);
    glowOff(c);
    return;
  }

  const h = e.scaleY * Math.min(1, open);
  const wide = 1 + Math.max(0, e.scaleY - 1) * 1.5;

  if (sun) {
    // Mandorla: palpebra superiore che si appiattisce (socchiuso), inclinazione (arrabbiato/triste).
    const roll = emotion === "bored";
    const lidTop = roll ? 0 : e.lidTop;
    const hw = 8 * e.scaleX;
    const innerX = x + inner * hw;
    const outerX = x - inner * hw;
    const innerY = y + e.tilt * 5;
    const outerY = y - e.tilt * 5;
    const top = y - 7 * h * wide * Math.max(0, 1 - lidTop * 1.6) * (1 - Math.min(0.7, Math.abs(e.tilt)));
    const bottom = y + 5 * h * wide * (1 - e.lidBottom * 0.7);
    ctx.beginPath();
    ctx.moveTo(outerX, outerY);
    ctx.quadraticCurveTo(x, top, innerX, innerY);
    ctx.quadraticCurveTo(x, bottom, outerX, outerY);
    ctx.closePath();
    glowOn(c);
    ctx.fill();
    glowOff(c);
    // Annoiato: occhi al cielo, la pupilla in alto.
    if (roll) {
      ctx.fillStyle = P["eye-dot"];
      ctx.beginPath();
      ctx.arc(x, y - 1.6, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // Fiamma: ellisse con il riflesso, tagliata dalla palpebra.
  const rx = 3.4 * e.scaleX;
  const ry = 4.4 * h;
  ctx.save();
  if (e.lidTop > 0.02 || Math.abs(e.tilt) > 0.02) {
    const lid = y - ry + 2 * ry * e.lidTop * 0.85;
    ctx.beginPath();
    ctx.moveTo(x - inner * (rx + 1), lid - e.tilt * 2.4 - Math.abs(e.tilt));
    ctx.lineTo(x + inner * (rx + 1), lid + e.tilt * 2.4 - Math.abs(e.tilt));
    ctx.lineTo(x + inner * (rx + 1), y + ry + 1);
    ctx.lineTo(x - inner * (rx + 1), y + ry + 1);
    ctx.closePath();
    ctx.clip();
  }
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  if (emotion && SPARK_EYES.has(emotion)) {
    ctx.fillStyle = P["eye-dot"];
    ctx.strokeStyle = P.deco;
    ctx.lineWidth = 0.6;
    star4(ctx, x + 1.2, y - 1.4, 2.4);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = P["eye-dot"];
    ctx.beginPath();
    ctx.arc(x + 1.2 * e.scaleX, y - 1.6 * h, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBrows(c: Ctx, lx: number, rx: number, by: number, frame: FaceFrame): void {
  const { ctx, sun } = c;
  const { left, right } = frame.face;
  const bw = sun ? 7 : 5;
  const brow = (x: number, a: number) => {
    ctx.beginPath();
    ctx.moveTo(x - bw, by + a);
    ctx.lineTo(x + bw, by - a);
    glowOn(c);
    strokeInk(c, sun ? 1.8 : 1.4);
    glowOff(c);
  };
  const tilt = (left.tilt + right.tilt) / 2;
  if (Math.abs(tilt) > 0.12) {
    const a = clamp(tilt * 4.5, -3, 3);
    brow(lx, -a);
    brow(rx, a);
    return;
  }
  // Un sopracciglio alzato sull'occhio più aperto (curioso).
  const dl = left.scaleY - left.lidTop;
  const dr = right.scaleY - right.lidTop;
  if (Math.abs(dl - dr) > 0.25) {
    if (dl > dr) brow(lx, 2);
    else brow(rx, -2);
    return;
  }
  // Fiamma concentrata: sopracciglia dritte.
  if (!sun && frame.emotion && SPARK_EYES.has(frame.emotion) && frame.emotion !== "excited") {
    brow(lx, 0);
    brow(rx, 0);
  }
}

function drawMouth(c: Ctx, mx: number, my: number, frame: FaceFrame): void {
  const { ctx, sun } = c;
  const { mouthCurve: curve, mouthOpen: open, mouthWidth: width } = frame.face;
  const hw = 3 + width * 9;
  glowOn(c);
  if (open > 0.35 && curve > 0.5) {
    if (sun) {
      // Ghigno a denti di sega.
      const k = hw / 12;
      const X = (dx: number) => mx + dx * k;
      ctx.beginPath();
      ctx.moveTo(X(-12), my - 2);
      ctx.lineTo(X(12), my - 2);
      ctx.lineTo(X(8), my + 5);
      ctx.lineTo(X(4), my);
      ctx.lineTo(X(0), my + 6);
      ctx.lineTo(X(-4), my);
      ctx.lineTo(X(-8), my + 5);
      ctx.closePath();
      ctx.fillStyle = c.ink;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(mx - hw * 0.8, my);
      ctx.quadraticCurveTo(mx, my + 4 + open * 5, mx + hw * 0.8, my);
      ctx.closePath();
      ctx.fillStyle = c.ink;
      ctx.fill();
    }
  } else if (open > 0.3) {
    ctx.beginPath();
    ctx.ellipse(mx, my + 2, 1.6 + width * 2.5, 1.4 + open * 2.4, 0, 0, Math.PI * 2);
    strokeInk(c, 1.6);
  } else if (curve > 0.15) {
    const k = Math.min(1, curve / 0.8);
    ctx.beginPath();
    if (sun) {
      // Mezzo sorriso storto: l'angolo destro sale.
      ctx.moveTo(mx - hw * 0.75, my);
      ctx.quadraticCurveTo(mx + 2, my + 3 * k, mx + hw, my - 3 * k);
    } else {
      ctx.moveTo(mx - hw * 0.75, my);
      ctx.quadraticCurveTo(mx, my + 5 * k, mx + hw * 0.75, my);
    }
    strokeInk(c, sun ? 1.8 : 1.6);
  } else if (curve < -0.15) {
    const k = Math.min(1, -curve / 0.7);
    ctx.beginPath();
    ctx.moveTo(mx - hw * 0.75, my + 3 * k);
    ctx.quadraticCurveTo(mx, my - 2 * k, mx + hw * 0.75, my + 3 * k);
    strokeInk(c, 1.6);
  } else if (!sun) {
    // L'ombra a bocca neutra non ha bocca; la fiamma una linea.
    ctx.beginPath();
    ctx.moveTo(mx - hw * 0.5, my + 1);
    ctx.lineTo(mx + hw * 0.5, my + 1);
    strokeInk(c, 1.6);
  }
  glowOff(c);
}

function text(c: Ctx, t: string, x: number, y: number, size: number): void {
  const { ctx } = c;
  ctx.font = `italic 400 ${size}px Spectral, Georgia, serif`;
  ctx.fillStyle = c.ink;
  glowOn(c);
  ctx.fillText(t, x, y);
  glowOff(c);
}

/** Simboli dell'animatore, con gli stessi tempi degli altri stili (salgono, lampeggiano). */
function drawGlyph(c: Ctx, id: GlyphId, age: number, alpha: number): void {
  const { ctx, sun, P } = c;
  const place = glyphPlacement(id, age);
  const rest = glyphPlacement(id, 0);
  const dx = (place.x - rest.x) * 2;
  const dy = (place.y - rest.y) * 2;
  const a = place.alpha * alpha;
  if (a < 0.04) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(dx, dy);
  switch (id) {
    case "z":
      text(c, "z", 72, 28, 10);
      text(c, "Z", 79, 19, 14);
      break;
    case "dots":
      text(c, "…", 70, 26, 18);
      break;
    case "question":
      text(c, "?", 76, 26, 18);
      break;
    case "exclaim":
      text(c, "!", 78, 26, 18);
      break;
    case "note":
      text(c, "♪", 75, 26, 16);
      break;
    case "heart":
      heartPath(ctx, 78, 25, 1);
      if (!sun) {
        ctx.fillStyle = P.deco;
        ctx.fill();
      }
      ctx.strokeStyle = sun ? c.ink : P.deco;
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    case "sweat":
      ctx.beginPath();
      ctx.moveTo(76, 30);
      ctx.quadraticCurveTo(72, 38, 76, 40);
      ctx.quadraticCurveTo(80, 38, 76, 30);
      ctx.fillStyle = sun ? c.ink : P.cool;
      ctx.globalAlpha = a * 0.8;
      ctx.fill();
      break;
    case "star":
      star4(ctx, 80, 18, 5);
      ctx.fillStyle = sun ? c.ink : P.flame;
      ctx.fill();
      if (!sun) {
        ctx.strokeStyle = P.deco;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      break;
    case "spark":
      drawSparks(c);
      break;
    case "anger":
      // Il segno della vena: quattro archi intorno a un centro vuoto.
      ctx.beginPath();
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        ctx.moveTo(80 + sx * 1.5, 22 + sy * 4.5);
        ctx.quadraticCurveTo(80 + sx * 1.5, 22 + sy * 1.5, 80 + sx * 4.5, 22 + sy * 1.5);
      }
      ctx.strokeStyle = sun ? c.ink : P.deco;
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      glowOn(c);
      ctx.stroke();
      glowOff(c);
      break;
  }
  ctx.restore();
}

function drawSparks(c: Ctx): void {
  const { ctx, sun, P } = c;
  for (const [x, y, r] of [
    [16, 30, 3],
    [84, 26, 3.6],
    [24, 12, 2.4],
    [78, 10, 2.2],
    [88, 50, 2],
  ]) {
    star4(ctx, x, y, r);
    ctx.fillStyle = sun ? c.ink : P.flame;
    ctx.fill();
    if (!sun) {
      ctx.strokeStyle = P.deco;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }
}

/** Frammenti che volano verso il corpo (fine pomodoro, obiettivo): `p` 0..1 è il punto del viaggio. */
function drawShards(c: Ctx, p: number): void {
  const { ctx, sun, P } = c;
  const color = sun ? c.ink : P.deco;
  for (const [x0, y0, a] of [
    [12, 18, 45],
    [88, 24, 135],
    [10, 70, -45],
    [90, 68, -135],
    [50, 4, 90],
  ]) {
    const k = p * 0.55;
    const x = x0 + (50 - x0) * k;
    const y = y0 + (50 - y0) * k;
    ctx.save();
    ctx.globalAlpha *= p < 0.85 ? 0.9 : 0.9 * ((1 - p) / 0.15);
    ctx.translate(x, y);
    ctx.rotate((a * Math.PI) / 180);
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(0, -2);
    ctx.lineTo(5, 0);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fillStyle = color;
    glowOn(c);
    ctx.fill();
    glowOff(c);
    ctx.restore();
  }
}

function drawSword(c: Ctx): void {
  const { ctx, P } = c;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(84, 14);
  ctx.lineTo(66, 66);
  ctx.strokeStyle = P.steel;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.strokeStyle = P.flame;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(63, 60);
  ctx.lineTo(73, 64);
  ctx.strokeStyle = P.deco;
  ctx.lineWidth = 2.4;
  ctx.stroke();
}

function drawMug(c: Ctx): void {
  const { ctx, P } = c;
  const deco = c.sun ? c.ink : P.deco;
  ctx.beginPath();
  ctx.roundRect(72, 70, 11, 12, 2);
  ctx.fillStyle = P.fill;
  ctx.fill();
  ctx.strokeStyle = deco;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(83, 73);
  ctx.bezierCurveTo(87, 73, 87, 79, 83, 79);
  ctx.stroke();
  ctx.globalAlpha *= 0.6;
  ctx.beginPath();
  ctx.moveTo(75, 66);
  ctx.quadraticCurveTo(77, 63, 75, 60);
  ctx.moveTo(79, 66);
  ctx.quadraticCurveTo(81, 63, 79, 60);
  ctx.stroke();
}

function drawCoin(c: Ctx): void {
  const { ctx } = c;
  ctx.beginPath();
  ctx.arc(80, 22, 6, 0, Math.PI * 2);
  strokeInk(c, 1.2);
  ctx.font = "8px Figtree Variable, system-ui, sans-serif";
  ctx.fillStyle = c.ink;
  ctx.fillText("€", 77.5, 25.5);
}

function drawWave(c: Ctx): void {
  const { ctx, P } = c;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(82, 62);
  ctx.quadraticCurveTo(98, 50, 90, 30);
  ctx.strokeStyle = P["body-line"];
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.strokeStyle = P["body-3"];
  ctx.lineWidth = 7;
  ctx.stroke();
}

function drawMask(c: Ctx, ey: number): void {
  const { ctx, P } = c;
  ctx.fillStyle = P.mask;
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(26, 34);
  ctx.quadraticCurveTo(50, 24, 74, 34);
  ctx.lineTo(72, 58);
  ctx.quadraticCurveTo(50, 72, 28, 58);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(30, 34);
  ctx.lineTo(24, 20);
  ctx.lineTo(38, 31);
  ctx.moveTo(70, 34);
  ctx.lineTo(76, 20);
  ctx.lineTo(62, 31);
  ctx.fill();
  ctx.stroke();
  // Fessure degli occhi e denti.
  const y = ey;
  ctx.beginPath();
  ctx.moveTo(34, y);
  ctx.lineTo(46, y + 2);
  ctx.lineTo(36, y + 5);
  ctx.closePath();
  ctx.moveTo(66, y);
  ctx.lineTo(54, y + 2);
  ctx.lineTo(64, y + 5);
  ctx.closePath();
  ctx.fillStyle = c.ink;
  glowOn(c);
  ctx.fill();
  glowOff(c);
  ctx.beginPath();
  ctx.moveTo(40, 60);
  ctx.lineTo(44, 57);
  ctx.lineTo(47, 61);
  ctx.lineTo(50, 57);
  ctx.lineTo(53, 61);
  ctx.lineTo(56, 57);
  ctx.lineTo(60, 60);
  strokeInk(c, 0.8);
}

/** Gli oggetti del mockup al posto dei costumi corrispondenti. `ey` = altezza degli occhi, `lx`/`rx` = occhi. */
function drawCostume(c: Ctx, id: CostumeId, t: number, value: number | null, ey: number, lx: number, rx: number): void {
  const { ctx, sun, P } = c;
  const line = c.ink;
  const deco = sun ? c.ink : P.deco;
  ctx.lineWidth = 1;
  switch (id) {
    case "book":
    case "book_math":
    case "book_science":
    case "book_lang":
    case "book_history":
    case "book_art":
    case "book_code": {
      ctx.beginPath();
      ctx.moveTo(30, 84);
      ctx.lineTo(50, 88);
      ctx.lineTo(70, 84);
      ctx.lineTo(70, 72);
      ctx.lineTo(50, 76);
      ctx.lineTo(30, 72);
      ctx.closePath();
      ctx.fillStyle = P.fill;
      ctx.fill();
      ctx.strokeStyle = line;
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha *= 0.6;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(50, 76);
      ctx.lineTo(50, 88);
      ctx.moveTo(35, 76);
      ctx.lineTo(46, 78);
      ctx.moveTo(54, 78);
      ctx.lineTo(65, 76);
      ctx.stroke();
      ctx.restore();
      const symbol = SUBJECT_SYMBOL[id];
      if (symbol) text(c, symbol, 36, 9, 12);
      break;
    }
    case "nightcap":
      ctx.beginPath();
      if (sun) {
        ctx.moveTo(20, 34);
        ctx.quadraticCurveTo(38, 4, 70, 16);
        ctx.lineTo(80, 30);
        ctx.quadraticCurveTo(52, 18, 20, 34);
      } else {
        ctx.moveTo(24, 36);
        ctx.quadraticCurveTo(40, 8, 70, 18);
        ctx.lineTo(80, 32);
        ctx.quadraticCurveTo(54, 22, 24, 36);
      }
      ctx.closePath();
      ctx.fillStyle = sun ? P.fill : P.pop;
      ctx.fill();
      ctx.strokeStyle = line;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(82, sun ? 32 : 34, 4, 0, Math.PI * 2);
      ctx.fillStyle = P.fill;
      ctx.fill();
      ctx.strokeStyle = deco;
      ctx.stroke();
      break;
    case "blanket": {
      const lift = Math.sin((t * 2 * Math.PI) / 4.2) * 1.2;
      ctx.beginPath();
      ctx.moveTo(4, 76 - lift);
      ctx.quadraticCurveTo(50, 66 - lift, 96, 76 - lift);
      ctx.lineTo(96, 100);
      ctx.lineTo(4, 100);
      ctx.closePath();
      ctx.fillStyle = sun ? P.fill : P.pop;
      ctx.fill();
      ctx.strokeStyle = line;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha *= 0.5;
      ctx.beginPath();
      ctx.moveTo(10, 84 - lift);
      ctx.quadraticCurveTo(50, 76 - lift, 90, 84 - lift);
      ctx.moveTo(10, 92 - lift);
      ctx.quadraticCurveTo(50, 84 - lift, 90, 92 - lift);
      ctx.strokeStyle = deco;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "glasses3d":
      ctx.lineWidth = 1;
      ctx.strokeStyle = line;
      for (const [x, fill] of [
        [lx, P["lens-l"]],
        [rx, P["lens-r"]],
      ] as const) {
        ctx.beginPath();
        ctx.roundRect(x - 10, ey - 6, 20, 12, 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(lx + 10, ey);
      ctx.lineTo(rx - 10, ey);
      ctx.stroke();
      break;
    case "popcorn": {
      ctx.beginPath();
      ctx.moveTo(68, 72);
      ctx.lineTo(86, 72);
      ctx.lineTo(83, 92);
      ctx.lineTo(71, 92);
      ctx.closePath();
      ctx.fillStyle = P.fill;
      ctx.fill();
      ctx.strokeStyle = deco;
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha *= 0.5;
      ctx.beginPath();
      ctx.moveTo(72, 72);
      ctx.lineTo(73, 92);
      ctx.moveTo(77, 72);
      ctx.lineTo(77, 92);
      ctx.moveTo(82, 72);
      ctx.lineTo(81, 92);
      ctx.stroke();
      ctx.restore();
      // Un chicco salta ogni tanto (come il costume a punti).
      const p = (t * 0.9) % 1;
      const pops: [number, number][] = [
        [70, 69],
        [75, 67],
        [80, 68],
        [84, 70],
        [77, 63 - Math.sin(p * Math.PI) * 10],
      ];
      ctx.lineWidth = 0.6;
      for (const [x, y] of pops) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = P.pop;
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case "sword":
      drawSword(c);
      break;
    case "pause":
      ctx.fillStyle = deco;
      ctx.fillRect(74, 14, 3.5, 12);
      ctx.fillRect(80, 14, 3.5, 12);
      break;
    case "progress": {
      const v = value ?? (t * 0.08) % 1;
      ctx.lineCap = "round";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(26, 96);
      ctx.lineTo(74, 96);
      ctx.strokeStyle = P["body-line"];
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(26, 96);
      ctx.lineTo(26 + 48 * clamp(v, 0, 1), 96);
      ctx.strokeStyle = deco;
      ctx.stroke();
      break;
    }
    case "confetti": {
      const colors = [deco, c.ink, P.blush, P.steel];
      const start: [number, number, number][] = [
        [14, 20, 20],
        [84, 16, -30],
        [20, 60, 45],
        [86, 58, 10],
        [70, 8, 70],
        [30, 6, -20],
      ];
      start.forEach(([x, y0, a], i) => {
        const y = -6 + ((y0 + 6 + t * 14) % 100);
        ctx.save();
        ctx.translate(x + Math.sin(t * 3 + i) * 2, y);
        ctx.rotate(((a + t * 90 * (i % 2 ? 1 : -1)) * Math.PI) / 180);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(0, 0, 5, 2.4);
        ctx.restore();
      });
      break;
    }
    case "snow":
      ctx.strokeStyle = P.cool;
      ctx.lineWidth = 1.1;
      ctx.lineCap = "round";
      ctx.save();
      ctx.translate(80, 21);
      ctx.rotate(t * 0.6);
      for (const a of [0, 60, 120]) {
        ctx.save();
        ctx.rotate((a * Math.PI) / 180);
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(0, 9);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      break;
    case "flame":
      // Caldo: l'ombra si rimpicciolisce e suda; la fiamma cresce (bodyState).
      if (sun) drawGlyph(c, "sweat", 0, 1);
      break;
    default:
      break;
  }
}

/** Pose che aggiungono un oggetto senza un costume (o con uno che il mockup ridisegna). */
function poseExtras(c: Ctx, pose: PoseId | undefined, frame: FaceFrame): void {
  if (!pose) return;
  const age = frame.glyph?.age ?? 0;
  switch (pose) {
    case "study_break":
      drawMug(c);
      break;
    case "react_pomodoro":
      drawShards(c, ((age / 1000) % 1.6) / 1.6);
      break;
    case "react_goal":
      if (c.sun) {
        drawShards(c, ((age / 1000) % 1.6) / 1.6);
        drawCoin(c);
      } else {
        drawSword(c);
        drawSparks(c);
        drawGlyph(c, "star", 300, 1);
      }
      break;
    case "react_greet":
    case "react_welcome":
      if (c.sun) drawWave(c);
      else drawSparks(c);
      break;
    default:
      break;
  }
}

/** Pose che disegnano da sé il loro simbolo (o costume): quello dell'animatore si tace. */
const POSE_OWNS_GLYPH = new Set<PoseId>(["react_pomodoro", "react_goal"]);
const POSE_OWNS_COSTUME = new Set<PoseId>(["react_goal"]);

/** Disegna un fotogramma. `canvas` ha già dimensioni in pixel reali. */
export function drawOmbraFace(canvas: HTMLCanvasElement, frame: FaceFrame, o: OmbraOptions): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (W < 4 || H < 4) return;

  const sun = o.body === "shadow";
  const P = paletteFor(canvas);
  const state = bodyState(canvas, frame);

  // Il riquadro 100×100 del mockup, centrato, con un margine che segue `padding` (gli oggetti escono un po').
  const margin = clamp(o.padding * 1.5, 0, 14);
  const s = Math.min(W / (100 + margin * 2), H / (100 + margin * 2), (o.maxPointSize * o.dpr) / 2);
  const ox = (W - 100 * s) / 2;
  const oy = (H - 100 * s) / 2;
  const c: Ctx = { ctx, P, ink: o.color, sun, s };

  // Movimento di tutta la faccia (saltelli, dondolii): un punto dell'animatore = 2 unità.
  const bx = frame.offsetX * 2;
  const by = frame.offsetY * 2;
  const sx = sun ? state.small : 1;
  const sy = sun ? state.small * state.squash : 1;
  // L'ombra si schiaccia e si rimpicciolisce verso la base.
  ctx.setTransform(s * sx, 0, 0, s * sy, ox + (bx + 50 * (1 - sx)) * s, oy + (by + 100 * (1 - sy)) * s);

  if (sun) drawShadowBody(c);
  else drawFlameBody(c, state.flame);

  const gx = frame.gazeX * 5.2;
  const gy = frame.gazeY * 3.8;
  const ey = (sun ? 46 : 54) + gy;
  const lx = 38 + gx;
  const rx = 62 + gx;
  const emotion = frame.emotion;
  const costume = frame.costume && !(frame.pose && POSE_OWNS_COSTUME.has(frame.pose)) ? frame.costume : null;
  const books = costume?.id.startsWith("book") ?? false;
  const masked = sun && !!emotion && MASKED.has(emotion) && (!costume || books);

  // Bagliore dello schermo sugli occhi.
  if (frame.glow > 0.01) {
    ctx.globalAlpha = frame.glow;
    ctx.fillStyle = P.screen;
    ctx.beginPath();
    ctx.roundRect(24, ey - 3, 52, 6, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (masked) {
    drawMask(c, ey);
  } else {
    drawEye(c, lx, ey, frame.face.left, 1, emotion);
    drawEye(c, rx, ey, frame.face.right, -1, emotion);
    const lift = Math.max(0, (frame.face.left.scaleY + frame.face.right.scaleY) / 2 - 1.05) * 8;
    drawBrows(c, lx, rx, ey - (sun ? 10 : 9) - lift, frame);
    if (o.showMouth && frame.face.mouthWidth > 0.04) drawMouth(c, 50 + gx * 0.5, (sun ? 64 : 67) + gy * 0.45, frame);
  }

  if (frame.face.blush > 0.02) {
    ctx.globalAlpha = clamp(frame.face.blush, 0, 1);
    ctx.fillStyle = P.blush;
    for (const x of [32, 68]) {
      ctx.beginPath();
      ctx.ellipse(x + gx * 0.5, ey + 8, 5, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Oggetti, simboli e costumi non si schiacciano col corpo: stesso movimento, scala normale. Quelli legati agli
  // occhi (gli occhiali) seguono gli occhi dove il corpo schiacciato li ha portati.
  ctx.setTransform(s, 0, 0, s, ox + bx * s, oy + by * s);
  const eyOut = 100 - sy * (100 - ey);
  const lxOut = 50 + sx * (lx - 50);
  const rxOut = 50 + sx * (rx - 50);

  if (costume && VECTOR_COSTUMES.has(costume.id)) {
    ctx.save();
    ctx.globalAlpha = costume.alpha;
    drawCostume(c, costume.id, costume.t, costume.value, eyOut, lxOut, rxOut);
    ctx.restore();
  }

  ctx.save();
  poseExtras(c, frame.pose, frame);
  ctx.restore();

  if (frame.glyph && !(frame.pose && POSE_OWNS_GLYPH.has(frame.pose))) drawGlyph(c, frame.glyph.id, frame.glyph.age, frame.glyph.alpha);

  // Gli altri costumi (cuffie, joystick, mirino…), a punti come negli stili pieni, nel colore degli occhi.
  // Lo spazio dei punti (30×20) sta sugli occhi: un punto = 2 unità, gli occhi a 9 e 21 cadono su 38 e 62.
  if (costume && !VECTOR_COSTUMES.has(costume.id)) {
    const field = costumeField(frame);
    const scale = 2 * s;
    // (lo spostamento della testa e dello sguardo lo aggiunge già costumeField, come negli altri stili)
    const originX = ox + 20 * s;
    const originY = oy + (ey - gy - 17) * s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (field) paintField(ctx, canvas, field, o.color, { scale, originX, originY });
    ctx.fillStyle = o.color;
    for (const [x, y, a] of costumeDots(frame)) {
      if (a < 0.04) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(originX + x * scale, originY + y * scale, scale * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
