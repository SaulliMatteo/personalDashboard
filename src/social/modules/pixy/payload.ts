import { EMOTION_IDS, FACE_MOTIONS, GLYPH_IDS, type EmotionId, type FaceMotion, type GlyphId } from "../../../core/pixy/engine/face";
import { PERSONALITY_IDS, type PersonalityId } from "../../../core/pixy/engine/personalities";
import { COSTUME_IDS, GAZE_MODES, POSES, type CostumeId, type GazeMode, type PoseId } from "../../../core/pixy/engine/poses";
import type { BrainSnapshot, Bubble, Reaction } from "../../../core/pixy/engine/snapshot";

/*
 * Il messaggio di presenza del modulo Pixy (versione 1) e la sua validazione. Puro: l'ora e lo scarto
 * dell'orologio arrivano da fuori (lo prova scripts/gruppi/pixy.test.mts).
 *
 * Si manda sempre l'aspetto (personalità, colore, bocca): non dice nulla di ciò che si fa. Lo stato del cervello
 * (`brain`) solo con "Condividi le espressioni di Pixy", perché le pose rivelano l'app in primo piano; il fumetto
 * solo con "Condividi anche i fumetti". Istanti in ms dell'orologio del SERVER, come nel modulo Studio.
 */

export const PIXY_PRESENCE_VERSION = 1;

/** Fumetti più lunghi si tagliano (le frasi della personalità stanno ben sotto). */
export const BUBBLE_MAX_LENGTH = 160;

const DAY_MS = 86_400_000;
/** Una reazione o un fumetto non durano più di così. */
const MAX_SPAN_MS = 10 * 60_000;

export interface PixyAppearance {
  personality: PersonalityId;
  /** "accent" = colore d'accento del tema di chi guarda, "face" = colore della faccia del tema. */
  color: "accent" | "face";
  showMouth: boolean;
}

export interface SharedReaction {
  pose: PoseId | null;
  emotion: EmotionId;
  glyph: GlyphId | null;
  costume?: CostumeId | null;
  motion?: FaceMotion;
  gaze?: GazeMode;
  doze?: boolean;
  tempo?: number;
  startedAt: number;
  until: number;
  priority: number;
}

export interface SharedBubble {
  id: number;
  text: string;
  until: number;
  durationMs: number;
}

/** Lo stato del cervello che serve per animare il Pixy di un altro (senza "status" e senza sguardo al mouse). */
export interface SharedBrain {
  pose: PoseId;
  mood: EmotionId;
  gaze: GazeMode;
  glyph: GlyphId | null;
  costume: CostumeId | null;
  costumeValue: number | null;
  motion: FaceMotion | null;
  doze: boolean;
  screenGlow: boolean;
  tempo: number;
  blink: boolean;
  wander: boolean;
  breath: boolean;
  reaction: SharedReaction | null;
  bubble: SharedBubble | null;
}

export interface PixyPresence extends PixyAppearance {
  v: 1;
  brain?: SharedBrain;
}

export interface PixyBuildOptions {
  /** "Condividi le espressioni di Pixy". */
  share: boolean;
  /** "Condividi anche i fumetti" (vale solo con share). */
  shareBubbles: boolean;
  /** Ora del server ≈ ora locale + offsetMs. */
  offsetMs: number;
}

const round = (value: number, step: number) => Math.round(value / step) * step;

/** Il proprio payload: l'aspetto sempre, il cervello (in ora del server) solo se condiviso e se Pixy è in uso. */
export function buildPixyPresence(appearance: PixyAppearance, snapshot: BrainSnapshot | null, options: PixyBuildOptions): PixyPresence {
  const presence: PixyPresence = { v: 1, ...appearance };
  if (!options.share || !snapshot) return presence;
  const toServer = (ms: number) => Math.round(ms + options.offsetMs);
  const r = snapshot.reaction;
  const b = options.shareBubbles ? snapshot.bubble : null;
  presence.brain = {
    pose: snapshot.pose,
    mood: snapshot.mood,
    gaze: snapshot.gaze,
    glyph: snapshot.glyph,
    costume: snapshot.costume,
    // la barra del video cambia di continuo: al centesimo basta
    costumeValue: snapshot.costumeValue === null ? null : round(snapshot.costumeValue, 0.01),
    motion: snapshot.motion,
    doze: snapshot.doze,
    screenGlow: snapshot.screenGlow,
    tempo: round(snapshot.tempo, 0.001),
    blink: snapshot.blink,
    wander: snapshot.wander,
    breath: snapshot.breath,
    reaction: r
      ? {
          pose: r.pose,
          emotion: r.emotion,
          glyph: r.glyph,
          ...(r.costume !== undefined ? { costume: r.costume } : {}),
          ...(r.motion !== undefined ? { motion: r.motion } : {}),
          ...(r.gaze !== undefined ? { gaze: r.gaze } : {}),
          ...(r.doze !== undefined ? { doze: r.doze } : {}),
          ...(r.tempo !== undefined ? { tempo: round(r.tempo, 0.001) } : {}),
          startedAt: toServer(r.startedAt),
          until: toServer(r.until),
          priority: r.priority,
        }
      : null,
    bubble: b ? { id: b.id, text: b.text.slice(0, BUBBLE_MAX_LENGTH), until: toServer(b.until), durationMs: b.durationMs } : null,
  };
  return presence;
}

