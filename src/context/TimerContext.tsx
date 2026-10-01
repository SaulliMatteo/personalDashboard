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
} from "../database/studyRepository";
import { useSettings } from "./SettingContext";
import { initializeDatabase } from "../database/db";

// Sotto questa soglia una sessione non viene registrata: evita di
// riempire lo storico di sessioni da 1-2 secondi per avvii accidentali
// seguiti da uno stop immediato.
const MIN_LOGGABLE_SECONDS = 10;

// Fallback usati solo se le impostazioni non sono ancora state caricate
// (finestra molto breve all'avvio): gli stessi valori di default di
// settingRepository.ts, duplicati qui per non creare una dipendenza
// circolare tra i due file solo per tre numeri.
const FALLBACK_WORK_MINUTES = 25;
const FALLBACK_SHORT_BREAK_MINUTES = 5;
const FALLBACK_LONG_BREAK_MINUTES = 15;
const FALLBACK_CYCLES_BEFORE_LONG_BREAK = 4;

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
  /** Ferma la fase di lavoro corrente (registra la sessione parziale) oppure salta la pausa corrente (nessun log). */
  stopOrSkip: () => Promise<void>;
  addSubject: (name: string) => Promise<void>;
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

  const workMinutes = settings?.pomodoroWorkMinutes ?? FALLBACK_WORK_MINUTES;
  const shortBreakMinutes = settings?.pomodoroShortBreakMinutes ?? FALLBACK_SHORT_BREAK_MINUTES;
  const longBreakMinutes = settings?.pomodoroLongBreakMinutes ?? FALLBACK_LONG_BREAK_MINUTES;
  const cyclesBeforeLongBreak = Math.max(
    1,
    settings?.pomodoroCyclesBeforeLongBreak ?? FALLBACK_CYCLES_BEFORE_LONG_BREAK
  );

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<TimerState>(IDLE_STATE);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [todayBySubject, setTodayBySubject] = useState<Record<number, number>>({});
  const [, forceTick] = useState(0);

  // Ref sempre allineato all'ultimo stato: serve per leggerlo dentro il
  // setInterval e nelle callback async senza richiudere l'effect ogni
  // volta che lo stato cambia.
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

  // Caricamento iniziale: stato del timer (per riprendere un pomodoro
  // lasciato in corso), elenco materie, tempo studiato oggi.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      // Non possiamo assumere che LayoutProvider (più in alto nell'albero)
      // abbia già creato le tabelle solo perché lo racchiude: React esegue
      // gli effect dei figli PRIMA di quelli dei genitori, quindi il
      // nostro effect potrebbe partire prima che initializeDatabase() lì
      // sia stato anche solo avviato. Chiamarla di nuovo qui è sicura
      // (CREATE TABLE IF NOT EXISTS / INSERT OR IGNORE sono idempotenti)
      // e garantisce l'ordine corretto senza dipendere da assunzioni
      // sull'albero dei componenti.
      await initializeDatabase();

      const [loadedState, loadedSubjects] = await Promise.all([loadTimerState(), listSubjects()]);
      if (cancelled) return;
      setState(loadedState);
      setSubjects(loadedSubjects);
      await refreshToday();
      if (!cancelled) setReady(true);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh periodico di "studiato oggi": copre anche il caso in cui
  // l'app resti aperta a cavallo della mezzanotte.
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

  async function completePhaseNaturally() {
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
    }
    playChime();
  }

  // Tick di visualizzazione (ogni secondo, solo mentre il timer corre) +
  // rilevamento del momento in cui una fase finisce da sola.
  useEffect(() => {
    if (state.runningSince === null) return;
    const interval = setInterval(() => {
      const live = computeDisplaySeconds(stateRef.current);
      if (live <= 0) {
        completePhaseNaturally();
      } else {
        forceTick((t) => t + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.runningSince, state.phase]);

  async function startWork(subjectId: number) {
    // Un solo timer alla volta: se una fase è già attiva va prima
    // fermata/saltata (vedi stopOrSkip). Qui è solo un backstop difensivo,
    // la UI disabilita già i pulsanti di avvio in quel caso.
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
    saveTimerState(newState);
  }

  function resume() {
    const s = stateRef.current;
    if (s.phase === "idle" || s.runningSince !== null) return;
    const newState: TimerState = { ...s, runningSince: Date.now() };
    setState(newState);
    saveTimerState(newState);
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
      // Salta pausa: nessun log (le pause non sono tempo di studio), si
      // riparte subito con un nuovo "work" sulla stessa materia.
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

  async function addSubjectHandler(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await addSubjectDb(trimmed);
    setSubjects(await listSubjects());
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
