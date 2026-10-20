import type { BrainSnapshot } from "./brain";
import { EMOTIONS, emotionFace, NEUTRAL_FACE, type FaceMotion, type FaceParams, type GlyphId } from "./face";

/**
 * Trasforma le decisioni del cervello (che cambiano poche volte al minuto)
 * in un fotogramma continuo: interpolazione tra emozioni, battiti di
 * ciglia, sguardo, respiro, saltelli. Tutto è funzione del tempo che gli
 * passi, quindi chiamarlo due volte nello stesso istante (es. widget +
 * copia fantasma durante il drag) dà lo stesso identico fotogramma.
 */

export interface FaceFrame {
  face: FaceParams;
  /** Sguardo finale, -1..1. */
  gazeX: number;
  gazeY: number;
  /** Spostamento di tutta la faccia, in punti. */
  offsetX: number;
  offsetY: number;
  glyph: { id: GlyphId; age: number; alpha: number } | null;
  /** 0 = niente bagliore; altrimenti intensità, con `glowPos` 0..1 la posizione della banda. */
  glow: number;
  glowPos: number;
}

export interface AnimatorOptions {
  /** Intervallo tra battiti di ciglia (dalla personalità). */
  blinkMs: [number, number];
  /** Direzione verso il mouse (-1..1), null se il mouse è fermo o lontano. */
  pointer: { x: number; y: number } | null;
  /** Animazioni globali dell'app spente: niente movimenti, transizioni istantanee. */
  still: boolean;
}

const BLINK_MS = 170;

function approach(current: number, target: number, k: number): number {
  return current + (target - current) * k;
}

function approachFace(a: FaceParams, b: FaceParams, k: number): FaceParams {
  const eye = (x: FaceParams["left"], y: FaceParams["left"]) => ({
    open: approach(x.open, y.open, k),
    scaleX: approach(x.scaleX, y.scaleX, k),
    scaleY: approach(x.scaleY, y.scaleY, k),
    lidTop: approach(x.lidTop, y.lidTop, k),
    lidBottom: approach(x.lidBottom, y.lidBottom, k),
    tilt: approach(x.tilt, y.tilt, k),
    heart: approach(x.heart, y.heart, k),
  });
  return {
    left: eye(a.left, b.left),
    right: eye(a.right, b.right),
    mouthCurve: approach(a.mouthCurve, b.mouthCurve, k),
    mouthOpen: approach(a.mouthOpen, b.mouthOpen, k),
    mouthWidth: approach(a.mouthWidth, b.mouthWidth, k),
    blush: approach(a.blush, b.blush, k),
    gazeX: approach(a.gazeX, b.gazeX, k),
    gazeY: approach(a.gazeY, b.gazeY, k),
  };
}