// ---------- Validazione ----------

const POSE_SET = new Set<string>(Object.keys(POSES));
const EMOTION_SET = new Set<string>(EMOTION_IDS);
const GLYPH_SET = new Set<string>(GLYPH_IDS);
const COSTUME_SET = new Set<string>(COSTUME_IDS);
const GAZE_SET = new Set<string>(GAZE_MODES);
const MOTION_SET = new Set<string>(FACE_MOTIONS);
const PERSONALITY_SET = new Set<string>(PERSONALITY_IDS);

const isOneOf = <T extends string>(set: Set<string>, value: unknown): value is T => typeof value === "string" && set.has(value);
const isNumberIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const isBool = (value: unknown): value is boolean => typeof value === "boolean";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function parseSpan(start: unknown, until: unknown, serverNow: number): [number, number] | null {
  if (!isNumberIn(start, serverNow - DAY_MS, serverNow + DAY_MS) || !isNumberIn(until, start, start + MAX_SPAN_MS)) return null;
  return [start, until];
}

function parseReaction(raw: unknown, serverNow: number): SharedReaction | null | undefined {
  if (raw === null) return null;
  if (!isRecord(raw)) return undefined;
  const span = parseSpan(raw.startedAt, raw.until, serverNow);
  if (!span) return undefined;
  if (raw.pose !== null && !isOneOf<PoseId>(POSE_SET, raw.pose)) return undefined;
  if (!isOneOf<EmotionId>(EMOTION_SET, raw.emotion)) return undefined;
  if (raw.glyph !== null && !isOneOf<GlyphId>(GLYPH_SET, raw.glyph)) return undefined;
  if (raw.costume !== undefined && raw.costume !== null && !isOneOf<CostumeId>(COSTUME_SET, raw.costume)) return undefined;
  if (raw.motion !== undefined && !isOneOf<FaceMotion>(MOTION_SET, raw.motion)) return undefined;
  if (raw.gaze !== undefined && !isOneOf<GazeMode>(GAZE_SET, raw.gaze)) return undefined;
  if (raw.doze !== undefined && !isBool(raw.doze)) return undefined;
  if (raw.tempo !== undefined && !isNumberIn(raw.tempo, 0, 4)) return undefined;
  if (!isNumberIn(raw.priority, -1000, 1000)) return undefined;
  const reaction: SharedReaction = {
    pose: raw.pose as PoseId | null,
    emotion: raw.emotion,
    glyph: raw.glyph as GlyphId | null,
    startedAt: span[0],
    until: span[1],
    priority: raw.priority,
  };
  if (raw.costume !== undefined) reaction.costume = raw.costume as CostumeId | null;
  if (raw.motion !== undefined) reaction.motion = raw.motion as FaceMotion;
  if (raw.gaze !== undefined) reaction.gaze = raw.gaze as GazeMode;
  if (raw.doze !== undefined) reaction.doze = raw.doze as boolean;
  if (raw.tempo !== undefined) reaction.tempo = raw.tempo as number;
  return reaction;
}

function parseBubble(raw: unknown, serverNow: number): SharedBubble | null | undefined {
  if (raw === null) return null;
  if (!isRecord(raw)) return undefined;
  if (!isNumberIn(raw.id, 0, Number.MAX_SAFE_INTEGER) || !Number.isInteger(raw.id)) return undefined;
  if (typeof raw.text !== "string" || raw.text.length > BUBBLE_MAX_LENGTH) return undefined;
  const text = raw.text.trim();
  if (!text) return undefined;
  if (!isNumberIn(raw.until, serverNow - DAY_MS, serverNow + MAX_SPAN_MS)) return undefined;
  if (!isNumberIn(raw.durationMs, 0, MAX_SPAN_MS)) return undefined;
  return { id: raw.id, text, until: raw.until, durationMs: raw.durationMs };
}

