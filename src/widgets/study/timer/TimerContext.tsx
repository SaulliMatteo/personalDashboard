import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  listSubjects,
  listArchivedSubjects,
  listAllSubjects,
  addSubject as addSubjectDb,
  updateSubject as updateSubjectDb,
  renameSubject as renameSubjectDb,
  archiveSubject as archiveSubjectDb,
  restoreSubject as restoreSubjectDb,
  logSession,
  getSessionsBetween,
  loadTimerState,
  saveTimerState,
  todayRangeMs,
  type Subject,
  type SubjectMode,
  type SubjectSettingsPatch,
  type TimerState,
} from "../data/studyRepository";
import { useSettings } from "../../../core/settings/useSettings";
import { useLatestRef } from "../../../core/hooks/useLatestRef";
import { emitActivityEvent, publishActivity } from "../../../core/activity/activityBus";
import { readSystemSnapshot } from "../../../core/system/systemApi";
import { onAppReturn, reportsAppReturn } from "../../../core/system/androidAway";
import {
  canScheduleNotifications,
  scheduleAppNotifications,
  sendAppNotification,
  withdrawAppNotifications,
  type AppNotification,
  type NotificationOpen,
} from "../../../core/notify/notifier";
import { classifyApp, parseAppCategories, type AppCategory } from "../../../core/system/appCategory";
import type { AppSettings } from "../../../core/settings/schema";
import { colorForSubject, pickUnusedColor } from "../lib/colors";
import { formatHoursMinutes } from "../lib/format";
import { playChime } from "./alerts";
import { AutoStopTracker, type AutoStopResult } from "./autoStop";
import { IDLE_TIMER, advanceTo, isStopwatch, upcomingEnds, type PhaseEnd } from "./phases";
import { TimerContext, type AddSubjectResult } from "./useTimer";

const IDLE_STATE: TimerState = IDLE_TIMER;

/** Il tocco su una notifica dello Studio apre la sua pagina. */
const OPEN_STUDY: NotificationOpen = { type: "widget", widgetId: "study" };

/** Quante fine fase pianificare in anticipo (Android), con le fasi che partono da sole: circa 4 pomodori. */
const SCHEDULE_AHEAD = 8;

/** Al rientro, quanto si aspetta l'evento dello stop automatico di Android prima di recuperare le fasi comunque. */
const RETURN_WAIT_MS = 800;

/** Il suono di fine fase solo se è finita da poco: al rientro dopo mezz'ora non serve più. */
const CHIME_FRESH_MS = 60_000;

/*
 * Come sono rappresentati i due modi nello stato salvato (timer_state):
 *  - pomodoro:  phaseTotalSeconds = durata della fase; remainingSeconds =
 *               secondi rimasti AL MOMENTO dell'ultimo avvio/ripresa;
 *               a timer in corsa: rimasti = remainingSeconds - trascorsi da runningSince.
 *  - cronometro: fase "work" con phaseTotalSeconds = 0; remainingSeconds =
 *               secondi già accumulati; trascorsi = remainingSeconds + (adesso - runningSince).
 * Nessuna colonna in più: il DB resta com'era.
 */
function isStopwatchState(s: TimerState): boolean {
  return isStopwatch(s);
}

function elapsedSince(runningSince: number): number {
  return Math.max(0, Math.floor((Date.now() - runningSince) / 1000));
}

/** Ogni quanto si legge il sistema per lo stop automatico. */
const AUTO_STOP_POLL_MS = 5000;

/** Categorie di app che, scelte nelle impostazioni, fermano il timer anche senza inattività. */
function autoStopCategories(cfg: AppSettings): Set<AppCategory> {
  const categories = new Set<AppCategory>();
  if (cfg.studyAutoStopGame) categories.add("game");
  if (cfg.studyAutoStopVideo) categories.add("video");
  if (cfg.studyAutoStopChat) categories.add("chat");
  return categories;
}

const AUTO_STOP_REASON: Partial<Record<AppCategory, string>> = {
  game: "Stai giocando",
  video: "Stai guardando video",
  chat: "Sei in chat",
};

