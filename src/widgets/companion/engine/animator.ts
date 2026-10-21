import type { BrainSnapshot } from "./brain";
import { EMOTIONS, emotionFace, NEUTRAL_FACE, type EmotionId, type FaceMotion, type FaceParams, type GlyphId } from "./face";
import { PERSONALITIES, type FaceTweak } from "./personalities";
import { aimPos, kernelPos, planePos, type CostumeId, type GazeMode } from "./poses";

/**
 * Trasforma le decisioni del cervello (che cambiano poche volte al minuto)
 * in un fotogramma continuo: interpolazione tra emozioni, battiti di
 * ciglia, sguardo, respiro, saltelli, costumi. Tutto è funzione del tempo
 * che gli passi, quindi chiamarlo due volte nello stesso istante (es.
 * widget + copia fantasma durante il drag) dà lo stesso identico fotogramma.
 *
 * La personalità entra qui in due modi: un ritocco a ogni espressione
 * (faceTweak) e il "tempo" delle animazioni (tempo, motionAmp).
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
  /** Costume in corso: `t` è il suo tempo in secondi (già alla velocità della personalità). */
  costume: { id: CostumeId; t: number; alpha: number; value: number | null } | null;
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
/** Ciclo dell'appisolarsi, in secondi di animazione: sveglio, palpebre giù piano, risveglio di scatto. */
const DOZE_CYCLE = 9;
/** Espressioni "sveglie": il Dormiglione non abbassa le palpebre su queste. */
const AWAKE = new Set<EmotionId>(["surprised", "excited", "aim", "laugh"]);

