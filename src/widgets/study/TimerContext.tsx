import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import {
  listSubjects,
  addSubject as addSubjectDb,
  deleteSubject as deleteSubjectDb,
  logSession,
  getSessionsBetween,
  loadTimerState,
  saveTimerState,
  todayRangeMs,
  type Subject,
  type TimerState,
  type TimerPhase,
} from "./studyRepository";
import { useSettings } from "../../core/settings/SettingsContext";

// Sotto questa soglia una sessione non viene registrata: evita di
// riempire lo storico di sessioni da 1-2 secondi per avvii accidentali.
const MIN_LOGGABLE_SECONDS = 10;

/**
 * Breve suono a due note generato via Web Audio, invece di un file
 * audio da distribuire: zero asset, zero dipendenze. Se in futuro si
 * preferisce un suono proprio, questa è l'unica funzione da sostituire.
 */
function playChime() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [880, 1108.73].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.15;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  } catch (error) {
    console.error("Impossibile riprodurre il suono di notifica:", error);
  }
}

export type AddSubjectResult = "ok" | "empty" | "duplicate" | "error";

interface TimerContextValue {
  /** True quando stato timer + materie sono stati caricati dal DB. */
  ready: boolean;
  phase: TimerPhase;
  subjectId: number | null;
  /** Secondi rimanenti, sempre aggiornati al secondo anche mentre il timer corre. */
  displaySeconds: number;
  phaseTotalSeconds: number;
  isRunning: boolean;
  subjects: Subject[];
  /** subjectId -> secondi studiati oggi. */
  todayBySubject: Record<number, number>;
  startWork: (subjectId: number) => Promise<void>;
  pause: () => void;
  resume: () => void;
  /** Ferma la fase di lavoro (registra la sessione parziale) oppure salta la pausa (nessun log). */
  stopOrSkip: () => Promise<void>;
  addSubject: (name: string) => Promise<AddSubjectResult>;
  removeSubject: (id: number) => Promise<void>;
}

const TimerContext = createContext<TimerContextValue | undefined>(undefined);

const IDLE_STATE: TimerState = {
  subjectId: null,
  phase: "idle",
  remainingSeconds: 0,
  phaseTotalSeconds: 0,
  runningSince: null,
  cycleCount: 0,
};

