import type { StudyTimerSnapshot } from "../../../../core/activity/activityBus";

/*
 * Il messaggio di presenza del modulo Studio (versione 1) e la sua validazione. Puro: l'ora e lo scarto
 * dell'orologio arrivano da fuori (lo prova scripts/gruppi/presence.test.mts).
 *
 * Tutti gli istanti sono in ms dell'orologio del SERVER: chi invia converte (locale + scarto), chi riceve
 * calcola i secondi con la sua stima dell'ora del server. Chi riceve una versione che non conosce la ignora:
 * gli amici aggiornano l'app in momenti diversi.
 */

export const PRESENCE_VERSION = 1;

/** Posti di una sala della stanza comune; con al massimo 30 membri bastano 4 sale. */
export const ROOM_SEATS = 8;
export const MAX_ROOMS = 4;

/** Lunghezza massima del nome della materia mandato ai compagni. */
export const SUBJECT_MAX_LENGTH = 40;

const DAY_MS = 86_400_000;
const MAX_PHASE_SECONDS = 86_400;

export interface StudyPresence {
  v: 1;
  /** idle = app aperta e connessa, timer fermo (online, fuori dalla stanza). */
  phase: "idle" | "work" | "break";
  mode: "pomodoro" | "stopwatch";
  /** Da quando la fase scorre (ora del server); null = in pausa o fermo. */
  runningSince: number | null;
  phaseTotalSeconds: number;
  /** Secondi già fatti nella fase prima di runningSince. */
  accumulatedSeconds: number;
  /** Quando è cambiato lo stato l'ultima volta (ora del server): "in pausa da…". */
  changedAt: number;
  /** Solo se l'utente ha scelto di mostrarla. */
  subject?: string;
  /** Sala scelta nella stanza comune (0..MAX_ROOMS-1); assente = riempimento automatico. */
  room?: number;
}

export interface BuildOptions {
  /** Ora del server ≈ ora locale + offsetMs. */
  offsetMs: number;
  /** Ora locale adesso: vale come "cambiato adesso" quando il timer è fermo. */
  now: number;
  /** Nome della materia, già filtrato dall'impostazione (null = non mostrarla). */
  subject: string | null;
  room: number | null;
}

function cleanSubject(subject: string | null): string | undefined {
  const text = subject?.trim();
  if (!text) return undefined;
  return text.length > SUBJECT_MAX_LENGTH ? text.slice(0, SUBJECT_MAX_LENGTH) : text;
}

function validRoom(room: unknown): room is number {
  return typeof room === "number" && Number.isInteger(room) && room >= 0 && room < MAX_ROOMS;
}

/** Il proprio stato da mandare, dal timer del bus (ora locale) convertito all'ora del server. */
export function buildPresence(timer: StudyTimerSnapshot | null, options: BuildOptions): StudyPresence {
  const toServer = (ms: number) => Math.round(ms + options.offsetMs);
  const base: StudyPresence = timer
    ? {
        v: 1,
        phase: timer.phase,
        mode: timer.mode,
        runningSince: timer.runningSince === null ? null : toServer(timer.runningSince),
        phaseTotalSeconds: timer.phaseTotalSeconds,
        accumulatedSeconds: timer.accumulatedSeconds,
        changedAt: toServer(timer.changedAt),
      }
    : {
        v: 1,
        phase: "idle",
        mode: "pomodoro",
        runningSince: null,
        phaseTotalSeconds: 0,
        accumulatedSeconds: 0,
        changedAt: toServer(options.now),
      };
  // la materia ha senso solo mentre si studia
  const subject = timer?.phase === "work" ? cleanSubject(options.subject) : undefined;
  if (subject) base.subject = subject;
  if (validRoom(options.room)) base.room = options.room;
  return base;
}

function isSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_PHASE_SECONDS;
}

function isNearServerTime(value: unknown, serverNow: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value - serverNow) <= DAY_MS;
}

/**
 * Un payload ricevuto, controllato campo per campo; null se non è valido o è di un'altra versione.
 * Campi in più vengono scartati: si tiene solo ciò che conosciamo.
 */
