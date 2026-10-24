import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { joinPresenceChannel } from "../../../core/cloud/presence";
import { useCloud } from "../../../core/cloud/useCloud";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import { getMyPixy, subscribeMyPixy } from "../../../core/pixy/myPixy";
import type { BrainSnapshot } from "../../../core/pixy/engine/snapshot";
import { useSettings } from "../../../core/settings/useSettings";
import { useGroups } from "../../groups/useGroups";
import { startClockSync } from "../../presence/clockSync";
import { openChannels } from "../../presence/openChannels";
import { PresenceHub, type PresenceSnapshot } from "../../presence/presenceHub";
import { PIXY_FEATURE_KEY } from "./feature";
import { buildPixyPresence, parsePixyChannelState, type PixyAppearance, type PixyPresence } from "./payload";
import { PixyPresenceContext, type PixyPresenceValue } from "./usePixyPresence";

/** Pixy cambia posa poche volte al minuto, ma una reazione o la barra di un video possono cambiare spesso. */
const MIN_TRACK_INTERVAL_MS = 2000;

interface LocalPixy {
  appearance: PixyAppearance;
  snapshot: BrainSnapshot | null;
  share: boolean;
  shareBubbles: boolean;
}

const EMPTY: PresenceSnapshot<PixyPresence> = { members: {}, channels: {} };

/**
 * I Pixy dei compagni nei canali `group:<id>:pixy`: manda il proprio (l'aspetto sempre, le espressioni solo se
 * l'utente le condivide) e raccoglie quelli degli altri. Attivo solo con l'account pronto.
 */
export function PixyPresenceProvider({ children }: { children: ReactNode }) {
  const { status, userId } = useCloud();
  const { settings } = useSettings();
  const { groups } = useGroups();
  const activeUser = status.kind === "ready" ? userId : null;
  const [snapshot, setSnapshot] = useState<PresenceSnapshot<PixyPresence>>(EMPTY);
  const [offsetMs, setOffsetMs] = useState(0);
  const hubRef = useRef<PresenceHub<LocalPixy, PixyPresence> | null>(null);
  const groupKey = groups
    .filter((g) => g.features.includes(PIXY_FEATURE_KEY))
    .map((g) => g.id)
    .join(",");
  const groupKeyRef = useLatestRef(groupKey);

  const { companionPersonality, companionColor, companionShowMouth, groupsSharePixy, groupsSharePixyBubbles } = settings;
  const readLocal = useCallback(
    (): LocalPixy => ({
      appearance: { personality: companionPersonality, color: companionColor === "accent" ? "accent" : "face", showMouth: companionShowMouth },
      snapshot: getMyPixy(),
      share: groupsSharePixy,
      shareBubbles: groupsSharePixy && groupsSharePixyBubbles,
    }),
    [companionPersonality, companionColor, companionShowMouth, groupsSharePixy, groupsSharePixyBubbles]
  );
  const readLocalRef = useLatestRef(readLocal);

  useEffect(() => {
    hubRef.current?.setLocal(readLocal());
  }, [readLocal]);

  useEffect(() => {
    if (!activeUser) return;
    let disposed = false;
    const next = new PresenceHub<LocalPixy, PixyPresence>(
      {
        now: () => Date.now(),
        join: (groupId, listeners) => joinPresenceChannel(groupId, PIXY_FEATURE_KEY, activeUser, listeners),
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (handle) => window.clearTimeout(handle as number),
        onChange: (value) => {
          if (!disposed) setSnapshot(value);
        },
      },
      {
        build: (local, _groupId, offset) =>
          buildPixyPresence(local.appearance, local.snapshot, { share: local.share, shareBubbles: local.shareBubbles, offsetMs: offset }),
        parse: parsePixyChannelState,
      },
      readLocalRef.current(),
      { minTrackIntervalMs: MIN_TRACK_INTERVAL_MS }
    );
    hubRef.current = next;
    openChannels(next, groupKeyRef.current);

    // il hub rimanda solo se il payload è diverso (senza condivisione non cambia mai)
    const unsubscribe = subscribeMyPixy(() => next.setLocal(readLocalRef.current()));
    const stopClock = startClockSync((offset) => {
      if (disposed) return;
      next.setOffset(offset);
      setOffsetMs(offset);
    });

    return () => {
      disposed = true;
      unsubscribe();
      stopClock();
      next.stop();
      hubRef.current = null;
      setSnapshot(EMPTY);
    };
  }, [activeUser, readLocalRef, groupKeyRef]);

  useEffect(() => {
    if (hubRef.current) openChannels(hubRef.current, groupKey);
  }, [groupKey]);

  const value = useMemo<PixyPresenceValue>(() => ({ members: snapshot.members, offsetMs }), [snapshot, offsetMs]);

  return <PixyPresenceContext.Provider value={value}>{children}</PixyPresenceContext.Provider>;
}
