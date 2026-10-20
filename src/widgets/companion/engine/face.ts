/**
 * La faccia è PARAMETRICA: ogni emozione è solo un insieme di numeri
 * (apertura degli occhi, palpebre, inclinazione, bocca…). Il renderer
 * disegna qualunque combinazione e l'animatore passa da una all'altra
 * interpolando, quindi le transizioni sono sempre fluide e un nuovo stile
 * grafico deve solo saper disegnare questi parametri.
 *
 * Unità: "punti" della matrice LED. Coordinate y verso il basso.
 */

export interface EyeParams {
  /** 1 = aperto, ~0.1 = chiuso. Le palpebrate (blink) lo moltiplicano. */
  open: number;
  scaleX: number;
  scaleY: number;
  /** Palpebra superiore che scende (0 = aperto, 1 = coperto). */
  lidTop: number;
  /** Arco dal basso: occhi "sorridenti" a ∩ (0 = niente). */
  lidBottom: number;
  /** Inclinazione palpebra: >0 arrabbiato (angolo interno giù), <0 triste. */
  tilt: number;
  /** 0 = rettangolo arrotondato, 1 = cuore. */
  heart: number;
}

export interface FaceParams {
  left: EyeParams;
  right: EyeParams;
  /** >0 sorriso, <0 broncio. */
  mouthCurve: number;
  /** 0 chiusa, 1 molto aperta. */
  mouthOpen: number;
  /** 0 = bocca nascosta. */
  mouthWidth: number;
  /** Rossore sotto gli occhi (punti più tenui). */
  blush: number;
  /** Direzione dello sguardo "di base" dell'emozione, -1..1. */
  gazeX: number;
  gazeY: number;
}

/** Movimento extra di tutta la faccia mentre l'emozione è attiva. */
export type FaceMotion = "none" | "bounce" | "shake" | "nod" | "sway" | "tremble";

/** Piccolo simbolo che compare accanto alla faccia. */
export type GlyphId = "z" | "heart" | "note" | "exclaim" | "question" | "sweat" | "star" | "dots" | "anger" | "spark";

export const EMOTION_IDS = [
  "neutral",
  "happy",
  "laugh",
  "love",
  "surprised",
  "wink",
  "curious",
  "confused",
  "sad",
  "angry",
  "sleepy",
  "sleep",
  "shy",
  "excited",
  "proud",
  "focused",
  "relaxed",
  "watching",
  "bored",
] as const;

export type EmotionId = (typeof EMOTION_IDS)[number];

const NEUTRAL_EYE: EyeParams = { open: 1, scaleX: 1, scaleY: 1, lidTop: 0, lidBottom: 0, tilt: 0, heart: 0 };

export const NEUTRAL_FACE: FaceParams = {
  left: NEUTRAL_EYE,
  right: NEUTRAL_EYE,
  mouthCurve: 0,
  mouthOpen: 0,
  mouthWidth: 0,
  blush: 0,
  gazeX: 0,
  gazeY: 0,
};

interface EmotionSpec {
  label: string;
  /** Applicato a entrambi gli occhi. */
  eyes?: Partial<EyeParams>;
  left?: Partial<EyeParams>;
  right?: Partial<EyeParams>;
  face?: Partial<Omit<FaceParams, "left" | "right">>;
  motion?: FaceMotion;
  glyph?: GlyphId;
}

