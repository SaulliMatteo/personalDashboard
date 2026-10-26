import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useActivityStatus } from "../../../../core/activity/activityBus";
import { retryDelayMs } from "../../../../core/cloud/backoff";
import { fetchStudyTotals } from "../../../../core/cloud/studyTotalsApi";
import { useCloud } from "../../../../core/cloud/useCloud";
import { periodRange } from "../../../../core/report/periods";
import { useGroups } from "../../../groups/useGroups";
import { getSessionSpansBetween } from "../data/studyTotalsRepository";
import { useStudyPresence } from "../presence/useStudyPresence";
import { dayKey } from "../sync/plan";
import { StudyTotalsContext, type StudyTotalsValue } from "./useStudyTotals";

/** Ogni quanto si rileggono i totali dei compagni. */
const REFRESH_MS = 2 * 60_000;
/** Dopo che un compagno smette di studiare: il tempo che la sua app invii la sessione appena chiusa. */
const AFTER_STOP_MS = 15_000;

interface Loaded {
  /** Per quali utenti: se l'elenco cambia (o si esce) questi totali non valgono più. */
  userKey: string;
  today: Record<string, number>;
  week: Record<string, number>;
  loadedAt: number;
}

/**
 * Totali di oggi e della settimana (da lunedì) di tutti i membri dei propri gruppi, per le classifiche.
 * Il giorno è quello locale di questo computer: tra amici nello stesso fuso coincide con il loro.
 */
export function StudyTotalsProvider({ children }: { children: ReactNode }) {
  const { status, userId } = useCloud();
  const { members } = useGroups();
  const { members: live } = useStudyPresence();
  const { studyTodaySeconds } = useActivityStatus();
  const ready = status.kind === "ready";
  const [data, setData] = useState<Loaded | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [myWeek, setMyWeek] = useState(0);
  const reloadRef = useRef<() => void>(() => {});

  const userKey = [...new Set(Object.values(members).flatMap((list) => list.map((m) => m.userId)))].sort().join(",");

  useEffect(() => {
    if (!ready || !userKey) return;
    const userIds = userKey.split(",");
    let disposed = false;
    let timer: number | undefined;
    let failures = 0;
    const load = () => {
      window.clearTimeout(timer);
      const now = new Date();
      const today = dayKey(now);
      const monday = dayKey(new Date(periodRange("week", 0, now).start));
      fetchStudyTotals(userIds, monday, today)
        .then((rows) => {
          if (disposed) return;
          failures = 0;
          const next: Loaded = { userKey, today: {}, week: {}, loadedAt: Date.now() };
          for (const r of rows) {
            next.week[r.userId] = (next.week[r.userId] ?? 0) + r.seconds;
            if (r.day === today) next.today[r.userId] = (next.today[r.userId] ?? 0) + r.seconds;
          }
          setData(next);
          setFailedKey(null);
          timer = window.setTimeout(load, REFRESH_MS);
        })
        .catch(() => {
          if (disposed) return;
          setFailedKey(userKey);
          timer = window.setTimeout(load, retryDelayMs(failures++));
        });
    };
    reloadRef.current = load;
    load();
    const onOnline = () => {
      failures = 0;
      load();
    };
    window.addEventListener("online", onOnline);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      reloadRef.current = () => {};
    };
  }, [ready, userKey]);

  // Chi smette di studiare ha appena chiuso una sessione: la si rilegge poco dopo, quando la sua app l'ha inviata.
  const studyingKey = Object.values(live)
    .flatMap((byUser) => Object.entries(byUser).filter(([, p]) => p.phase === "work").map(([id]) => id))
    .sort()
    .join(",");
  const previousStudying = useRef("");
  useEffect(() => {
    const before = previousStudying.current ? previousStudying.current.split(",") : [];
    previousStudying.current = studyingKey;
    const now = new Set(studyingKey ? studyingKey.split(",") : []);
    if (!before.some((id) => !now.has(id))) return;
    const t = window.setTimeout(() => reloadRef.current(), AFTER_STOP_MS);
    return () => window.clearTimeout(t);
  }, [studyingKey]);

  // La mia settimana dal database locale (sempre aggiornata, anche prima che l'invio vada a buon fine).
  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    getSessionSpansBetween(periodRange("week", 0, now).start, now.getTime() + 1)
      .then((spans) => {
        if (!cancelled) setMyWeek(spans.reduce((sum, s) => sum + s.durationSeconds, 0));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [studyTodaySeconds]);

  const value = useMemo<StudyTotalsValue>(() => {
    const current = ready && data?.userKey === userKey ? data : null;
    const today = { ...(current?.today ?? {}) };
    const week = { ...(current?.week ?? {}) };
    if (userId) {
      today[userId] = studyTodaySeconds;
      week[userId] = Math.max(myWeek, studyTodaySeconds);
    }
    return { today, week, stale: ready && failedKey === userKey, loadedAt: current?.loadedAt ?? null };
  }, [data, ready, userKey, failedKey, userId, studyTodaySeconds, myWeek]);

  return <StudyTotalsContext.Provider value={value}>{children}</StudyTotalsContext.Provider>;
}
