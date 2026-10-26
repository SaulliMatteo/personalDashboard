import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getActivity, subscribeActivity } from "../../../../core/activity/activityBus";
import { joinPresenceChannel } from "../../../../core/cloud/presence";
import { useCloud } from "../../../../core/cloud/useCloud";
import { useLatestRef } from "../../../../core/hooks/useLatestRef";
import { useSettings } from "../../../../core/settings/useSettings";
import { useGroups } from "../../../groups/useGroups";
import { startClockSync } from "../../../presence/clockSync";
import { openChannels } from "../../../presence/openChannels";
import { STUDY_FEATURE_KEY } from "../feature";
import { StudyPresenceHub, type LocalStudyState, type PresenceSnapshot } from "./presenceHub";
import { StudyPresenceContext, type StudyPresenceValue } from "./useStudyPresence";

const EMPTY: PresenceSnapshot = { members: {}, channels: {} };

/**
 * Presenza live dello Studio nei canali dei propri gruppi: manda il proprio timer (dal bus) e raccoglie quello
 * dei compagni. Attiva solo con l'account pronto; senza, tutti risultano offline. L'elenco dei gruppi viene
 * dal nucleo (social/groups), che lo rilegge da solo e dopo ogni azione.
 */
export function StudyPresenceProvider({ children }: { children: ReactNode }) {
  const { status, userId } = useCloud();
  const { settings } = useSettings();
  const { groups } = useGroups();
  const activeUser = status.kind === "ready" ? userId : null;
  const [snapshot, setSnapshot] = useState<PresenceSnapshot>(EMPTY);
  const [rooms, setRooms] = useState<Record<string, number>>({});
  const hubRef = useRef<StudyPresenceHub | null>(null);
  const showSubject = settings.groupsShowSubject;
  // gruppi con lo Studio attivo, come stringa: l'effetto dei canali riparte solo se l'elenco cambia davvero
  const groupKey = groups
    .filter((g) => g.features.includes(STUDY_FEATURE_KEY))
    .map((g) => g.id)
    .join(",");
  const groupKeyRef = useLatestRef(groupKey);

  // Lo stato da mandare: timer e materia dal bus, più le scelte dell'utente.
  const readLocal = useCallback((): LocalStudyState => {
    const activity = getActivity();
    return { timer: activity.studyTimer, subject: showSubject ? activity.studySubjectName : null, rooms };
  }, [showSubject, rooms]);
  const readLocalRef = useLatestRef(readLocal);

  useEffect(() => {
    hubRef.current?.setLocal(readLocal());
  }, [readLocal]);

  useEffect(() => {
    if (!activeUser) return;
    let disposed = false;
    const next = new StudyPresenceHub({
      now: () => Date.now(),
      join: (groupId, listeners) => joinPresenceChannel(groupId, STUDY_FEATURE_KEY, activeUser, listeners),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (handle) => window.clearTimeout(handle as number),
      onChange: (value) => {
        if (!disposed) setSnapshot(value);
      },
    });
    hubRef.current = next;
    next.setLocal(readLocalRef.current());
    openChannels(next, groupKeyRef.current);

    // il bus cambia oggetto solo quando cambia qualcosa; il hub rimanda solo se il payload è diverso
    const unsubscribe = subscribeActivity(() => next.setLocal(readLocalRef.current()));

    // Scarto dell'orologio: subito, poi ogni 10 minuti.
    const stopClock = startClockSync((offset) => {
      if (!disposed) next.setOffset(offset);
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

  // Canali da aprire: prima si passa a Realtime il token della sessione (le policy dei canali lo leggono).
  useEffect(() => {
    if (hubRef.current) openChannels(hubRef.current, groupKey);
  }, [groupKey]);

  const setRoom = useCallback((groupId: string, room: number | null) => {
    setRooms((current) => {
      const next = { ...current };
      if (room === null) delete next[groupId];
      else next[groupId] = room;
      return next;
    });
  }, []);

  const serverNow = useCallback(() => hubRef.current?.serverNow() ?? Date.now(), []);

  const value = useMemo<StudyPresenceValue>(
    () => ({ members: snapshot.members, channels: snapshot.channels, serverNow, rooms, setRoom }),
    [snapshot, serverNow, rooms, setRoom]
  );

  return <StudyPresenceContext.Provider value={value}>{children}</StudyPresenceContext.Provider>;
}
