import type { TimerState } from "../data/studyRepository";

/**
 * Passaggi di fase del pomodoro, puri (niente orologio né DB): `now` lo passa chi chiama. Servono a due cose:
 *  - recuperare al rientro: con l'app congelata (telefono a schermo spento, portatile in sospensione) il tick non
 *    gira, e al ritorno vanno chiuse tutte le fasi finite nel frattempo, con i loro orari veri;
 *  - sapere in anticipo quando finiranno le prossime fasi, per pianificare le notifiche (Android).
 * Prova: scripts/study/phases.test.mts.
 */

export interface PhaseTimings {
  workSeconds: number;
  shortBreakSeconds: number;
  longBreakSeconds: number;
  cyclesBeforeLongBreak: number;
}

export interface PhaseEnd {
  /** pomodoroDone: finito lo studio; breakOver: finita la pausa. */
  kind: "pomodoroDone" | "breakOver";
  /** Istante (ms) in cui la fase è finita (o finirà). */
  at: number;
  /** La fase che finisce e quella che comincia. */
  from: TimerState;
  to: TimerState;
}

export const IDLE_TIMER: TimerState = {
  subjectId: null,
  phase: "idle",
  remainingSeconds: 0,
  phaseTotalSeconds: 0,
  runningSince: null,
  cycleCount: 0,
};

/** Cronometro: fase "work" con durata nominale 0, non finisce mai da sola. */
export function isStopwatch(s: TimerState): boolean {
  return s.phase === "work" && s.phaseTotalSeconds === 0;
}

/** Quando finisce la fase in corso (ms), o null se è ferma, è un cronometro o non c'è. */
export function phaseEndAt(s: TimerState): number | null {
  if (s.phase === "idle" || s.runningSince === null || isStopwatch(s)) return null;
  return s.runningSince + Math.max(0, s.remainingSeconds) * 1000;
}

/**
 * La fase che segue `s`, finita all'istante `at`. Dopo lo studio la pausa (lunga ogni `cyclesBeforeLongBreak`
 * pomodori), dopo la pausa di nuovo studio sulla stessa materia. Con `autoStart` la nuova fase parte proprio da `at`,
 * altrimenti resta ferma. null = studio senza materia (es. cancellata): si torna a riposo senza nessun avviso.
 */
export function nextPhase(s: TimerState, t: PhaseTimings, autoStart: boolean, at: number): PhaseEnd | null {
  const runningSince = autoStart ? at : null;
  if (s.phase === "work") {
    if (s.subjectId === null) return null;
    const cycleCount = s.cycleCount + 1;
    const isLong = cycleCount % Math.max(1, t.cyclesBeforeLongBreak) === 0;
    const seconds = isLong ? t.longBreakSeconds : t.shortBreakSeconds;
    const to: TimerState = {
      subjectId: s.subjectId,
      phase: isLong ? "long_break" : "short_break",
      remainingSeconds: seconds,
      phaseTotalSeconds: seconds,
      runningSince,
      cycleCount,
    };
    return { kind: "pomodoroDone", at, from: s, to };
  }
  if (s.phase === "short_break" || s.phase === "long_break") {
    const to: TimerState = {
      subjectId: s.subjectId,
      phase: "work",
      remainingSeconds: t.workSeconds,
      phaseTotalSeconds: t.workSeconds,
      runningSince,
      cycleCount: s.cycleCount,
    };
    return { kind: "breakOver", at, from: s, to };
  }
  return null;
}

/** Oltre questo numero di fasi di fila ci si ferma (difesa da durate assurde: ogni fase dura almeno un secondo). */
const MAX_STEPS = 10_000;

/**
 * Porta lo stato all'istante `now`: chiude in ordine tutte le fasi finite (anche più di una se le fasi partono da
 * sole) e dice quali sono finite. Se nulla è finito restituisce `s` così com'è.
 */
export function advanceTo(s: TimerState, t: PhaseTimings, autoStart: boolean, now: number): { state: TimerState; ends: PhaseEnd[] } {
  const ends: PhaseEnd[] = [];
  let state = s;
  for (let i = 0; i < MAX_STEPS; i++) {
    const at = phaseEndAt(state);
    if (at === null || at > now) break;
    const end = nextPhase(state, t, autoStart, at);
    if (end === null) {
      state = IDLE_TIMER;
      break;
    }
    ends.push(end);
    state = end.to;
  }
  return { state, ends };
}

/**
 * Le prossime `limit` fine fase a partire da `s`, per pianificarle: una sola se le fasi non partono da sole
 * (la successiva aspetta un tocco), altrimenti la catena.
 */
export function upcomingEnds(s: TimerState, t: PhaseTimings, autoStart: boolean, limit: number): PhaseEnd[] {
  const ends: PhaseEnd[] = [];
  let state = s;
  while (ends.length < limit) {
    const at = phaseEndAt(state);
    if (at === null) break;
    const end = nextPhase(state, t, autoStart, at);
    if (end === null) break;
    ends.push(end);
    state = end.to;
  }
  return ends;
}
