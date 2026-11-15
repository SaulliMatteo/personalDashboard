import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSettings } from "../../core/settings/useSettings";
import { useLatestRef } from "../../core/hooks/useLatestRef";
import { getMeta, setMeta } from "../../core/db/meta";
import { sendAppNotification } from "../../core/notify/notifier";
import { registerBeforeQuit } from "../../core/system/beforeQuit";
import { setTrayToday } from "../../core/system/appWindowApi";
import { onSyncApplied } from "../../core/sync/syncEvents";
import { parseAppCategories, serializeAppCategories, type AppCategory } from "../../core/system/appCategory";
import {
  SCREENTIME_AVAILABLE,
  SCREENTIME_PHONE,
  SCREENTIME_VIEWABLE,
  THIS_DEVICE,
  openUsageAccessSettings,
  startRecorder,
  stopRecorder,
  takeSegments,
  usageAccessGranted,
} from "./data/screentimeApi";
import * as repo from "./data/screentimeRepository";
import { commitPhoneRead, phoneGaps as readPhoneGaps, readPhoneUsage, type PhoneGap } from "./data/phoneUsage";
import { classifySegment, type ClassifiedSegment } from "./lib/classify";
import { countedIntervals, dayKey, segmentsToDeltas, shiftDay } from "./lib/aggregate";
import { BREAK_MS, breakReminderStep, continuousMinutes, extendSessions, type Session } from "./lib/sessions";
import { parseFocusClasses, serializeFocusClasses, type FocusClass } from "./lib/focus";
import { dueNotices, emptyNoticeState, parseNoticeState, type ScreenLimit } from "./lib/limits";
import { limitUsage, summarize, type ClassifyContext, type UsageRow } from "./lib/summary";
import { byDevice, parseDeviceFilter, zeroDevices, type DeviceFilter } from "./lib/devices";
import { formatDuration } from "./lib/format";
import { SCREENTIME_WIDGET_ID, ScreenTimeContext, type LimitStatus, type ScreenTimeContextValue } from "./useScreenTime";

/** Ogni quanto si ritira dal registratore e si salva (con la finestra nascosta la WebView può allungarlo a ~1 min). */
const FLUSH_MS = 30_000;
const NOTICES_META = "screentime_limit_notices";
const PRUNE_META = "screentime_pruned_day";
/** Si tengono ~13 mesi di dati: abbastanza per confrontare con l'anno prima, pochi KB al mese. */
const KEEP_DAYS = 400;
/** Dove non si conta (telefono, Linux): ogni quanto si rilegge oggi, per il cambio di giorno. */
const VIEW_REFRESH_MS = 60_000;

/** Secondi di `rows` fino all'ora del giorno di `now` (l'ora in corso in proporzione ai minuti passati). */
function untilSameTime(rows: UsageRow[], now: number): number {
  const d = new Date(now);
  const hour = d.getHours();
  const part = (d.getMinutes() * 60 + d.getSeconds()) / 3600;
  return rows.reduce((sum, r) => sum + (r.hour < hour ? r.seconds : r.hour === hour ? r.seconds * part : 0), 0);
}

/**
 * Tempo allo schermo: sempre montato (anche col widget fuori dalla dashboard), conta con `screentimeEnabled`.
 * - Computer (Windows e macOS): ogni 30 s ritira i segmenti dal registratore in Rust, li classifica (app e categoria),
 *   butta il titolo e somma i secondi nel DB; poi controlla limiti e pausa e aggiorna il menu dell'icona.
 * - Telefono: con il permesso "Accesso ai dati di utilizzo", all'avvio, al ritorno sull'app e ogni 30 s ad app aperta
 *   legge la cronologia di Android dall'ultima volta (data/phoneUsage.ts). Niente limiti né promemoria: l'app non gira
 *   in sottofondo e non potrebbe avvisare in tempo.
 * Le righe degli altri dispositivi arrivano col sync (si rileggono dopo ogni giro) e si sommano secondo il filtro;
 * limiti, pause e menu dell'icona contano solo questo dispositivo.
 */