function parseBrain(raw: unknown, serverNow: number): SharedBrain | null {
  if (!isRecord(raw)) return null;
  if (!isOneOf<PoseId>(POSE_SET, raw.pose) || !isOneOf<EmotionId>(EMOTION_SET, raw.mood) || !isOneOf<GazeMode>(GAZE_SET, raw.gaze)) return null;
  if (raw.glyph !== null && !isOneOf<GlyphId>(GLYPH_SET, raw.glyph)) return null;
  if (raw.costume !== null && !isOneOf<CostumeId>(COSTUME_SET, raw.costume)) return null;
  if (raw.costumeValue !== null && !isNumberIn(raw.costumeValue, 0, 1)) return null;
  if (raw.motion !== null && !isOneOf<FaceMotion>(MOTION_SET, raw.motion)) return null;
  if (!isNumberIn(raw.tempo, 0, 4)) return null;
  for (const key of ["doze", "screenGlow", "blink", "wander", "breath"] as const) if (!isBool(raw[key])) return null;
  const reaction = parseReaction(raw.reaction, serverNow);
  const bubble = parseBubble(raw.bubble, serverNow);
  if (reaction === undefined || bubble === undefined) return null;
  return {
    pose: raw.pose,
    mood: raw.mood,
    gaze: raw.gaze,
    glyph: raw.glyph as GlyphId | null,
    costume: raw.costume as CostumeId | null,
    costumeValue: raw.costumeValue as number | null,
    motion: raw.motion as FaceMotion | null,
    doze: raw.doze as boolean,
    screenGlow: raw.screenGlow as boolean,
    tempo: raw.tempo,
    blink: raw.blink as boolean,
    wander: raw.wander as boolean,
    breath: raw.breath as boolean,
    reaction,
    bubble,
  };
}

/**
 * Un payload ricevuto, controllato campo per campo; null se non è valido o è di un'altra versione. Un cervello
 * non valido si scarta da solo (resta l'aspetto); i campi in più si tolgono.
 */
export function parsePixyPresence(raw: unknown, serverNow: number): PixyPresence | null {
  if (!isRecord(raw) || raw.v !== PIXY_PRESENCE_VERSION) return null;
  if (!isOneOf<PersonalityId>(PERSONALITY_SET, raw.personality)) return null;
  if (raw.color !== "accent" && raw.color !== "face") return null;
  if (!isBool(raw.showMouth)) return null;
  const presence: PixyPresence = { v: 1, personality: raw.personality, color: raw.color, showMouth: raw.showMouth };
  if (raw.brain !== undefined) {
    const brain = parseBrain(raw.brain, serverNow);
    if (brain) presence.brain = brain;
  }
  return presence;
}

/** Lo stato di un canale: utente → Pixy. Con più dispositivi vince quello che condivide le espressioni. */
export function parsePixyChannelState(state: Record<string, unknown[]>, serverNow: number): Record<string, PixyPresence> {
  const members: Record<string, PixyPresence> = {};
  for (const [userId, entries] of Object.entries(state)) {
    let best: PixyPresence | null = null;
    for (const entry of entries) {
      const p = parsePixyPresence(entry, serverNow);
      if (p && (!best || (p.brain && !best.brain))) best = p;
    }
    if (best) members[userId] = best;
  }
  return members;
}

/**
 * Il cervello ricevuto come BrainSnapshot da dare all'animatore, con gli istanti riportati all'orologio locale
 * (`offsetMs` = ora del server − ora locale). Reazioni e fumetti già finiti (`localNow`) si tolgono.
 */
export function sharedToSnapshot(p: PixyPresence & { brain: SharedBrain }, offsetMs: number, localNow: number): BrainSnapshot {
  const b = p.brain;
  const toLocal = (ms: number) => ms - offsetMs;
  const r = b.reaction;
  const reaction: Reaction | null =
    r && toLocal(r.until) > localNow ? { ...r, startedAt: toLocal(r.startedAt), until: toLocal(r.until) } : null;
  const bubble: Bubble | null =
    b.bubble && toLocal(b.bubble.until) > localNow
      ? { id: b.bubble.id, text: b.bubble.text, until: toLocal(b.bubble.until), durationMs: b.bubble.durationMs, priority: 0 }
      : null;
  return {
    pose: b.pose,
    status: POSES[b.pose].label,
    personality: p.personality,
    mood: b.mood,
    gaze: b.gaze,
    glyph: b.glyph,
    costume: b.costume,
    costumeValue: b.costumeValue,
    motion: b.motion,
    doze: b.doze,
    screenGlow: b.screenGlow,
    tempo: b.tempo,
    canFollow: false,
    reaction,
    bubble,
    blink: b.blink,
    wander: b.wander,
    breath: b.breath,
  };
}

/** Quando lo snapshot da `sharedToSnapshot` va rifatto: alla fine della reazione o del fumetto (ora locale). */
export function nextExpiry(snapshot: BrainSnapshot): number | null {
  const times = [snapshot.reaction?.until, snapshot.bubble?.until].filter((t): t is number => t !== undefined);
  return times.length ? Math.min(...times) : null;
}
