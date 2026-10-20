import { useSyncExternalStore } from "react";

/**
 * Bacheca delle ATTIVITÀ dell'app: i widget pubblicano cosa sta succedendo
 * (sto studiando, sto guardando un video, è finito un pomodoro…) e chi è
 * interessato (es. il Companion) ascolta, senza che un widget importi l'altro.
 *
 * Due concetti distinti:
 *  - lo STATO: cosa è vero adesso (si sovrascrive, una chiave per fonte);
 *  - gli EVENTI: momenti puntuali (non restano, chi non ascolta li perde).
 *
 * Solo memoria: niente DB, niente rete.
 */

/** Una sessione di studio conclusa oggi, in millisecondi epoch. */
export interface StudySpan {
  start: number;
  end: number;
}

export interface ActivityStatus {
  /** Timer di Studio in fase di lavoro E in corsa. */
  studying: boolean;
  /** Timer di Studio avviato ma in pausa. */
  studyPaused: boolean;
  /** Pausa del pomodoro in corsa. */
  onBreak: boolean;
  /** Un video del widget YouTube in riproduzione. */
  watchingVideo: boolean;
  /** Secondi di studio registrati oggi (sessioni concluse). Li usano intestazione e barra laterale. */
  studyTodaySeconds: number;
  /** Sessioni di studio concluse oggi, in ordine di tempo (linea "La tua giornata"). */
  studyTodaySpans: readonly StudySpan[];
}

export type ActivityEvent =
  | { type: "studyStarted" }
  | { type: "studyStopped"; seconds: number }
  | { type: "pomodoroDone" }
  | { type: "breakOver" }
  | { type: "goalReached" }
  | { type: "videoEnded" }
  | { type: "fileReceived"; count: number };

const IDLE: ActivityStatus = {
  studying: false,
  studyPaused: false,
  onBreak: false,
  watchingVideo: false,
  studyTodaySeconds: 0,
  studyTodaySpans: [],
};

let status: ActivityStatus = IDLE;
const statusListeners = new Set<() => void>();
const eventListeners = new Set<(event: ActivityEvent) => void>();

/** Aggiorna una parte dello stato. Se non cambia nulla non notifica nessuno. */
export function publishActivity(patch: Partial<ActivityStatus>): void {
  let changed = false;
  for (const key of Object.keys(patch) as (keyof ActivityStatus)[]) {
    if (patch[key] !== undefined && patch[key] !== status[key]) changed = true;
  }
  if (!changed) return;
  status = { ...status, ...patch };
  for (const listener of statusListeners) listener();
}

export function getActivity(): ActivityStatus {
  return status;
}

export function subscribeActivity(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function emitActivityEvent(event: ActivityEvent): void {
  for (const listener of eventListeners) {
    try {
      listener(event);
    } catch (error) {
      // Un ascoltatore rotto non deve impedire agli altri di ricevere l'evento.
      console.error("Errore in un ascoltatore di attività:", error);
    }
  }
}

export function subscribeActivityEvents(listener: (event: ActivityEvent) => void): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

/** Stato corrente come hook React (si ri-renderizza solo quando cambia). */
export function useActivityStatus(): ActivityStatus {
  return useSyncExternalStore(subscribeActivity, getActivity, getActivity);
}
