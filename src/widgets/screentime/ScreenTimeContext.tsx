import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSettings } from "../../core/settings/useSettings";
import { useLatestRef } from "../../core/hooks/useLatestRef";
import { getMeta, setMeta } from "../../core/db/meta";
import { sendAppNotification } from "../../core/notify/notifier";
import { registerBeforeQuit } from "../../core/system/beforeQuit";
import { setTrayToday } from "../../core/system/appWindowApi";
import { parseAppCategories, serializeAppCategories, type AppCategory } from "../../core/system/appCategory";
import { SCREENTIME_AVAILABLE, startRecorder, stopRecorder, takeSegments } from "./data/screentimeApi";
import * as repo from "./data/screentimeRepository";
import { classifySegment, type RawSegment } from "./lib/classify";
import { countedIntervals, dayKey, segmentsToDeltas } from "./lib/aggregate";
import { BREAK_MS, breakReminderStep, continuousMinutes, extendSessions, type Session } from "./lib/sessions";
import { parseFocusClasses, serializeFocusClasses, type FocusClass } from "./lib/focus";
import { dueNotices, emptyNoticeState, parseNoticeState, type ScreenLimit } from "./lib/limits";
import { limitUsage, summarize, type ClassifyContext, type UsageRow } from "./lib/summary";
import { formatDuration } from "./lib/format";
import { SCREENTIME_WIDGET_ID, ScreenTimeContext, type LimitStatus, type ScreenTimeContextValue } from "./useScreenTime";

/** Ogni quanto si ritira dal registratore e si salva (con la finestra nascosta la WebView può allungarlo a ~1 min). */
const FLUSH_MS = 30_000;
const NOTICES_META = "screentime_limit_notices";
const PRUNE_META = "screentime_pruned_day";
/** Si tengono ~13 mesi di dati: abbastanza per confrontare con l'anno prima, pochi KB al mese. */
const KEEP_DAYS = 400;

/** Secondi di `rows` fino all'ora del giorno di `now` (l'ora in corso in proporzione ai minuti passati). */
function untilSameTime(rows: UsageRow[], now: number): number {
  const d = new Date(now);
  const hour = d.getHours();
  const part = (d.getMinutes() * 60 + d.getSeconds()) / 3600;
  return rows.reduce((sum, r) => sum + (r.hour < hour ? r.seconds : r.hour === hour ? r.seconds * part : 0), 0);
}

function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + delta, 12).getTime());
}

/**
 * Tempo al PC: sempre montato (anche col widget fuori dalla dashboard), conta solo su Windows e macOS con
 * `screentimeEnabled`. Ogni 30 s ritira i segmenti dal registratore in Rust, li classifica (app, sito dal titolo,
 * categoria), butta il titolo e somma i secondi nel DB; poi controlla limiti e pausa e aggiorna il menu dell'icona.
 */