/** Il perché dello stop automatico, per avviso e notifica. */
function autoStopWhat(reason: AutoStopResult["reason"], category: AppCategory | null): string {
  if (reason === "away") return "Sei in altre app";
  return (reason === "app" && category !== null && AUTO_STOP_REASON[category]) || "Sei inattivo";
}

function computeDisplaySeconds(s: TimerState): number {
  if (isStopwatchState(s)) {
    return s.runningSince === null ? s.remainingSeconds : s.remainingSeconds + elapsedSince(s.runningSince);
  }
  if (s.runningSince === null) return s.remainingSeconds;
  return Math.max(0, s.remainingSeconds - elapsedSince(s.runningSince));
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<TimerState>(IDLE_STATE);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [todayBySubject, setTodayBySubject] = useState<Record<number, number>>({});
  const [, forceTick] = useState(0);

  // Ref sempre allineati all'ultimo valore: servono dentro il setInterval e
  // nelle callback async, senza richiudere gli effect a ogni cambio.
  const stateRef = useLatestRef(state);
  const subjectsRef = useLatestRef(subjects);
  const settingsRef = useLatestRef(settings);

  function timingsOf(subjectId: number | null) {
    const sub = subjectsRef.current.find((x) => x.id === subjectId);
    return {
      workSeconds: Math.max(1, sub?.workMinutes ?? 25) * 60,
      shortBreakSeconds: Math.max(1, sub?.shortBreakMinutes ?? 5) * 60,
      longBreakSeconds: Math.max(1, sub?.longBreakMinutes ?? 15) * 60,
      cyclesBeforeLongBreak: Math.max(1, sub?.cyclesBeforeLongBreak ?? 4),
    };
  }

  async function refreshToday() {
    const { start, end } = todayRangeMs();
    const sessions = await getSessionsBetween(start, end);
    const totals: Record<number, number> = {};
    let total = 0;
    for (const session of sessions) {
      totals[session.subjectId] = (totals[session.subjectId] ?? 0) + session.durationSeconds;
      total += session.durationSeconds;
    }
    setTodayBySubject(totals);
    // Per intestazione e barra laterale della dashboard, che non conoscono lo Studio.
    publishActivity({
      studyTodaySeconds: total,
      studyTodaySpans: sessions
        .map((session) => ({ start: session.startedAt, end: session.endedAt }))
        .sort((a, b) => a.start - b.start),
    });
  }

  // Caricamento iniziale. Il DB è già pronto: DatabaseGate (app/) non
  // monta nessun provider finché le migrazioni non sono terminate.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [loadedState, loadedSubjects] = await Promise.all([loadTimerState(), listSubjects()]);
        if (cancelled) return;
        setState(loadedState);
        setSubjects(loadedSubjects);
        await refreshToday();
        if (!cancelled) setReady(true);
      } catch (error) {
        console.error("Errore nel caricamento del timer:", error);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pubblica lo stato del timer per chi ascolta (es. il Companion), senza conoscerlo.
  useEffect(() => {
    const running = state.runningSince !== null;
    const isBreak = state.phase === "short_break" || state.phase === "long_break";
    const subject = state.phase === "idle" ? null : (subjects.find((x) => x.id === state.subjectId)?.name ?? null);
    publishActivity({
      studying: state.phase === "work" && running,
      onBreak: isBreak && running,
      studyPaused: state.phase !== "idle" && !running,
      studySubjectName: subject,
    });
  }, [state.phase, state.runningSince, state.subjectId, subjects]);

  // Il timer per chi deve ricostruirlo altrove (i Gruppi): un oggetto nuovo solo quando cambia lo stato.
  useEffect(() => {
    if (state.phase === "idle") {
      publishActivity({ studyTimer: null });
      return;
    }
    const stopwatch = state.phase === "work" && state.phaseTotalSeconds === 0;
    publishActivity({
      studyTimer: {
        phase: state.phase === "work" ? "work" : "break",
        mode: stopwatch ? "stopwatch" : "pomodoro",
        runningSince: state.runningSince,
        phaseTotalSeconds: state.phaseTotalSeconds,
        // cronometro: remainingSeconds sono i secondi già fatti; pomodoro: quelli che mancano
        accumulatedSeconds: stopwatch ? state.remainingSeconds : Math.max(0, state.phaseTotalSeconds - state.remainingSeconds),
        changedAt: Date.now(),
      },
    });
  }, [state.phase, state.runningSince, state.phaseTotalSeconds, state.remainingSeconds]);

  // Obiettivo giornaliero superato: evento UNA volta, nel momento in cui si passa la soglia
  // (non al caricamento se era già superato).
  const prevTodayTotalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!ready) return;
    const total = Object.values(todayBySubject).reduce((sum, v) => sum + v, 0);
    const goal = settings.studyDailyGoalMinutes * 60;
    const prev = prevTodayTotalRef.current;
    prevTodayTotalRef.current = total;
    if (prev !== null && goal > 0 && prev < goal && total >= goal) emitActivityEvent({ type: "goalReached" });
  }, [ready, todayBySubject, settings.studyDailyGoalMinutes]);

  // Refresh periodico di "studiato oggi": copre anche l'app aperta a cavallo della mezzanotte.
  useEffect(() => {
    const interval = setInterval(refreshToday, 60_000);
    return () => clearInterval(interval);
  }, []);

  function alertPhaseChange(notification: AppNotification) {
    const s = settingsRef.current;
    if (s.studySoundEnabled) playChime(s.studyVolume);
    if (s.studyNotificationsEnabled) void sendAppNotification({ open: OPEN_STUDY, ...notification });
  }

  /** Testo della notifica di fine fase (subito o pianificata). */
  function phaseEndNotification(end: PhaseEnd): AppNotification {
    const subjectName = subjectsRef.current.find((x) => x.id === end.from.subjectId)?.name ?? null;
    if (end.kind === "pomodoroDone") {
      const breakLabel = end.to.phase === "long_break" ? "una pausa lunga" : "una pausa breve";
      return {
        kind: "pomodoroDone",
        title: "Pomodoro completato",
        body: subjectName ? `Hai studiato ${subjectName}. Inizia ${breakLabel}.` : `Inizia ${breakLabel}.`,
        open: OPEN_STUDY,
      };
    }
    return {
      kind: "breakOver",
      title: "Pausa finita",
      body: subjectName ? `Si riprende a studiare ${subjectName}.` : "Si riprende a studiare.",
      open: OPEN_STUDY,
    };
  }

  /**
   * Chiude le fasi finite fino ad adesso (phases.ts): dal tick, al rientro nell'app e all'avvio. Con l'app congelata
   * (schermo spento, sospensione) possono essere più d'una: ogni pomodoro si registra all'ora in cui è finito e la fase
   * nuova parte dalla fine di quella prima, non da adesso. Si avvisa solo per l'ultima; su Android la notifica di
   * sistema è già pianificata (vedi l'effect più sotto), qui resta il suono se è appena finita.
   */
  const completingRef = useRef(false);
  /** Uscita dall'app in corso: al rientro prima lo stop automatico (`pd-away`), poi il recupero delle fasi. */
  const awaitingReturnRef = useRef(false);
  async function catchUp() {
    if (completingRef.current || awaitingReturnRef.current) return;
    completingRef.current = true;
    try {
      const s = stateRef.current;
      const now = Date.now();
      const cfg = settingsRef.current;
      const { state: next, ends } = advanceTo(s, timingsOf(s.subjectId), cfg.studyAutoStartNext, now);
      if (next === s) return;
      let logged = false;
      for (const end of ends) {
        if (end.kind === "pomodoroDone" && end.from.subjectId !== null && end.from.phaseTotalSeconds >= cfg.studyMinLoggableSeconds) {
          await logSession(end.from.subjectId, end.at, end.from.phaseTotalSeconds);
          logged = true;
        }
      }
      // Fase "work" senza materia (es. materia cancellata): si torna a riposo senza registrare né avvisare.
      setState(next);
      await saveTimerState(next);
      if (logged) await refreshToday();
      const last = ends.at(-1);
      if (!last) return;
      emitActivityEvent({ type: last.kind });
      if (cfg.studySoundEnabled && now - last.at < CHIME_FRESH_MS) playChime(cfg.studyVolume);
      if (cfg.studyNotificationsEnabled && !canScheduleNotifications()) void sendAppNotification(phaseEndNotification(last));
    } finally {
      completingRef.current = false;
    }
  }

  // L'interval chiama SEMPRE l'ultima versione della funzione (via ref):
  // le impostazioni cambiate a timer in corso valgono dalla fase successiva.
  const completeRef = useLatestRef(catchUp);

  // Tick di visualizzazione (ogni secondo, solo mentre il timer corre) +
  // rilevamento del momento in cui una fase finisce da sola. Il cronometro
  // non finisce mai da solo.
  useEffect(() => {
    if (state.runningSince === null) return;
    const interval = setInterval(() => {
      const current = stateRef.current;
      if (!isStopwatchState(current) && computeDisplaySeconds(current) <= 0) {
        void completeRef.current();
      } else {
        forceTick((t) => t + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [state.runningSince, state.phase]);

  // Al rientro (app tornata in primo piano, schermo riacceso, portatile risvegliato) e all'avvio: subito, senza
  // aspettare il prossimo tick, così il numero mostrato e le sessioni sono giusti dal primo fotogramma.
  // Su Android al rientro arriva anche `pd-away` (stop automatico) e deve passare per primo: se mentre eri in altre app
  // è finito un pomodoro, lo stop lo chiude all'uscita invece di registrarlo intero. Il recupero aspetta quell'evento
  // (al massimo RETURN_WAIT_MS). Sul desktop non si aspetta nulla: lì il tick gira anche a finestra ridotta.
  useEffect(() => {
    if (!ready) return;
    void completeRef.current();
    let timeout = 0;
    const resumeCatchUp = () => {
      window.clearTimeout(timeout);
      awaitingReturnRef.current = false;
      void completeRef.current();
      forceTick((t) => t + 1);
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timeout);
        awaitingReturnRef.current = reportsAppReturn() && settingsRef.current.studyAutoStopEnabled;
      } else if (awaitingReturnRef.current) {
        timeout = window.setTimeout(resumeCatchUp, RETURN_WAIT_MS);
      } else resumeCatchUp();
    };
    const onFocus = () => {
      if (!awaitingReturnRef.current) resumeCatchUp();
    };
    const offReturn = onAppReturn(() => {
      // dopo il controllo dello stop automatico (effect più sotto, registrato prima di questo evento)
      window.setTimeout(resumeCatchUp, 0);
    });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(timeout);
      offReturn();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [ready, completeRef, settingsRef]);

  // Android: le prossime fine fase si pianificano come notifiche di sistema, così arrivano all'ora giusta anche con
  // l'app congelata o chiusa. Si ripianifica a ogni cambio (avvio, pausa, ripresa, stop, salto, fase nuova):
  // fermo o in pausa = nessuna pianificata. Sul desktop non fa nulla (lì avvisa catchUp).
  const rescheduleRef = useLatestRef(() => {
    const s = stateRef.current;
    const cfg = settingsRef.current;
    const ends = cfg.studyNotificationsEnabled ? upcomingEnds(s, timingsOf(s.subjectId), cfg.studyAutoStartNext, SCHEDULE_AHEAD) : [];
    void scheduleAppNotifications(
      "study",
      ends.map((end) => ({ at: end.at, notification: phaseEndNotification(end) }))
    );
  });
  const { studyNotificationsEnabled, studyAutoStartNext } = settings;
  useEffect(() => {
    if (canScheduleNotifications() && ready) rescheduleRef.current();
    // si ripianifica quando cambia ciò che decide le fine fase e i loro testi (le materie: durate e nomi)
  }, [ready, state, subjects, studyNotificationsEnabled, studyAutoStartNext, rescheduleRef]);

  async function startWork(subjectId: number) {
    // Un solo timer alla volta: per cambiare materia a timer attivo c'è switchSubject.
    if (stateRef.current.phase !== "idle") return;
    await beginWork(subjectId);
  }

  // Chiude la sessione in corso (registrandola se è studio) e avvia subito
  // l'altra materia: un solo gesto, senza passare dalla pagina di dettaglio.
  async function switchSubject(subjectId: number) {
    const s = stateRef.current;
    if (s.phase === "idle") return beginWork(subjectId);
    if (s.phase === "work" && s.subjectId === subjectId) return;
    if (s.phase === "work") await stopOrSkip(); // logga il tempo studiato
    await beginWork(subjectId);
  }

  async function beginWork(subjectId: number) {
    const sub = subjectsRef.current.find((x) => x.id === subjectId);
    // Cronometro: parte da zero, durata nominale 0 (vedi isStopwatchState).
    const seconds = sub?.mode === "stopwatch" ? 0 : timingsOf(subjectId).workSeconds;
    const newState: TimerState = {
      subjectId,
      phase: "work",
      remainingSeconds: seconds,
      phaseTotalSeconds: seconds,
      runningSince: Date.now(),
      cycleCount: stateRef.current.cycleCount,
    };
    setState(newState);
    await saveTimerState(newState);
    emitActivityEvent({ type: "studyStarted" });
  }

  function pause() {
    const s = stateRef.current;
    if (s.phase === "idle" || s.runningSince === null) return;
    const newState: TimerState = { ...s, remainingSeconds: computeDisplaySeconds(s), runningSince: null };
    setState(newState);
    void saveTimerState(newState);
  }

  function resume() {
    const s = stateRef.current;
    if (s.phase === "idle" || s.runningSince !== null) return;
    const newState: TimerState = { ...s, runningSince: Date.now() };
    setState(newState);
    void saveTimerState(newState);
  }

  // Chiude la fase "work" registrando lo studio fatto fino a `endAt` (stop automatico: l'inizio dell'assenza; mai prima
  // dell'ultima ripresa, il tempo accumulato prima di una pausa è studio vero; un pomodoro conta al massimo la sua
  // durata). Ritorna i secondi registrati (0 = nessuna sessione).
  async function finishWork(endAt = Date.now()): Promise<number> {
    const s = stateRef.current;
    const until = s.runningSince === null ? endAt : Math.max(s.runningSince, endAt);
    const ran = s.runningSince === null ? 0 : Math.max(0, Math.floor((until - s.runningSince) / 1000));
    const studied = isStopwatchState(s) ? s.remainingSeconds + ran : s.phaseTotalSeconds - Math.max(0, s.remainingSeconds - ran);
    let logged = 0;
    if (s.subjectId !== null && studied >= settingsRef.current.studyMinLoggableSeconds) {
      await logSession(s.subjectId, until, studied);
      await refreshToday();
      logged = studied;
    }
    setState(IDLE_STATE);
    await saveTimerState(IDLE_STATE);
    emitActivityEvent({ type: "studyStopped", seconds: studied });
    return logged;
  }

  async function stopOrSkip() {
    const s = stateRef.current;
    if (s.phase === "idle") return;
    const now = Date.now();

    if (s.phase === "work") {
      await finishWork();
    } else {
      // Salta pausa: nessun log (le pause non sono tempo di studio),
      // si riparte subito con un nuovo "work" sulla stessa materia.
      const workSeconds = timingsOf(s.subjectId).workSeconds;
      const newState: TimerState = {
        subjectId: s.subjectId,
        phase: "work",
        remainingSeconds: workSeconds,
        phaseTotalSeconds: workSeconds,
        runningSince: now,
        cycleCount: s.cycleCount,
      };
      setState(newState);
      await saveTimerState(newState);
    }
  }

  // Stop automatico: in studio si registra fino a `stoppedAt` (mai oltre l'ultima ripresa,
  // il tempo accumulato prima di una pausa è studio vero); in pausa pomodoro si torna a zero.
  // Preavviso: manca il 10% della soglia. Solo un avviso, il timer continua.
  function warnAutoStop({ reason, category, awaySeconds, secondsLeft }: Extract<AutoStopResult, { type: "warn" }>) {
    const what = autoStopWhat(reason, category);
    const left = secondsLeft < 60 ? `${secondsLeft} secondi` : formatHoursMinutes(secondsLeft);
    alertPhaseChange({
      kind: "autoStopWarning",
      title: "Attento al tempo",
      body: `${what} da ${formatHoursMinutes(awaySeconds)}: tra ${left} fermo il timer.`,
      reason,
      category,
    });
  }

  async function autoStop({ reason, category, stoppedAt }: Extract<AutoStopResult, { type: "stop" }>) {
    const s = stateRef.current;
    if (s.phase === "idle" || s.runningSince === null || completingRef.current) return;
    completingRef.current = true;
    try {
      const now = Date.now();
      const awaySeconds = Math.max(0, Math.floor((now - stoppedAt) / 1000));
      const what = autoStopWhat(reason, category);
      const why = `${what} da ${formatHoursMinutes(awaySeconds)}`;
      // le fine fase comparse mentre eri via non sono più vere: il timer si è fermato all'uscita
      void withdrawAppNotifications("study", stoppedAt);
      if (s.phase === "work") {
        const subjectName = subjectsRef.current.find((x) => x.id === s.subjectId)?.name ?? null;
        const logged = await finishWork(stoppedAt);
        const outcome =
          logged > 0
            ? `registrati ${formatHoursMinutes(logged)}${subjectName ? ` di ${subjectName}` : ""}`
            : "nessuna sessione registrata";
        alertPhaseChange({ kind: "autoStopped", title: "Timer fermato", body: `${why}: ${outcome}.`, reason, category });
      } else {
        setState(IDLE_STATE);
        await saveTimerState(IDLE_STATE);
        alertPhaseChange({ kind: "autoStopped", title: "Timer fermato", body: `${why}: pausa interrotta.`, reason, category });
      }
    } finally {
      completingRef.current = false;
    }
  }

  const autoStopRef = useLatestRef(autoStop);
  const warnAutoStopRef = useLatestRef(warnAutoStop);

  // Controllo dello stop automatico, solo mentre il timer corre. Un tracker nuovo a ogni
  // avvio, ripresa o cambio di fase. Le app si guardano solo in studio: in pausa si gioca.
  // Fuori da Tauri o su sistemi non supportati lo snapshot è null e non succede nulla.
  useEffect(() => {
    if (!settings.studyAutoStopEnabled || state.runningSince === null || state.phase === "idle") return;
    const tracker = new AutoStopTracker();
    const working = state.phase === "work";
    let busy = false;
    const interval = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const cfg = settingsRef.current;
        const categories = working ? autoStopCategories(cfg) : new Set<AppCategory>();
        const snapshot = await readSystemSnapshot(categories.size > 0);
        if (snapshot === null) return;
        const fg = snapshot.foreground;
        const category =
          categories.size > 0 && fg !== null && !fg.isSelf
            ? classifyApp(fg.process, fg.description, fg.title, parseAppCategories(cfg.companionAppCategories)).category
            : null;
        const hit = tracker.check(Date.now(), { idleSeconds: snapshot.idleSeconds, category }, { minutes: cfg.studyAutoStopMinutes, categories });
        if (hit?.type === "stop") await autoStopRef.current(hit);
        else if (hit?.type === "warn") warnAutoStopRef.current(hit);
      } finally {
        busy = false;
      }
    }, AUTO_STOP_POLL_MS);
    return () => clearInterval(interval);
  }, [settings.studyAutoStopEnabled, state.runningSince, state.phase]);

  // Android (niente segnali di sistema): al rientro nell'app, se mentre si studiava il telefono è stato usato in altre
  // app per più della soglia, il timer si ferma all'uscita. Lo schermo spento conta come studio.
  useEffect(() => {
    if (!settings.studyAutoStopEnabled) return;
    return onAppReturn(({ leftAt, usedMs }) => {
      const s = stateRef.current;
      if (s.phase !== "work" || s.runningSince === null || s.runningSince > leftAt) return;
      if (usedMs < settingsRef.current.studyAutoStopMinutes * 60_000) return;
      void autoStopRef.current({ type: "stop", reason: "away", category: null, stoppedAt: leftAt });
    });
  }, [settings.studyAutoStopEnabled, stateRef, settingsRef, autoStopRef]);

  async function addSubjectHandler(name: string, mode?: SubjectMode): Promise<AddSubjectResult> {
    const trimmed = name.trim();
    if (!trimmed) return "empty";
    if (subjectsRef.current.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) return "duplicate";
    const cfg = settingsRef.current;
    try {
      // Il nome è univoco anche tra le archiviate: meglio dirlo che fallire sul vincolo UNIQUE.
      const archived = await listArchivedSubjects();
      if (archived.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) return "archived";
      // Una nuova materia nasce con i valori predefiniti delle impostazioni
      // e con un colore non ancora usato; poi si personalizza una per una.
      await addSubjectDb({
        name: trimmed,
        color: pickUnusedColor(subjectsRef.current),
        mode: mode ?? cfg.studyDefaultMode,
        workMinutes: cfg.pomodoroWorkMinutes,
        shortBreakMinutes: cfg.pomodoroShortBreakMinutes,
        longBreakMinutes: cfg.pomodoroLongBreakMinutes,
        cyclesBeforeLongBreak: cfg.pomodoroCyclesBeforeLongBreak,
      });
      setSubjects(await listSubjects());
      return "ok";
    } catch (error) {
      console.error("Errore nell'aggiunta della materia:", error);
      return "error";
    }
  }

  async function updateSubjectHandler(id: number, patch: SubjectSettingsPatch) {
    await updateSubjectDb(id, patch);
    setSubjects(await listSubjects());
  }

  async function renameSubjectHandler(id: number, name: string): Promise<AddSubjectResult> {
    const trimmed = name.trim();
    if (!trimmed) return "empty";
    try {
      // Il nome è univoco tra TUTTE le materie (anche archiviate); la materia stessa è esclusa, così si può cambiare solo una maiuscola.
      const clash = (await listAllSubjects()).find((s) => s.id !== id && s.name.toLowerCase() === trimmed.toLowerCase());
      if (clash) return clash.archivedAt === null ? "duplicate" : "archived";
      await renameSubjectDb(id, trimmed);
      setSubjects(await listSubjects());
      return "ok";
    } catch (error) {
      console.error("Errore nella rinomina della materia:", error);
      return "error";
    }
  }

  async function archiveSubjectHandler(id: number) {
    const index = subjectsRef.current.findIndex((s) => s.id === id);
    if (index < 0) return;
    // Il colore mostrato ora viene fissato, così nel report resta lo stesso.
    await archiveSubjectDb(id, colorForSubject(subjectsRef.current[index], index));
    setSubjects(await listSubjects());
    await refreshToday();
  }

  async function restoreSubjectHandler(id: number) {
    await restoreSubjectDb(id);
    setSubjects(await listSubjects());
  }

  return (
    <TimerContext.Provider
      value={{
        ready,
        phase: state.phase,
        subjectId: state.subjectId,
        displaySeconds: computeDisplaySeconds(state),
        phaseTotalSeconds: state.phaseTotalSeconds,
        isRunning: state.runningSince !== null,
        isStopwatch: isStopwatchState(state),
        cycleCount: state.cycleCount,
        subjects,
        todayBySubject,
        startWork,
        switchSubject,
        pause,
        resume,
        stopOrSkip,
        addSubject: addSubjectHandler,
        updateSubject: updateSubjectHandler,
        renameSubject: renameSubjectHandler,
        archiveSubject: archiveSubjectHandler,
        restoreSubject: restoreSubjectHandler,
      }}
    >
      {children}
    </TimerContext.Provider>
  );
}