export const EMOTIONS: Record<EmotionId, EmotionSpec> = {
  neutral: { label: "Neutro" },
  happy: { label: "Felice", eyes: { lidBottom: 0.55, scaleY: 1.05 }, face: { mouthCurve: 0.8, mouthWidth: 0.7 } },
  laugh: {
    label: "Risata",
    eyes: { lidBottom: 0.75, lidTop: 0.1, scaleX: 1.1 },
    face: { mouthCurve: 0.9, mouthOpen: 0.7, mouthWidth: 0.85 },
    motion: "bounce",
  },
  love: { label: "Innamorato", eyes: { heart: 1, scaleX: 1.15, scaleY: 1.1 }, face: { mouthCurve: 0.7, mouthWidth: 0.6, blush: 0.6 }, motion: "sway", glyph: "heart" },
  surprised: { label: "Sorpreso", eyes: { scaleX: 1.15, scaleY: 1.25 }, face: { mouthOpen: 0.9, mouthWidth: 0.3, gazeY: -0.2 }, glyph: "exclaim" },
  wink: { label: "Occhiolino", left: { lidBottom: 0.6 }, right: { open: 0.12 }, face: { mouthCurve: 0.7, mouthWidth: 0.6 } },
  curious: { label: "Curioso", left: { scaleY: 1.15, scaleX: 1.05 }, right: { lidTop: 0.3 }, face: { gazeX: 0.7, gazeY: -0.2, mouthWidth: 0.3 } },
  confused: { label: "Confuso", left: { scaleY: 0.75, tilt: -0.25 }, right: { scaleY: 1.15, tilt: 0.2 }, face: { mouthCurve: -0.3, mouthWidth: 0.45, gazeX: -0.3 }, glyph: "question" },
  sad: { label: "Triste", eyes: { tilt: -0.45, lidTop: 0.3, scaleY: 0.95 }, face: { mouthCurve: -0.7, mouthWidth: 0.55, gazeY: 0.5 }, glyph: "sweat" },
  angry: { label: "Arrabbiato", eyes: { tilt: 0.55, lidTop: 0.35 }, face: { mouthCurve: -0.5, mouthWidth: 0.6 }, motion: "shake", glyph: "anger" },
  sleepy: { label: "Assonnato", eyes: { lidTop: 0.6, scaleX: 1.05 }, face: { gazeY: 0.35, mouthWidth: 0.25, mouthOpen: 0.15 }, motion: "nod" },
  sleep: { label: "Dorme", eyes: { open: 0.1, scaleX: 1.1 }, face: { gazeY: 0.4, mouthWidth: 0.2 }, motion: "sway", glyph: "z" },
  shy: { label: "Timido", eyes: { lidBottom: 0.35, scaleY: 0.9 }, face: { gazeX: -0.6, gazeY: 0.5, blush: 1, mouthCurve: 0.4, mouthWidth: 0.35 } },
  excited: { label: "Entusiasta", eyes: { scaleX: 1.15, scaleY: 1.15, lidBottom: 0.25 }, face: { mouthCurve: 1, mouthOpen: 0.5, mouthWidth: 0.8, gazeY: -0.2 }, motion: "bounce", glyph: "star" },
  proud: { label: "Orgoglioso", eyes: { lidBottom: 0.5, lidTop: 0.2 }, face: { mouthCurve: 0.9, mouthWidth: 0.75, gazeY: -0.35, blush: 0.35 }, glyph: "spark" },
  focused: { label: "Concentrato", eyes: { lidTop: 0.28, scaleX: 1.05, scaleY: 0.9 }, face: { mouthWidth: 0.3, gazeY: 0.45 } },
  relaxed: { label: "Rilassato", eyes: { lidBottom: 0.4, lidTop: 0.15 }, face: { mouthCurve: 0.5, mouthWidth: 0.55 }, motion: "sway" },
  watching: { label: "Guarda", eyes: { scaleX: 1.08, scaleY: 1.12 }, face: { gazeY: -0.15, mouthWidth: 0.2, mouthOpen: 0.1 } },
  bored: { label: "Annoiato", eyes: { lidTop: 0.45 }, face: { mouthCurve: -0.15, mouthWidth: 0.45, gazeX: 0.8, gazeY: 0.2 }, glyph: "dots" },
};

export function emotionFace(id: EmotionId): FaceParams {
  const spec = EMOTIONS[id];
  return {
    ...NEUTRAL_FACE,
    ...spec.face,
    left: { ...NEUTRAL_EYE, ...spec.eyes, ...spec.left },
    right: { ...NEUTRAL_EYE, ...spec.eyes, ...spec.right },
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpEye(a: EyeParams, b: EyeParams, t: number): EyeParams {
  return {
    open: lerp(a.open, b.open, t),
    scaleX: lerp(a.scaleX, b.scaleX, t),
    scaleY: lerp(a.scaleY, b.scaleY, t),
    lidTop: lerp(a.lidTop, b.lidTop, t),
    lidBottom: lerp(a.lidBottom, b.lidBottom, t),
    tilt: lerp(a.tilt, b.tilt, t),
    heart: lerp(a.heart, b.heart, t),
  };
}

/** Interpolazione lineare tra due facce (t = 0 → a, t = 1 → b). */
export function lerpFace(a: FaceParams, b: FaceParams, t: number): FaceParams {
  return {
    left: lerpEye(a.left, b.left, t),
    right: lerpEye(a.right, b.right, t),
    mouthCurve: lerp(a.mouthCurve, b.mouthCurve, t),
    mouthOpen: lerp(a.mouthOpen, b.mouthOpen, t),
    mouthWidth: lerp(a.mouthWidth, b.mouthWidth, t),
    blush: lerp(a.blush, b.blush, t),
    gazeX: lerp(a.gazeX, b.gazeX, t),
    gazeY: lerp(a.gazeY, b.gazeY, t),
  };
}
