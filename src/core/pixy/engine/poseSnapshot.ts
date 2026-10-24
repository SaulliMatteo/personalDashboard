import { EMOTIONS } from "./face";
import { PERSONALITIES, type PersonalityId } from "./personalities";
import { resolvePose, type PoseId } from "./poses";
import type { BrainSnapshot } from "./snapshot";

/**
 * Lo stato di un Pixy fermo in una posa, senza cervello: niente reazioni né fumetti, tutte le animazioni accese.
 * Serve per il Pixy di chi non condivide le espressioni (si vede solo la posa dello studio, dal timer) o quando
 * il Companion non è in uso. Puro.
 */
export function poseSnapshot(pose: PoseId, personality: PersonalityId): BrainSnapshot {
  const spec = resolvePose(pose, personality);
  const p = PERSONALITIES[personality];
  const mood = pose === "idle" ? p.baseMood : spec.mood;
  const costume = spec.costume ?? null;
  return {
    pose,
    status: spec.label,
    personality,
    mood,
    gaze: spec.gaze,
    glyph: spec.glyph !== undefined ? spec.glyph : (EMOTIONS[mood].glyph ?? null),
    costume,
    costumeValue: null,
    motion: spec.motion ?? null,
    doze: spec.doze ?? false,
    screenGlow: spec.glow ?? false,
    tempo: p.tempo * (spec.speed ?? 1),
    canFollow: false,
    reaction: null,
    bubble: null,
    blink: true,
    wander: true,
    breath: true,
  };
}
