import { useEffect, useMemo, useState, type ReactNode } from "react";
import { publishActivity } from "../../../core/activity/activityBus";
import { useSettings } from "../../../core/settings/useSettings";
import { onSyncApplied } from "../../../core/sync/syncEvents";
import { getFirstSessionTime, getSessionsBetween, type StudySession } from "../data/studyRepository";
import { computeProgression, dayStartsBetween, nextStepText, roman, secondsPerDay, type ProgressDay } from "../lib/progression";
import { todayGoalSeconds } from "../lib/schedule";
import { useTimer } from "../timer/useTimer";
import { ProgressionContext } from "./useProgression";

const DAY_MS = 24 * 60 * 60 * 1000;
const TRAIT_DAYS = 30;

/**
 * Calcola la progressione dello Studio (lib/progression.ts) una volta per tutta l'app: la leggono la scheda Rune, la
 * card dello Studio e, dal bus delle attività, la barra laterale. Gira in ogni tema, così il livello salvato
 * (`studyLevelReached`, sincronizzato) sale anche se Ombra non è il tema scelto. Rilegge le sessioni quando ne viene
 * registrata una (cambia il totale di oggi), a mezzanotte e quando ne arrivano dagli altri dispositivi.
 */
function ProgressionProvider({ children }: { children: ReactNode }) {
  const { ready, subjects, todayBySubject, dayStart } = useTimer();
  const { settings, updateSetting } = useSettings();
  const [sessions, setSessions] = useState<StudySession[] | null>(null);
  const [syncTick, setSyncTick] = useState(0);
  // `todayBySubject` si ricrea a ogni controllo (ogni minuto): si ricarica solo se il totale di oggi cambia
  const todaySeconds = Object.values(todayBySubject).reduce((sum, v) => sum + v, 0);

  useEffect(
    () =>
      onSyncApplied(({ kinds }) => {
        if (kinds.has("session")) setSyncTick((n) => n + 1);
      }),
    []
  );

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        const first = await getFirstSessionTime();
        const all = first === null ? [] : await getSessionsBetween(first, dayStart + 2 * DAY_MS);
        if (!cancelled) setSessions(all);
      } catch (error) {
        console.error("Progressione dello Studio non calcolata:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, todaySeconds, dayStart, syncTick]);

  const fallback = settings.studyDailyGoalMinutes;
  const stored = settings.studyLevelReached;
  const progression = useMemo(() => {
    if (!sessions) return null;
    const starts = dayStartsBetween(sessions[0]?.endedAt ?? dayStart, dayStart);
    const seconds = secondsPerDay(starts, sessions);
    const days: ProgressDay[] = starts.map((s, i) => ({ dayStart: s, seconds: seconds[i], goalSeconds: todayGoalSeconds(subjects, new Date(s), fallback) }));
    const hasGoal = fallback > 0 || subjects.some((s) => s.dailyGoalMinutes > 0);
    const recentFrom = starts[Math.max(0, starts.length - TRAIT_DAYS)];
    return computeProgression({
      days,
      hasGoal,
      storedLevel: stored,
      recentSessions: sessions.filter((s) => s.endedAt >= recentFrom),
    });
  }, [sessions, subjects, fallback, stored, dayStart]);

  // Il livello non scende mai: quello raggiunto si salva (e viaggia col sync).
  useEffect(() => {
    if (progression && progression.level > stored) updateSetting("studyLevelReached", progression.level);
  }, [progression, stored, updateSetting]);

  const summary = useMemo(
    () =>
      progression && {
        levelText: roman(progression.level),
        gradeText: roman(progression.grade),
        fullCores: progression.fullCores,
        coreFill: progression.coreFill,
        coreCap: progression.coreCap,
        nextText: nextStepText(progression),
      },
    [progression]
  );
  useEffect(() => {
    publishActivity({ studyProgress: summary });
  }, [summary]);

  return <ProgressionContext.Provider value={progression}>{children}</ProgressionContext.Provider>;
}

export default ProgressionProvider;