export class FaceAnimator {
  private readonly random: () => number;
  private lastT: number | null = null;
  private face: FaceParams = NEUTRAL_FACE;
  private gazeX = 0;
  private gazeY = 0;
  private gazeTargetX = 0;
  private gazeTargetY = 0;
  private nextWanderAt = 0;
  private nextBlinkAt = 0;
  private blinkStart = -1;
  private doubleBlink = false;
  private motionAmp = 0;
  private lastMotion: FaceMotion = "none";
  private glyphId: GlyphId | null = null;
  private glyphSince = 0;
  private glow = 0;
  private readStart = 0;
  private lastFrame: FaceFrame | null = null;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  advance(t: number, snap: BrainSnapshot, opts: AnimatorOptions): FaceFrame {
    if (this.lastT !== null && t <= this.lastT && this.lastFrame) return this.lastFrame;
    const dt = this.lastT === null ? 1 : Math.min(0.25, (t - this.lastT) / 1000);
    this.lastT = t;
    const still = opts.still;

    // --- Espressione: reazione in corso o umore di fondo.
    const emotion = snap.reaction?.emotion ?? snap.mood;
    const target = emotionFace(emotion);
    this.face = still ? target : approachFace(this.face, target, 1 - Math.exp(-dt * 11));

    // --- Sguardo.
    this.updateGazeTarget(t, snap, opts, target);
    const kGaze = still ? 1 : 1 - Math.exp(-dt * 16);
    this.gazeX = approach(this.gazeX, this.gazeTargetX, kGaze);
    this.gazeY = approach(this.gazeY, this.gazeTargetY, kGaze);

    // --- Battito di ciglia.
    let blink = 1;
    if (!still && snap.blink && emotion !== "sleep") {
      if (this.nextBlinkAt === 0) this.nextBlinkAt = t + this.blinkDelay(opts);
      if (this.blinkStart < 0 && t >= this.nextBlinkAt) {
        this.blinkStart = t;
        this.doubleBlink = this.random() < 0.18;
      }
      if (this.blinkStart >= 0) {
        const total = this.doubleBlink ? BLINK_MS * 2.2 : BLINK_MS;
        const p = (t - this.blinkStart) / BLINK_MS;
        if (t - this.blinkStart >= total) {
          this.blinkStart = -1;
          this.nextBlinkAt = t + this.blinkDelay(opts);
        } else {
          const local = this.doubleBlink && p > 1.2 ? p - 1.2 : p;
          if (local <= 1) blink = 1 - Math.sin(Math.PI * Math.min(1, local)) * 0.92;
        }
      }
    }

    // --- Respiro.
    const breath = !still && snap.breath ? 1 + 0.03 * Math.sin((2 * Math.PI * t) / 4200) : 1;

    const face: FaceParams = {
      ...this.face,
      left: { ...this.face.left, open: this.face.left.open * blink, scaleY: this.face.left.scaleY * breath },
      right: { ...this.face.right, open: this.face.right.open * blink, scaleY: this.face.right.scaleY * breath },
    };

    // --- Movimento di tutta la faccia.
    let motion: FaceMotion = EMOTIONS[emotion].motion ?? "none";
    if (snap.musicBeat && !snap.reaction) motion = "bounce";
    if (motion !== this.lastMotion) {
      this.lastMotion = motion;
      this.motionAmp = 0;
    }
    this.motionAmp = still ? 0 : approach(this.motionAmp, motion === "none" ? 0 : 1, 1 - Math.exp(-dt * 5));
    const s = t / 1000;
    let offsetX = 0;
    let offsetY = 0;
    switch (motion) {
      case "bounce":
        offsetY = -Math.abs(Math.sin(s * Math.PI * (snap.musicBeat && !snap.reaction ? 1.8 : 3))) * 1.1;
        break;
      case "shake": {
        const since = snap.reaction ? t - snap.reaction.startedAt : 0;
        offsetX = Math.sin(s * 38) * 0.6 * Math.max(0, 1 - since / 900);
        break;
      }
      case "nod":
        offsetY = (Math.sin(s * Math.PI * 0.8) + 1) * 0.5;
        break;
      case "sway":
        offsetX = Math.sin(s * Math.PI * 0.55) * 0.7;
        break;
      case "tremble":
        offsetX = Math.sin(s * 50) * 0.25;
        break;
      default:
        break;
    }
    offsetX *= this.motionAmp;
    offsetY *= this.motionAmp;

    // --- Simbolo.
    const glyphId = snap.reaction?.glyph ?? snap.glyph;
    if (glyphId !== this.glyphId) {
      this.glyphId = glyphId;
      this.glyphSince = t;
    }
    const glyphAge = t - this.glyphSince;
    const glyph = glyphId ? { id: glyphId, age: glyphAge, alpha: Math.min(1, glyphAge / 200) } : null;

    // --- Bagliore dello schermo.
    this.glow = approach(this.glow, snap.screenGlow ? 1 : 0, still ? 1 : 1 - Math.exp(-dt * 3));
    const glowPos = ((t / 2800) % 1) * 1.4 - 0.2;

    const frame: FaceFrame = { face, gazeX: this.gazeX, gazeY: this.gazeY, offsetX, offsetY, glyph, glow: this.glow, glowPos };
    this.lastFrame = frame;
    return frame;
  }

  private blinkDelay(opts: AnimatorOptions): number {
    const [min, max] = opts.blinkMs;
    return min + this.random() * (max - min);
  }

  private updateGazeTarget(t: number, snap: BrainSnapshot, opts: AnimatorOptions, target: FaceParams): void {
    // Una reazione con uno sguardo suo (curioso, timido…) vince su tutto.
    if (snap.reaction && (target.gazeX !== 0 || target.gazeY !== 0)) {
      this.gazeTargetX = target.gazeX;
      this.gazeTargetY = target.gazeY;
      return;
    }
    if (snap.canFollow && opts.pointer) {
      this.gazeTargetX = opts.pointer.x;
      this.gazeTargetY = opts.pointer.y;
      return;
    }

    switch (snap.gaze) {
      case "read": {
        // Riga per riga: da sinistra a destra, poi a capo.
        if (this.readStart === 0) this.readStart = t;
        const line = 2600;
        const elapsed = t - this.readStart;
        const p = (elapsed % line) / line;
        const row = Math.floor(elapsed / line) % 4;
        this.gazeTargetX = p < 0.85 ? -0.8 + (1.6 * p) / 0.85 : -0.8;
        this.gazeTargetY = 0.3 + row * 0.13;
        return;
      }
      case "screen":
        this.readStart = 0;
        if (t >= this.nextWanderAt) {
          this.nextWanderAt = t + 1800 + this.random() * 2500;
          this.gazeTargetX = (this.random() - 0.5) * 0.25;
          this.gazeTargetY = -0.15 + (this.random() - 0.5) * 0.12;
        }
        return;
      case "down":
        this.readStart = 0;
        if (t >= this.nextWanderAt) {
          this.nextWanderAt = t + 2000 + this.random() * 3000;
          this.gazeTargetX = (this.random() - 0.5) * 0.6;
          this.gazeTargetY = 0.5;
        }
        return;
      case "sleep":
        this.gazeTargetX = 0;
        this.gazeTargetY = 0.35;
        return;
      case "wander":
      default:
        this.readStart = 0;
        if (!snap.wander) {
          this.gazeTargetX = target.gazeX;
          this.gazeTargetY = target.gazeY;
          return;
        }
        if (t >= this.nextWanderAt) {
          this.nextWanderAt = t + 900 + this.random() * 2600;
          if (this.random() < 0.45) {
            this.gazeTargetX = target.gazeX;
            this.gazeTargetY = target.gazeY;
          } else {
            this.gazeTargetX = (this.random() * 2 - 1) * 0.9;
            this.gazeTargetY = (this.random() * 2 - 1) * 0.5;
          }
        }
    }
  }
}