export function ScreenTimeProvider({ children }: { children: ReactNode }) {
  const { settings, updateSetting } = useSettings();
  const settingsRef = useLatestRef(settings);
  const enabled = SCREENTIME_AVAILABLE && settings.screentimeEnabled;

  const manual = useMemo(() => parseAppCategories(settings.companionAppCategories), [settings.companionAppCategories]);
  const classes = useMemo(() => parseFocusClasses(settings.screentimeFocusClasses), [settings.screentimeFocusClasses]);
  const classify = useMemo<ClassifyContext>(() => ({ manual, classes }), [manual, classes]);
  const classifyRef = useLatestRef(classify);

  const [loading, setLoading] = useState(SCREENTIME_AVAILABLE);
  const [todayRows, setTodayRows] = useState<UsageRow[]>([]);
  const [yesterdayRows, setYesterdayRows] = useState<UsageRow[]>([]);
  const [limitList, setLimitList] = useState<ScreenLimit[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const sessionRef = useRef<Session | null>(null);
  const remindedRef = useRef<{ startAt: number; steps: number }>({ startAt: 0, steps: 0 });
  const limitsRef = useRef<ScreenLimit[]>([]);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  /** Rilegge oggi e ieri dal DB. */
  const reload = useCallback(async () => {
    const today = dayKey(Date.now());
    const yesterday = shiftDay(today, -1);
    const rows = await repo.usageBetween(yesterday, today);
    setTodayRows(rows.filter((r) => r.day === today));
    setYesterdayRows(rows.filter((r) => r.day === yesterday));
    setNow(Date.now());
    setRevision((r) => r + 1);
    return rows.filter((r) => r.day === today);
  }, []);

  /** Limiti superati e pausa: notifiche (firmate da Pixy, vedi companion/notify/pixyNotifications.ts). */
  const checkNotices = useCallback(
    async (rows: UsageRow[]) => {
      const cfg = settingsRef.current;
      const ctx = classifyRef.current;
      const today = dayKey(Date.now());
      if (limitsRef.current.length > 0) {
        const saved = parseNoticeState(await getMeta(NOTICES_META)) ?? emptyNoticeState(today);
        const { notices, state } = dueNotices(limitsRef.current, (l) => limitUsage(rows, l, ctx.manual), saved, today);
        if (notices.length > 0 || state.day !== saved.day) await setMeta(NOTICES_META, JSON.stringify(state));
        for (const n of notices) {
          const left = Math.max(0, n.limit.minutes * 60 - n.usedSeconds);
          await sendAppNotification(
            n.level === "near"
              ? {
                  kind: "screenLimitNear",
                  title: `${n.limit.label}: mancano ${formatDuration(left)}`,
                  body: `Oggi sei a ${formatDuration(n.usedSeconds)} dei ${formatDuration(n.limit.minutes * 60)} che ti sei dato.`,
                  open: { type: "widget", widgetId: SCREENTIME_WIDGET_ID },
                }
              : {
                  kind: "screenLimitReached",
                  title: `Limite raggiunto: ${n.limit.label}`,
                  body: `Oggi hai passato ${formatDuration(n.usedSeconds)} su ${n.limit.label}.`,
                  open: { type: "widget", widgetId: SCREENTIME_WIDGET_ID },
                }
          );
        }
      }
      const cur = sessionRef.current;
      const minutes = continuousMinutes(cur, Date.now());
      if (cur && remindedRef.current.startAt !== cur.startAt) remindedRef.current = { startAt: cur.startAt, steps: 0 };
      const step = breakReminderStep(minutes, cfg.screentimeBreakMinutes, remindedRef.current.steps);
      if (cur && step !== null) {
        remindedRef.current = { startAt: cur.startAt, steps: step };
        await sendAppNotification({
          kind: "screenBreak",
          title: `Sei al PC da ${formatDuration(minutes * 60)}`,
          body: "Alzati cinque minuti e guarda lontano.",
          open: { type: "widget", widgetId: SCREENTIME_WIDGET_ID },
          inbox: false,
        });
      }
      const total = rows.reduce((sum, r) => sum + r.seconds, 0);
      void setTrayToday(`Tempo al PC oggi: ${formatDuration(total)}`).catch(() => {});
    },
    [settingsRef, classifyRef]
  );

  /** Segmenti → DB (righe per ora e sessioni). */
  const record = useCallback(async (raw: RawSegment[]) => {
    if (raw.length === 0) return;
    const segments = raw.map(classifySegment);
    await repo.addUsage(segmentsToDeltas(segments));
    const { current, closed } = extendSessions(sessionRef.current, countedIntervals(segments));
    sessionRef.current = current;
    setSession(current);
    await repo.saveSessions(current ? [...closed, current] : closed);
  }, []);

  /** Un salvataggio alla volta: quelli chiesti nel frattempo si accodano. */
  const flush = useCallback(() => {
    const run = async () => {
      if (!SCREENTIME_AVAILABLE) return;
      try {
        await record(await takeSegments());
        const rows = await reload();
        await checkNotices(rows);
      } catch (error) {
        console.error("Tempo al PC: salvataggio non riuscito", error);
      }
    };
    queueRef.current = queueRef.current.then(run, run);
    return queueRef.current;
  }, [record, reload, checkNotices]);

  // Avvio: pulizia dei dati vecchi (una volta al giorno), sessione da continuare, limiti, primi dati.
  useEffect(() => {
    if (!SCREENTIME_AVAILABLE) return;
    let cancelled = false;
    void (async () => {
      try {
        const today = dayKey(Date.now());
        if ((await getMeta(PRUNE_META)) !== today) {
          await repo.pruneBefore(shiftDay(today, -KEEP_DAYS), Date.now() - KEEP_DAYS * 86_400_000);
          await setMeta(PRUNE_META, today);
        }
        const last = await repo.lastSession();
        if (last && Date.now() - last.endAt < BREAK_MS && !sessionRef.current) {
          sessionRef.current = last;
          setSession(last);
        }
        const limits = await repo.listLimits();
        if (cancelled) return;
        limitsRef.current = limits;
        setLimitList(limits);
        await reload();
      } catch (error) {
        console.error("Tempo al PC: lettura non riuscita", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // Registratore acceso finché il conteggio è attivo; spegnendolo si salva l'ultimo pezzo. Avvio e arresto passano
  // dalla stessa coda: smontaggio e rimontaggio ravvicinati (StrictMode, soglia cambiata) non devono arrivare al Rust
  // come avvio, avvio, stop, che lascerebbe il registratore spento.
  const idleSeconds = settings.screentimeIdleMinutes * 60;
  useEffect(() => {
    if (!enabled) return;
    queueRef.current = queueRef.current.then(async () => {
      try {
        await startRecorder(idleSeconds);
      } catch (error) {
        console.error("Tempo al PC: avvio non riuscito", error);
      }
    });
    return () => {
      queueRef.current = queueRef.current.then(async () => {
        try {
          await record(await stopRecorder());
          await reload();
        } catch {
          // niente: al prossimo avvio si riparte
        }
      });
    };
  }, [enabled, idleSeconds, record, reload]);

  // Salvataggio periodico, al ritorno sulla finestra e prima di uscire da "Esci".
  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => void flush(), FLUSH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    document.addEventListener("visibilitychange", onVisible);
    const unregister = registerBeforeQuit(flush);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      unregister();
    };
  }, [enabled, flush]);

  // Chiusura della pagina (ricarica, X con l'icona spenta): si prova a salvare, può non finire in tempo.
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [enabled, flush]);

  const setCategory = useCallback(
    (key: string, category: AppCategory | null) => {
      const next = new Map(parseAppCategories(settingsRef.current.companionAppCategories));
      if (category) next.set(key, category);
      else next.delete(key);
      updateSetting("companionAppCategories", serializeAppCategories(next));
    },
    [settingsRef, updateSetting]
  );

  const setFocusClass = useCallback(
    (category: AppCategory, cls: FocusClass) => {
      const next = { ...parseFocusClasses(settingsRef.current.screentimeFocusClasses), [category]: cls };
      updateSetting("screentimeFocusClasses", serializeFocusClasses(next));
    },
    [settingsRef, updateSetting]
  );

  const refreshLimits = useCallback(async () => {
    const limits = await repo.listLimits();
    limitsRef.current = limits;
    setLimitList(limits);
    setRevision((r) => r + 1);
  }, []);

  const saveLimit = useCallback(
    async (limit: Omit<ScreenLimit, "id">) => {
      await repo.saveLimit(limit, Date.now());
      await refreshLimits();
    },
    [refreshLimits]
  );

  const deleteLimit = useCallback(
    async (id: number) => {
      await repo.deleteLimit(id);
      await refreshLimits();
    },
    [refreshLimits]
  );

  const today = useMemo(() => summarize(todayRows, classify), [todayRows, classify]);
  const limits = useMemo<LimitStatus[]>(
    () => limitList.map((limit) => ({ limit, usedSeconds: limitUsage(todayRows, limit, manual) })),
    [limitList, todayRows, manual]
  );

  const yesterdayTotal = useMemo(() => yesterdayRows.reduce((sum, r) => sum + r.seconds, 0), [yesterdayRows]);
  const yesterdaySoFar = useMemo(() => Math.round(untilSameTime(yesterdayRows, now)), [yesterdayRows, now]);

  const value = useMemo<ScreenTimeContextValue>(
    () => ({
      available: SCREENTIME_AVAILABLE,
      enabled,
      loading,
      todayRows,
      today,
      yesterdayTotal,
      yesterdaySoFar,
      limits,
      continuousMinutes: continuousMinutes(session, now),
      classify,
      revision,
      flush,
      setCategory,
      setFocusClass,
      saveLimit,
      deleteLimit,
    }),
    [enabled, loading, todayRows, today, yesterdayTotal, yesterdaySoFar, limits, session, now, classify, revision, flush, setCategory, setFocusClass, saveLimit, deleteLimit]
  );
  return <ScreenTimeContext.Provider value={value}>{children}</ScreenTimeContext.Provider>;
}
