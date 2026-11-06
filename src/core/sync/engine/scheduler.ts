import { retryDelayMs } from "../../cloud/backoff";

/** Ogni quanto si fa comunque un giro (arrivi dagli altri dispositivi con l'app aperta). */
export const PERIODIC_SYNC_MS = 5 * 60_000;

export type SyncFailure = "unreachable" | "auth" | "other";

export interface SchedulerDeps {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** Un giro intero (pull + push). */
  run: () => Promise<void>;
  classifyError: (error: unknown) => SyncFailure;
  onAuthError: () => void;
  onRunning?: () => void;
  onSuccess?: (at: number) => void;
  onFailure?: (reason: Exclude<SyncFailure, "auth">, retryAt: number) => void;
}

/**
 * Quando fare i giri di sync: uno alla volta, rimandato se ne serve un altro mentre gira, con attesa crescente se il
 * servizio non risponde (le richieste durante l'attesa non la accorciano: solo `retryNow`). Puro, come StudySync dei
 * Gruppi: orologio e timer arrivano da fuori.
 */
export class SyncScheduler {
  private timer: unknown = null;
  private nextAt: number | null = null;
  private running = false;
  private pending = false;
  private stopped = false;
  private failures = 0;
  private retryAt = 0;
  private readonly deps: SchedulerDeps;

  constructor(deps: SchedulerDeps) {
    this.deps = deps;
  }

  request(delayMs = 0): void {
    if (this.stopped) return;
    if (this.running) {
      this.pending = true;
      return;
    }
    const wait = this.failures > 0 ? Math.max(delayMs, this.retryAt - this.deps.now()) : delayMs;
    this.schedule(Math.max(0, wait));
  }

  retryNow(): void {
    this.failures = 0;
    this.retryAt = 0;
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
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    this.running = true;
    this.deps.onRunning?.();
    let next = PERIODIC_SYNC_MS;
    try {
      await this.deps.run();
      this.failures = 0;
      this.retryAt = 0;
      if (!this.stopped) this.deps.onSuccess?.(this.deps.now());
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
      this.retryAt = this.deps.now() + next;
      if (!this.stopped) this.deps.onFailure?.(reason, this.retryAt);
    }
    this.running = false;
    if (this.stopped) return;
    const again = this.pending && this.failures === 0;
    this.pending = false;
    this.schedule(again ? 0 : next);
  }
}
