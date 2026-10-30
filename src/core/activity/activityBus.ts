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

/**
 * Il timer di Studio così com'è adesso, per chi deve ricostruirlo altrove (i Gruppi lo mandano ai compagni).
 * Tempi in ms dell'orologio LOCALE. Cambia oggetto solo quando cambia lo stato, mai a ogni secondo.
 */
export interface StudyTimerSnapshot {
  phase: "work" | "break";
  mode: "pomodoro" | "stopwatch";
  /** Da quando la fase scorre; null = in pausa. */
  runningSince: number | null;
  /** Durata nominale della fase (0 nel cronometro). */
  phaseTotalSeconds: number;
  /** Secondi già fatti nella fase prima di runningSince. */
  accumulatedSeconds: number;
  /** Quando è cambiato l'ultima volta lo stato (avvio, pausa, ripresa, nuova fase). */
  changedAt: number;
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
  /** La pagina di un video del widget YouTube è aperta ma il video è fermo. */
  videoPaused: boolean;
  /** Punto del video del widget YouTube, 0..1 (null = nessun video aperto o durata ignota). */
  videoProgress: number | null;
  /** Durata del video del widget YouTube aperto, in secondi (null = ignota). */
  videoDurationSeconds: number | null;
  /** Nome della materia del timer di Studio avviato (null = nessuna). */
  studySubjectName: string | null;
  /** Temperatura attuale del widget Meteo, in °C (null = meteo spento o non ancora arrivato). */
  weatherTemperature: number | null;
  /** Secondi di studio registrati oggi (sessioni concluse). Li usano intestazione e barra laterale. */
  studyTodaySeconds: number;
  /** Sessioni di studio concluse oggi, in ordine di tempo (linea "La tua giornata"). */
  studyTodaySpans: readonly StudySpan[];
  /** Timer di Studio avviato (anche in pausa); null = fermo. */
  studyTimer: StudyTimerSnapshot | null;
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
  videoPaused: false,
  videoProgress: null,
  videoDurationSeconds: null,
  studySubjectName: null,
  weatherTemperature: null,
  studyTodaySeconds: 0,
  studyTodaySpans: [],
  studyTimer: null,
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