export function parsePresence(raw: unknown, serverNow: number): StudyPresence | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (p.v !== PRESENCE_VERSION) return null;
  if (p.phase !== "idle" && p.phase !== "work" && p.phase !== "break") return null;
  if (p.mode !== "pomodoro" && p.mode !== "stopwatch") return null;
  if (!isSeconds(p.phaseTotalSeconds) || !isSeconds(p.accumulatedSeconds)) return null;
  if (p.runningSince !== null && !isNearServerTime(p.runningSince, serverNow)) return null;
  if (p.phase === "idle" && p.runningSince !== null) return null;
  // changedAt: anche vecchio (app aperta da giorni col timer fermo), ma non nel futuro
  if (typeof p.changedAt !== "number" || !Number.isFinite(p.changedAt) || p.changedAt - serverNow > DAY_MS) return null;
  if (p.subject !== undefined && (typeof p.subject !== "string" || p.subject.length > SUBJECT_MAX_LENGTH)) return null;
  if (p.room !== undefined && !validRoom(p.room)) return null;

  const presence: StudyPresence = {
    v: 1,
    phase: p.phase,
    mode: p.mode,
    runningSince: p.runningSince as number | null,
    phaseTotalSeconds: p.phaseTotalSeconds,
    accumulatedSeconds: p.accumulatedSeconds,
    changedAt: p.changedAt,
  };
  const subject = typeof p.subject === "string" ? p.subject.trim() : "";
  if (subject && p.phase === "work") presence.subject = subject;
  if (validRoom(p.room)) presence.room = p.room;
  return presence;
}

/** Quanto "conta" uno stato quando lo stesso utente ha più dispositivi connessi. */
function rank(p: StudyPresence): number {
  if (p.phase === "work") return p.runningSince !== null ? 3 : 2;
  return p.phase === "break" ? 1 : 0;
}

/** Lo stato di un utente dai payload dei suoi dispositivi: vince chi studia, a pari merito il più recente. */
export function mergeDevices(entries: unknown[], serverNow: number): StudyPresence | null {
  let best: StudyPresence | null = null;
  for (const entry of entries) {
    const p = parsePresence(entry, serverNow);
    if (!p) continue;
    if (!best || rank(p) > rank(best) || (rank(p) === rank(best) && p.changedAt > best.changedAt)) best = p;
  }
  return best;
}

/** Tutto lo stato di un canale: utente → stato (gli utenti senza payload validi non compaiono). */
export function parseChannelState(state: Record<string, unknown[]>, serverNow: number): Record<string, StudyPresence> {
  const members: Record<string, StudyPresence> = {};
  for (const [userId, entries] of Object.entries(state)) {
    const merged = mergeDevices(entries, serverNow);
    if (merged) members[userId] = merged;
  }
  return members;
}

/** Secondi trascorsi nella fase in corso (studio o pausa del pomodoro). */
export function phaseElapsedSeconds(p: StudyPresence, serverNow: number): number {
  if (p.phase === "idle") return 0;
  const running = p.runningSince === null ? 0 : Math.max(0, Math.floor((serverNow - p.runningSince) / 1000));
  const elapsed = p.accumulatedSeconds + running;
  return p.mode === "pomodoro" && p.phaseTotalSeconds > 0 ? Math.min(p.phaseTotalSeconds, elapsed) : elapsed;
}

/**
 * Secondi di studio della sessione in corso non ancora salvati nei totali: si sommano a oggi e alla
 * settimana nella classifica live. Le pause non contano.
 */
export function unsavedStudySeconds(p: StudyPresence, serverNow: number): number {
  return p.phase === "work" ? phaseElapsedSeconds(p, serverNow) : 0;
}

export type PresenceKind = "studying" | "paused" | "break" | "online";

/** Come mostrarlo: studia, in pausa (timer fermato a metà), pausa del pomodoro, connesso col timer fermo. */
export function presenceKind(p: StudyPresence): PresenceKind {
  if (p.phase === "work") return p.runningSince !== null ? "studying" : "paused";
  return p.phase === "break" ? "break" : "online";
}
