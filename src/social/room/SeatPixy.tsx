import { useCallback, useState, useSyncExternalStore } from "react";
import { useLatestRef } from "../../core/hooks/useLatestRef";
import { FaceAnimator, type FaceFrame } from "../../core/pixy/engine/animator";
import { PERSONALITIES, type PersonalityId } from "../../core/pixy/engine/personalities";
import type { PoseId } from "../../core/pixy/engine/poses";
import { poseSnapshot } from "../../core/pixy/engine/poseSnapshot";
import type { BrainSnapshot } from "../../core/pixy/engine/snapshot";
import { getMyPixy, subscribeMyPixy } from "../../core/pixy/myPixy";
import PixyFace from "../../core/pixy/PixyFace";
import { DEFAULT_SETTINGS } from "../../core/settings/schema";
import { useSettings } from "../../core/settings/useSettings";
import type { MemberKind } from "../modules/study/leaderboard";
import { sharedToSnapshot, type PixyPresence } from "../modules/pixy/payload";

/** Un punto della faccia, in px: larghezza della testa (54 px, RoomScene.css) / (FACE_W 30 + 2 × padding 1). */
const HEAD_POINT_SIZE = 54 / 32;

/** Senza espressioni condivise si vede solo lo studio: la posa viene dal timer (già condiviso). */
function studyPose(kind: MemberKind): PoseId {
  if (kind === "studying") return "study";
  if (kind === "paused") return "study_wait";
  if (kind === "break") return "study_break";
  return "idle";
}

interface SeatPixyProps {
  kind: MemberKind;
  isMe: boolean;
  /** Il Pixy ricevuto dal compagno (assente = solo la posa dello studio, aspetto di default). */
  pixy: PixyPresence | undefined;
  /** Ora del server − ora locale. */
  offsetMs: number;
  /** Ora locale, aggiornata ogni secondo dalla pagina: toglie reazioni e fumetti finiti. */
  localNow: number;
  /** Scala della sala: il canvas si disegna a quella risoluzione, così resta nitido anche ingrandito. */
  renderScale: number;
}

/**
 * Il Pixy di un posto della Stanza comune, con il suo animatore. Il mio è quello del Companion, come lo vedo
 * nel widget; quello di un compagno segue ciò che condivide (le espressioni solo se le condivide).
 */
function SeatPixy({ kind, isMe, pixy, offsetMs, localNow, renderScale }: SeatPixyProps) {
  const { settings } = useSettings();
  const [animator] = useState(() => new FaceAnimator());
  const mine = useSyncExternalStore(subscribeMyPixy, getMyPixy);

  let snapshot: BrainSnapshot;
  let color: "accent" | "face";
  let showMouth: boolean;
  let showBubble: boolean;
  if (isMe) {
    snapshot = mine ?? poseSnapshot(studyPose(kind), settings.companionPersonality);
    color = settings.companionColor === "accent" ? "accent" : "face";
    showMouth = settings.companionShowMouth;
    showBubble = true;
  } else {
    const personality: PersonalityId = pixy?.personality ?? DEFAULT_SETTINGS.companionPersonality;
    snapshot = pixy?.brain
      ? sharedToSnapshot({ ...pixy, brain: pixy.brain }, offsetMs, localNow)
      : poseSnapshot(studyPose(kind), personality);
    color = pixy?.color ?? "face";
    showMouth = pixy?.showMouth ?? DEFAULT_SETTINGS.companionShowMouth;
    showBubble = settings.groupsShowOthersBubbles;
  }

  const snapshotRef = useLatestRef(snapshot);
  const stillRef = useLatestRef(!settings.animationsEnabled);
  const sample = useCallback(
    (t: number): FaceFrame => {
      const snap = snapshotRef.current;
      return animator.advance(t, snap, { blinkMs: PERSONALITIES[snap.personality].blinkMs, pointer: null, still: stillRef.current });
    },
    [animator, snapshotRef, stillRef]
  );

  const bubble = showBubble ? snapshot.bubble : null;
  return (
    <PixyFace
      sample={sample}
      color={color}
      showMouth={showMouth}
      bubble={bubble}
      bubbleSize="small"
      // il canvas è più grande della testa (per simboli e costumi): la faccia resta grande quanto la testa
      maxPointSize={HEAD_POINT_SIZE}
      // in Fosforo i LED scendono sotto i 3 px perché la faccia stia nella testa
      minPointSize={1}
      padding={1}
      renderScale={renderScale}
      className="room-seat-face"
    />
  );
}

export default SeatPixy;