function approach(current: number, target: number, k: number): number {
  return current + (target - current) * k;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
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

/** Il ritocco della personalità su un'espressione (es. sopracciglia aggrottate del Brontolone). */
export function tweakFace(face: FaceParams, emotion: EmotionId, tweak: FaceTweak): FaceParams {
  if (emotion === "sleep") return face;
  const lidTop = AWAKE.has(emotion) ? 0 : (tweak.lidTop ?? 0);
  const eye = (e: FaceParams["left"]) => ({
    ...e,
    lidTop: clamp(e.lidTop + lidTop, 0, 0.85),
    lidBottom: clamp(e.lidBottom + (tweak.lidBottom ?? 0), 0, 0.8),
    tilt: e.tilt + (tweak.tilt ?? 0),
  });
  const curve = tweak.mouthCurve ?? 0;
  const keepSad = emotion === "sad" && curve > 0;
  return {
    ...face,
    left: eye(face.left),
    right: eye(face.right),
    mouthCurve: face.mouthWidth > 0 && !keepSad ? clamp(face.mouthCurve + curve, -1, 1) : face.mouthCurve,
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
  /** Tempo delle animazioni in secondi: scorre alla velocità della personalità (e della posa). */
  private clock = 0;
  private costumeId: CostumeId | null = null;
  private costumeT = 0;
  private costumeAlpha = 0;
  private lastFrame: FaceFrame | null = null;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  advance(t: number, snap: BrainSnapshot, opts: AnimatorOptions): FaceFrame {
    if (this.lastT !== null && t <= this.lastT && this.lastFrame) return this.lastFrame;
    const dt = this.lastT === null ? 1 : Math.min(0.25, (t - this.lastT) / 1000);
    this.lastT = t;
    const still = opts.still;
    const personality = PERSONALITIES[snap.personality];
    const reaction = snap.reaction;
    const tempo = reaction?.tempo ?? snap.tempo;
    if (!still) this.clock += dt * tempo;
    const clock = this.clock;

    // --- Espressione: reazione in corso o umore di fondo, col ritocco della personalità.
    const emotion = reaction?.emotion ?? snap.mood;
    const target = tweakFace(emotionFace(emotion), emotion, personality.faceTweak);
    this.face = still ? target : approachFace(this.face, target, 1 - Math.exp(-dt * 11));

    // --- Costume: quello della reazione (se ne ha uno) o della posa, con dissolvenza.
    const costumeTarget = reaction && reaction.costume !== undefined ? reaction.costume : snap.costume;
    if (costumeTarget !== this.costumeId) {
      this.costumeAlpha = still ? 0 : approach(this.costumeAlpha, 0, 1 - Math.exp(-dt * 14));
      if (this.costumeId === null || this.costumeAlpha < 0.05) {
        this.costumeId = costumeTarget;
        this.costumeT = 0;
        this.costumeAlpha = still ? 1 : 0;
      }
    } else {
      this.costumeAlpha = still ? 1 : approach(this.costumeAlpha, 1, 1 - Math.exp(-dt * 8));
    }
    if (!still) this.costumeT += dt * tempo;

    // --- Sguardo.
    this.updateGazeTarget(t, snap, opts, target, reaction?.gaze ?? snap.gaze);
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

    // --- Si appisola: palpebre giù piano, poi si risveglia di scatto.
    const doze = reaction?.doze ?? snap.doze;
    let left = this.face.left;
    let right = this.face.right;
    let mouthOpen = this.face.mouthOpen;
    let mouthWidth = this.face.mouthWidth;
    if (doze && !still) {
      const c = clock % DOZE_CYCLE;
      if (c > 4 && c < 7) {
        const k = 1 - ((c - 4) / 3) * 0.9;
        left = { ...left, open: left.open * k };
        right = { ...right, open: right.open * k };
      } else if (c >= 7 && c < 7.6) {
        left = { ...left, scaleX: left.scaleX * 1.12, scaleY: left.scaleY * 1.25 };
        right = { ...right, scaleX: right.scaleX * 1.12, scaleY: right.scaleY * 1.25 };
        mouthOpen = 0.7;
        mouthWidth = Math.max(mouthWidth, 0.3);
      }
    }
    // Assonnato: ogni tanto uno sbadiglio.
    if (emotion === "sleepy" && !still) mouthOpen = Math.max(mouthOpen, 0.15 + Math.max(0, Math.sin(clock * 0.9) - 0.85) * 4);

    // --- Respiro.
    const breath = !still && snap.breath ? 1 + 0.03 * Math.sin((2 * Math.PI * t) / 4200) : 1;

    // --- Movimento di tutta la faccia.
    let motion: FaceMotion = (reaction ? (reaction.motion ?? EMOTIONS[reaction.emotion].motion) : (snap.motion ?? EMOTIONS[snap.mood].motion)) ?? "none";
    if (still) motion = "none";
    if (motion !== this.lastMotion) {
      this.lastMotion = motion;
      this.motionAmp = 0;
    }
    this.motionAmp = still ? 0 : approach(this.motionAmp, motion === "none" ? 0 : 1, 1 - Math.exp(-dt * 5));
    let offsetX = 0;
    let offsetY = 0;
    switch (motion) {
      case "bounce":
        offsetY = -Math.abs(Math.sin(clock * Math.PI * 3)) * 1.1;
        break;
      case "beat":
        offsetY = -Math.abs(Math.sin(clock * Math.PI * 1.8)) * 1.1;
        break;
      case "shake": {
        const since = reaction ? t - reaction.startedAt : 0;
        offsetX = Math.sin((t / 1000) * 38) * 0.6 * Math.max(0, 1 - since / 900);
        break;
      }
      case "nod":
        offsetY = (Math.sin(clock * Math.PI * 0.8) + 1) * 0.5;
        break;
      case "sway":
        offsetX = Math.sin(clock * Math.PI * 0.55) * 0.7;
        break;
      case "tremble":
        offsetX = Math.sin((t / 1000) * 50) * 0.25;
        break;
      case "flicker":
        offsetY = Math.sin(clock * 9) * 0.2;
        break;
      case "talk":
        mouthOpen = Math.max(0, Math.sin(clock * 11) * Math.sin(clock * 2.3)) * 0.6 * this.motionAmp;
        break;
      default:
        break;
    }
    const amp = this.motionAmp * personality.motionAmp;
    offsetX *= amp;
    offsetY *= amp;

    const face: FaceParams = {
      ...this.face,
      mouthOpen,
      mouthWidth,
      left: { ...left, open: left.open * blink, scaleY: left.scaleY * breath },
      right: { ...right, open: right.open * blink, scaleY: right.scaleY * breath },
    };

    // --- Simbolo.
    // Una reazione-posa decide il suo simbolo (anche "nessuno"); un'espressione sola lascia quello di fondo.
    const glyphId = reaction?.pose ? reaction.glyph : (reaction?.glyph ?? snap.glyph);
    if (glyphId !== this.glyphId) {
      this.glyphId = glyphId;
      this.glyphSince = t;
    }
    const glyphAge = t - this.glyphSince;
    const glyph = glyphId ? { id: glyphId, age: glyphAge, alpha: Math.min(1, glyphAge / 200) } : null;

    // --- Bagliore dello schermo.
    this.glow = approach(this.glow, snap.screenGlow ? 1 : 0, still ? 1 : 1 - Math.exp(-dt * 3));
    const glowPos = ((t / 2800) % 1) * 1.4 - 0.2;

    const costume = this.costumeId && this.costumeAlpha > 0.01 ? { id: this.costumeId, t: this.costumeT, alpha: this.costumeAlpha, value: snap.costumeValue } : null;
    const frame: FaceFrame = { face, gazeX: this.gazeX, gazeY: this.gazeY, offsetX, offsetY, glyph, costume, glow: this.glow, glowPos };
    this.lastFrame = frame;
    return frame;
  }

  private blinkDelay(opts: AnimatorOptions): number {
    const [min, max] = opts.blinkMs;
    return min + this.random() * (max - min);
  }

  private updateGazeTarget(t: number, snap: BrainSnapshot, opts: AnimatorOptions, target: FaceParams, mode: GazeMode): void {
    // Una reazione con uno sguardo suo (curioso, timido…) vince su tutto, se non ne ha uno della posa.
    if (snap.reaction && !snap.reaction.gaze && (target.gazeX !== 0 || target.gazeY !== 0)) {
      this.gazeTargetX = target.gazeX;
      this.gazeTargetY = target.gazeY;
      return;
    }
    if (snap.canFollow && opts.pointer) {
      this.gazeTargetX = opts.pointer.x;
      this.gazeTargetY = opts.pointer.y;
      return;
    }
    if (mode !== "read") this.readStart = 0;

    switch (mode) {
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
      case "scan": {
        // Scorre una pagina: righe più veloci e più in alto della lettura.
        const s = this.clock;
        const p = (s % 1.6) / 1.6;
        this.gazeTargetX = p < 0.7 ? -0.7 + (1.4 * p) / 0.7 : -0.7;
        this.gazeTargetY = -0.1 + (Math.floor(s / 1.6) % 3) * 0.15;
        return;
      }
      case "fixed":
        this.gazeTargetX = 0;
        this.gazeTargetY = -0.05;
        return;
      case "face":
        this.gazeTargetX = target.gazeX;
        this.gazeTargetY = target.gazeY;
        return;
      case "upRight":
        this.gazeTargetX = 0.55;
        this.gazeTargetY = -0.45;
        return;
      case "away":
        this.gazeTargetX = -0.9;
        this.gazeTargetY = 0.3;
        return;
      case "kernel":
      case "aim":
      case "plane": {
        // Segue l'oggetto del costume (stesse posizioni usate per disegnarlo).
        const [x, y] = mode === "kernel" ? kernelPos(this.costumeT) : mode === "aim" ? aimPos(this.costumeT) : planePos(this.costumeT);
        this.gazeTargetX = clamp((x - 15) / (mode === "plane" ? 14 : 9), -1, 1);
        this.gazeTargetY = mode === "plane" ? -0.6 : clamp((y - 8.5) / 5, -1, 1);
        return;
      }
      case "screen":
        if (t >= this.nextWanderAt) {
          this.nextWanderAt = t + 1800 + this.random() * 2500;
          this.gazeTargetX = (this.random() - 0.5) * 0.25;
          this.gazeTargetY = -0.15 + (this.random() - 0.5) * 0.12;
        }
        return;
      case "down":
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