export function TimerProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();

  const workMinutes = settings.pomodoroWorkMinutes;
  const shortBreakMinutes = settings.pomodoroShortBreakMinutes;
  const longBreakMinutes = settings.pomodoroLongBreakMinutes;
  const cyclesBeforeLongBreak = Math.max(1, settings.pomodoroCyclesBeforeLongBreak);

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<TimerState>(IDLE_STATE);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [todayBySubject, setTodayBySubject] = useState<Record<number, number>>({});
  const [, forceTick] = useState(0);

  // Ref sempre allineato all'ultimo stato: serve per leggerlo dentro il
  // setInterval e nelle callback async senza richiudere l'effect ogni volta.
  const stateRef = useRef(state);
  stateRef.current = state;

  async function refreshToday() {
    const { start, end } = todayRangeMs();
    const sessions = await getSessionsBetween(start, end);
    const totals: Record<number, number> = {};
    for (const session of sessions) {
      totals[session.subjectId] = (totals[session.subjectId] ?? 0) + session.durationSeconds;
    }
    setTodayBySubject(totals);
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

  // Refresh periodico di "studiato oggi": copre anche l'app aperta a cavallo della mezzanotte.
  useEffect(() => {
    const interval = setInterval(refreshToday, 60_000);
    return () => clearInterval(interval);
  }, []);

  function computeDisplaySeconds(s: TimerState): number {
    if (s.runningSince === null) return s.remainingSeconds;
    const elapsed = Math.floor((Date.now() - s.runningSince) / 1000);
    return Math.max(0, s.phaseTotalSeconds - elapsed);
  }

  function nextBreak(cycleCount: number): { phase: TimerPhase; minutes: number } {
    const isLong = cycleCount > 0 && cycleCount % cyclesBeforeLongBreak === 0;
    return isLong
      ? { phase: "long_break", minutes: longBreakMinutes }
      : { phase: "short_break", minutes: shortBreakMinutes };
  }

  const completingRef = useRef(false);
  async function completePhaseNaturally() {
    if (completingRef.current) return;
    completingRef.current = true;
    try {
      const s = stateRef.current;
      const now = Date.now();

      if (s.phase === "work" && s.subjectId !== null) {
        if (s.phaseTotalSeconds >= MIN_LOGGABLE_SECONDS) {
          await logSession(s.subjectId, now, s.phaseTotalSeconds);
          await refreshToday();
        }
        const cycleCount = s.cycleCount + 1;
        const next = nextBreak(cycleCount);
        const newState: TimerState = {
          subjectId: s.subjectId,
          phase: next.phase,
          remainingSeconds: next.minutes * 60,
          phaseTotalSeconds: next.minutes * 60,
          runningSince: now,
          cycleCount,
        };
        setState(newState);
        await saveTimerState(newState);
      } else if (s.phase === "short_break" || s.phase === "long_break") {
        // Pausa finita da sola: si riprende a studiare la stessa materia.
        const newState: TimerState = {
          subjectId: s.subjectId,
          phase: "work",
          remainingSeconds: workMinutes * 60,
          phaseTotalSeconds: workMinutes * 60,
          runningSince: now,
          cycleCount: s.cycleCount,
        };
        setState(newState);
        await saveTimerState(newState);
      } else {
        // Fase "work" senza materia (es. materia cancellata): nessuna
        // sessione da registrare. Senza questo ramo lo stato restava
        // "in corso" a 0 secondi e il suono suonava ogni secondo.
        setState(IDLE_STATE);
        await saveTimerState(IDLE_STATE);
        return;
      }
      playChime();
    } finally {
      completingRef.current = false;
    }
  }

  // L'interval chiama SEMPRE l'ultima versione della funzione (via ref),
  // così le impostazioni cambiate a timer in corso valgono dalla fase
  // successiva invece di restare congelate al momento dell'avvio.
  const completeRef = useRef(completePhaseNaturally);
  completeRef.current = completePhaseNaturally;

  // Tick di visualizzazione (ogni secondo, solo mentre il timer corre) +
  // rilevamento del momento in cui una fase finisce da sola.
  useEffect(() => {
    if (state.runningSince === null) return;
    const interval = setInterval(() => {
      if (computeDisplaySeconds(stateRef.current) <= 0) {
        void completeRef.current();
      } else {
        forceTick((t) => t + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [state.runningSince, state.phase]);

  async function startWork(subjectId: number) {
    // Un solo timer alla volta (la UI disabilita già i pulsanti in quel caso).
    if (stateRef.current.phase !== "idle") return;
    const newState: TimerState = {
      subjectId,
      phase: "work",
      remainingSeconds: workMinutes * 60,
      phaseTotalSeconds: workMinutes * 60,
      runningSince: Date.now(),
      cycleCount: stateRef.current.cycleCount,
    };
    setState(newState);
    await saveTimerState(newState);
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
    const remaining = computeDisplaySeconds(s);
    const studied = s.phaseTotalSeconds - remaining;

    if (s.phase === "work") {
      if (s.subjectId !== null && studied >= MIN_LOGGABLE_SECONDS) {
        await logSession(s.subjectId, now, studied);
        await refreshToday();
      }
      setState(IDLE_STATE);
      await saveTimerState(IDLE_STATE);
    } else {
      // Salta pausa: nessun log (le pause non sono tempo di studio),
      // si riparte subito con un nuovo "work" sulla stessa materia.
      const newState: TimerState = {
        subjectId: s.subjectId,
        phase: "work",
        remainingSeconds: workMinutes * 60,
        phaseTotalSeconds: workMinutes * 60,
        runningSince: now,
        cycleCount: s.cycleCount,
      };
      setState(newState);
      await saveTimerState(newState);
    }
  }

  async function addSubjectHandler(name: string): Promise<AddSubjectResult> {
    const trimmed = name.trim();
    if (!trimmed) return "empty";
    if (subjects.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) return "duplicate";
    try {
      await addSubjectDb(trimmed);
      setSubjects(await listSubjects());
      return "ok";
    } catch (error) {
      console.error("Errore nell'aggiunta della materia:", error);
      return "error";
    }
  }

  async function removeSubjectHandler(id: number) {
    await deleteSubjectDb(id);
    setSubjects(await listSubjects());
    await refreshToday();
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
        subjects,
        todayBySubject,
        startWork,
        pause,
        resume,
        stopOrSkip,
        addSubject: addSubjectHandler,
        removeSubject: removeSubjectHandler,
      }}
    >
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer deve essere usato dentro <TimerProvider>");
  return ctx;
}
