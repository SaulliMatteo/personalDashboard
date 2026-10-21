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
import { colorForSubject, pickUnusedColor } from "../lib/colors";
import { playChime, notify } from "./alerts";
import { TimerContext, type AddSubjectResult } from "./useTimer";

const IDLE_STATE: TimerState = {
  subjectId: null,
  phase: "idle",
  remainingSeconds: 0,
  phaseTotalSeconds: 0,
  runningSince: null,
  cycleCount: 0,
};

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
  return s.phase === "work" && s.phaseTotalSeconds === 0;
}

function elapsedSince(runningSince: number): number {
  return Math.max(0, Math.floor((Date.now() - runningSince) / 1000));
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
    publishActivity({
      studying: state.phase === "work" && running,
      onBreak: isBreak && running,
      studyPaused: state.phase !== "idle" && !running,
    });
  }, [state.phase, state.runningSince]);

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

  function alertPhaseChange(title: string, body: string) {
    const s = settingsRef.current;
    if (s.studySoundEnabled) playChime(s.studyVolume);
    if (s.studyNotificationsEnabled) void notify(title, body);
  }

  const completingRef = useRef(false);
  async function completePhaseNaturally() {
    if (completingRef.current) return;
    completingRef.current = true;
    try {
      const s = stateRef.current;
      const now = Date.now();
      const cfg = settingsRef.current;
      const subjectName = subjectsRef.current.find((x) => x.id === s.subjectId)?.name ?? null;
      const t = timingsOf(s.subjectId);

      if (s.phase === "work" && s.subjectId !== null) {
        if (s.phaseTotalSeconds >= cfg.studyMinLoggableSeconds) {
          await logSession(s.subjectId, now, s.phaseTotalSeconds);
          await refreshToday();
        }
        const cycleCount = s.cycleCount + 1;
        const isLong = cycleCount % t.cyclesBeforeLongBreak === 0;
        const breakSeconds = isLong ? t.longBreakSeconds : t.shortBreakSeconds;
        const newState: TimerState = {
          subjectId: s.subjectId,
          phase: isLong ? "long_break" : "short_break",
          remainingSeconds: breakSeconds,
          phaseTotalSeconds: breakSeconds,
          runningSince: cfg.studyAutoStartNext ? now : null,
          cycleCount,
        };
        setState(newState);
        await saveTimerState(newState);
        const breakLabel = isLong ? "una pausa lunga" : "una pausa breve";
        emitActivityEvent({ type: "pomodoroDone" });
        alertPhaseChange(
          "Pomodoro completato",
          subjectName ? `Hai studiato ${subjectName}. Inizia ${breakLabel}.` : `Inizia ${breakLabel}.`
        );
      } else if (s.phase === "short_break" || s.phase === "long_break") {
        // Pausa finita da sola: si riprende a studiare la stessa materia.
        const newState: TimerState = {
          subjectId: s.subjectId,
          phase: "work",
          remainingSeconds: t.workSeconds,
          phaseTotalSeconds: t.workSeconds,
          runningSince: cfg.studyAutoStartNext ? now : null,
          cycleCount: s.cycleCount,
        };
        setState(newState);
        await saveTimerState(newState);
        emitActivityEvent({ type: "breakOver" });
        alertPhaseChange("Pausa finita", subjectName ? `Si riprende a studiare ${subjectName}.` : "Si riprende a studiare.");
      } else {
        // Fase "work" senza materia (es. materia cancellata): niente da
        // registrare. Senza questo ramo lo stato resterebbe "in corso" a 0
        // secondi e l'avviso scatterebbe ogni secondo.
        setState(IDLE_STATE);
        await saveTimerState(IDLE_STATE);
      }
    } finally {
      completingRef.current = false;
    }
  }

  // L'interval chiama SEMPRE l'ultima versione della funzione (via ref):
  // le impostazioni cambiate a timer in corso valgono dalla fase successiva.
  const completeRef = useLatestRef(completePhaseNaturally);

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

  async function stopOrSkip() {
    const s = stateRef.current;
    if (s.phase === "idle") return;
    const now = Date.now();
    const display = computeDisplaySeconds(s);

    if (s.phase === "work") {
      const studied = isStopwatchState(s) ? display : s.phaseTotalSeconds - display;
      if (s.subjectId !== null && studied >= settingsRef.current.studyMinLoggableSeconds) {
        await logSession(s.subjectId, now, studied);
        await refreshToday();
      }
      setState(IDLE_STATE);
      await saveTimerState(IDLE_STATE);
      emitActivityEvent({ type: "studyStopped", seconds: studied });
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
