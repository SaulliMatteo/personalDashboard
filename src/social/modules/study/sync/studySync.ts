import { retryDelayMs } from "../../../../core/cloud/backoff";
import type { StudyDayTotal } from "../../../../core/cloud/studyTotalsApi";
import { dailyTotals, syncDays, type SessionSpan } from "./plan";

/** Ogni quanto si rimanda comunque (copre il cambio di giorno e le sessioni registrate da altri widget). */
export const PERIODIC_SYNC_MS = 15 * 60_000;

/** Come è andato l'ultimo tentativo: lo legge chi lo vuole mostrare. */
export type SyncFailure = "unreachable" | "auth" | "other";

export type StudySyncState =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "synced"; at: number }
  /** non riuscito: si riprova da soli a `retryAt` */
  | { kind: "failed"; reason: Exclude<SyncFailure, "auth">; retryAt: number };

/** Tutto ciò che tocca DB, rete e orologio arriva da fuori: così si prova senza app (scripts/gruppi). */
export interface StudySyncDeps {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  loadSessions: (start: number, end: number) => Promise<SessionSpan[]>;
  loadLastSync: () => Promise<number | null>;
  saveLastSync: (at: number) => Promise<void>;
  /** Registra il dispositivo sul server (una volta per istanza, prima del primo invio). */
  registerDevice: () => Promise<void>;
  upload: (totals: StudyDayTotal[]) => Promise<void>;
  classifyError: (error: unknown) => SyncFailure;
  /** Sessione non più valida: ci pensa l'account (esce e si ferma tutto). */
  onAuthError: () => void;
  onState?: (state: StudySyncState) => void;
}

/**
 * Invio dei totali di studio di questo computer: uno alla volta, rimandato se ne arriva un altro mentre
 * gira, ritentato con attesa crescente se il servizio non risponde.
 */
export class StudySync {
  private timer: unknown = null;
  private running = false;
  private pending = false;
  private stopped = false;
  private failures = 0;
  private deviceReady = false;
  /** quando scatta il timer in programma (null = nessuno) */
  private nextAt: number | null = null;
  private readonly deps: StudySyncDeps;

  constructor(deps: StudySyncDeps) {
    this.deps = deps;
  }

  /** Chiede un invio tra `delayMs` (anticipa quello già in programma, se è più lontano). */
  request(delayMs = 0): void {
    if (this.stopped) return;
    if (this.running) {
      this.pending = true;
      return;
    }
    this.schedule(delayMs);
  }

  /** Torna la rete: si riparte da zero con le attese. */
  retryNow(): void {
    this.failures = 0;
    this.request(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number): void {
    const at = this.deps.now() + delayMs;
    if (this.timer !== null) {
      if (this.nextAt !== null && this.nextAt <= at) return;
      this.deps.clearTimer(this.timer);
    }
    this.nextAt = at;
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      this.nextAt = null;
      void this.run();
    }, delayMs);
  }

  private setState(state: StudySyncState): void {
    if (!this.stopped) this.deps.onState?.(state);
  }

  private async run(): Promise<void> {
    if (this.stopped) return;
    this.running = true;
    this.setState({ kind: "syncing" });
    const startedAt = this.deps.now();
    let next = PERIODIC_SYNC_MS;
    try {
      const days = syncDays(new Date(startedAt), await this.deps.loadLastSync());
      const sessions = await this.deps.loadSessions(days[0].start, days[days.length - 1].end);
      if (!this.deviceReady) {
        await this.deps.registerDevice();
        this.deviceReady = true;
      }
      await this.deps.upload(dailyTotals(days, sessions));
      // l'inizio del tentativo: ciò che si è registrato durante l'invio rientra nel prossimo
      await this.deps.saveLastSync(startedAt);
      this.failures = 0;
      this.setState({ kind: "synced", at: startedAt });
    } catch (error) {
      const reason = this.deps.classifyError(error);
      if (reason === "auth") {
        this.running = false;
        this.stop();
        this.deps.onAuthError();
        return;
      }
      next = retryDelayMs(this.failures);
      this.failures += 1;
      this.setState({ kind: "failed", reason, retryAt: this.deps.now() + next });
    }
    this.running = false;
    if (this.stopped) return;
    if (this.pending && this.failures === 0) {
      this.pending = false;
      this.schedule(0);
    } else {
      this.pending = false;
      this.schedule(next);
    }
  }
}