export function ScreenTimeProvider({ children }: { children: ReactNode }) {
  const { settings, updateSetting } = useSettings();
  const settingsRef = useLatestRef(settings);
  const canRecord = SCREENTIME_AVAILABLE || SCREENTIME_PHONE;
  /** Telefono: permesso di Android (null = non ancora controllato, o non è un telefono). */
  const [access, setAccess] = useState<boolean | null>(null);
  const enabled = settings.screentimeEnabled && (SCREENTIME_AVAILABLE || (SCREENTIME_PHONE && access === true));
  const enabledRef = useLatestRef(enabled);
  const needsAccess = SCREENTIME_PHONE && settings.screentimeEnabled && access === false;
  const showFilter = settings.syncEnabled;
  const filter: DeviceFilter = showFilter ? parseDeviceFilter(settings.screentimeDeviceFilter) : "all";

  const manual = useMemo(() => parseAppCategories(settings.companionAppCategories), [settings.companionAppCategories]);
  const classes = useMemo(() => parseFocusClasses(settings.screentimeFocusClasses), [settings.screentimeFocusClasses]);
  const classify = useMemo<ClassifyContext>(() => ({ manual, classes }), [manual, classes]);
  const classifyRef = useLatestRef(classify);

  const [loading, setLoading] = useState(SCREENTIME_VIEWABLE);
  const [todayRows, setTodayRows] = useState<UsageRow[]>([]);
  const [yesterdayRows, setYesterdayRows] = useState<UsageRow[]>([]);
  const [limitList, setLimitList] = useState<ScreenLimit[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [gaps, setGaps] = useState<PhoneGap[]>([]);

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
      const total = rows.reduce((sum, r) => sum + (r.local ? r.seconds : 0), 0);
      void setTrayToday(`Tempo al PC oggi: ${formatDuration(total)}`).catch(() => {});
    },
    [settingsRef, classifyRef]
  );

  /** Segmenti → DB (righe per ora e sessioni). */
  const record = useCallback(async (segments: ClassifiedSegment[]) => {
    if (segments.length === 0) return;
    await repo.addUsage(THIS_DEVICE, segmentsToDeltas(segments));
    const { current, closed } = extendSessions(sessionRef.current, countedIntervals(segments));
    sessionRef.current = current;
    setSession(current);
    await repo.saveSessions(current ? [...closed, current] : closed);
  }, []);

  /** Un salvataggio alla volta: quelli chiesti nel frattempo si accodano. */
  const flush = useCallback(() => {
    const run = async () => {
      if (!enabledRef.current) return;
      try {
        if (SCREENTIME_PHONE) {
          const read = await readPhoneUsage(Date.now());
          await record(read.segments);
          await commitPhoneRead(read);
          if (read.gap) setGaps(await readPhoneGaps());
          await reload();
        } else {
          await record((await takeSegments()).map(classifySegment));
          const rows = await reload();
          await checkNotices(rows);
        }
      } catch (error) {
        console.error("Tempo allo schermo: salvataggio non riuscito", error);
      }
    };
    queueRef.current = queueRef.current.then(run, run);
    return queueRef.current;
  }, [enabledRef, record, reload, checkNotices]);

  // Avvio: pulizia dei dati vecchi (una volta al giorno), sessione da continuare, limiti, primi dati.
  useEffect(() => {
    if (!SCREENTIME_VIEWABLE) return;
    let cancelled = false;
    void (async () => {
      try {
        const today = dayKey(Date.now());
        if ((await getMeta(PRUNE_META)) !== today) {
          await repo.pruneBefore(shiftDay(today, -KEEP_DAYS), Date.now() - KEEP_DAYS * 86_400_000);
          await setMeta(PRUNE_META, today);
        }
        const last = await repo.lastSession();
        // Sul telefono i tratti arrivano dopo, in blocco: la sessione da continuare si decide con quelli.
        if (last && (SCREENTIME_PHONE || Date.now() - last.endAt < BREAK_MS) && !sessionRef.current) {
          sessionRef.current = last;
          setSession(last);
        }
        const limits = await repo.listLimits();
        const lost = SCREENTIME_PHONE ? await readPhoneGaps() : [];
        if (cancelled) return;
        setGaps(lost);
        limitsRef.current = limits;
        setLimitList(limits);
        await reload();
      } catch (error) {
        console.error("Tempo allo schermo: lettura non riuscita", error);
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
  const recorderOn = enabled && SCREENTIME_AVAILABLE;
  useEffect(() => {
    if (!recorderOn) return;
    queueRef.current = queueRef.current.then(async () => {
      try {
        await startRecorder(idleSeconds);
      } catch (error) {
        console.error("Tempo allo schermo: avvio non riuscito", error);
      }
    });
    return () => {
      queueRef.current = queueRef.current.then(async () => {
        try {
          await record((await stopRecorder()).map(classifySegment));
          await reload();
        } catch {
          // niente: al prossimo avvio si riparte
        }
      });
    };
  }, [recorderOn, idleSeconds, record, reload]);

  // Telefono: il permesso si controlla all'avvio e al ritorno sull'app (anche dalla pagina di Android). Appena c'è,
  // `enabled` diventa vero e il salvataggio periodico legge subito la cronologia.
  useEffect(() => {
    if (!SCREENTIME_PHONE) return;
    const check = () => void usageAccessGranted().then(setAccess, () => setAccess(false));
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Salvataggio periodico, al ritorno sulla finestra e prima di uscire da "Esci". Sul telefono anche subito.
  useEffect(() => {
    if (!enabled) return;
    if (SCREENTIME_PHONE) void flush();
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

  // Righe arrivate dagli altri dispositivi: si rilegge oggi (e la pagina, con `revision`).
  useEffect(() => {
    if (!SCREENTIME_VIEWABLE) return;
    return onSyncApplied((applied) => {
      if (applied.kinds.has("screen_usage")) void reload().catch(() => undefined);
    });
  }, [reload]);

  // Dove non si conta niente lo fa il salvataggio ogni 30 s: si rilegge ogni tanto e al ritorno sull'app (cambio di giorno).
  useEffect(() => {
    if (!SCREENTIME_VIEWABLE || enabled) return;
    const refresh = () => void reload().catch(() => undefined);
    const interval = window.setInterval(refresh, VIEW_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, reload]);

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

  /** Telefono: accende il conteggio e apre la pagina di Android del permesso (al ritorno si ricontrolla). */
  const grantAccess = useCallback(() => {
    updateSetting("screentimeEnabled", true);
    void openUsageAccessSettings().catch((error) => console.error("Tempo allo schermo: impostazioni non aperte", error));
  }, [updateSetting]);

  const setFilter = useCallback((next: DeviceFilter) => updateSetting("screentimeDeviceFilter", next), [updateSetting]);

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

  const today = useMemo(() => summarize(byDevice(todayRows, filter), classify), [todayRows, filter, classify]);
  const todayByDevice = useMemo(() => {
    const out = zeroDevices();
    for (const r of todayRows) out[r.device] += r.seconds;
    return out;
  }, [todayRows]);
  const othersUpdatedAt = useMemo(
    () => todayRows.reduce<number | null>((max, r) => (r.local ? max : Math.max(max ?? 0, r.lastAt)), null),
    [todayRows]
  );
  const limits = useMemo<LimitStatus[]>(
    () => limitList.map((limit) => ({ limit, usedSeconds: limitUsage(todayRows, limit, manual) })),
    [limitList, todayRows, manual]
  );

  const yesterdayShown = useMemo(() => byDevice(yesterdayRows, filter), [yesterdayRows, filter]);
  const yesterdayTotal = useMemo(() => yesterdayShown.reduce((sum, r) => sum + r.seconds, 0), [yesterdayShown]);
  const yesterdaySoFar = useMemo(() => Math.round(untilSameTime(yesterdayShown, now)), [yesterdayShown, now]);

  const value = useMemo<ScreenTimeContextValue>(
    () => ({
      viewable: SCREENTIME_VIEWABLE,
      canRecord,
      hasLimits: SCREENTIME_AVAILABLE,
      switchedOff: canRecord && !settings.screentimeEnabled,
      needsAccess,
      grantAccess,
      phoneGaps: gaps,
      enabled,
      device: THIS_DEVICE,
      loading,
      now,
      todayRows,
      today,
      todayByDevice,
      filter,
      showFilter,
      setFilter,
      othersUpdatedAt,
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
    [canRecord, settings.screentimeEnabled, needsAccess, grantAccess, gaps, enabled, loading, todayRows, today, todayByDevice, filter, showFilter, setFilter, othersUpdatedAt, yesterdayTotal, yesterdaySoFar, limits, session, now, classify, revision, flush, setCategory, setFocusClass, saveLimit, deleteLimit]
  );
  return <ScreenTimeContext.Provider value={value}>{children}</ScreenTimeContext.Provider>;
}
