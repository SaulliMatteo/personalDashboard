import { retryDelayMs } from "../../core/cloud/backoff";
import type { PresenceChannel, PresenceChannelStatus, PresenceListeners } from "../../core/cloud/presence";

/*
 * I canali di presenza di un modulo, uno per gruppo, qualunque cosa mandino: entra ed esce quando cambiano i
 * gruppi, manda il proprio stato solo quando cambia (e appena entrato, al massimo una volta ogni
 * `minTrackIntervalMs`), rientra da solo con attese crescenti se un canale cade. Cosa si manda e come si legge
 * lo decide il modulo con un `PresenceCodec`.
 * Puro: canali, orologio e timer arrivano da fuori (lo prova scripts/gruppi/presence.test.mts).
 */

export type ChannelState = "joining" | "joined" | "error";

export interface PresenceSnapshot<P> {
  /** gruppo → utente → stato (validato). Chi non è nel canale non c'è: offline. */
  members: Record<string, Record<string, P>>;
  channels: Record<string, ChannelState>;
}

export interface PresenceCodec<L, P> {
  /** Il proprio payload per un gruppo, dallo stato locale; `offsetMs` porta l'ora locale a quella del server. */
  build: (local: L, groupId: string, offsetMs: number) => P;
  /** Lo stato di un canale validato: utente → payload (chi non ne ha di validi non compare). */
  parse: (raw: Record<string, unknown[]>, serverNow: number) => Record<string, P>;
}

export interface PresenceHubDeps<P> {
  now: () => number;
  join: (groupId: string, listeners: PresenceListeners) => PresenceChannel;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  onChange: (snapshot: PresenceSnapshot<P>) => void;
}

export interface PresenceHubOptions {
  /** Distanza minima tra due invii nello stesso canale (0 = subito): l'ultimo stato parte comunque, dopo. */
  minTrackIntervalMs?: number;
}

interface GroupChannel {
  /** null solo per un attimo, mentre si entra */
  channel: PresenceChannel | null;
  state: ChannelState;
  raw: Record<string, unknown[]>;
  /** ultimo payload mandato (JSON), per non rimandare lo stesso */
  sent: string | null;
  /** quando è partito l'ultimo invio (ora locale) */
  sentAt: number;
  /** invio rimandato per rispettare minTrackIntervalMs */
  pending: unknown;
  failures: number;
  retry: unknown;
}

export class PresenceHub<L, P> {
  private readonly deps: PresenceHubDeps<P>;
  private readonly codec: PresenceCodec<L, P>;
  private readonly minIntervalMs: number;
  private readonly groups = new Map<string, GroupChannel>();
  private offsetMs = 0;
  private local: L;
  private stopped = false;

  constructor(deps: PresenceHubDeps<P>, codec: PresenceCodec<L, P>, initial: L, options: PresenceHubOptions = {}) {
    this.deps = deps;
    this.codec = codec;
    this.local = initial;
    this.minIntervalMs = options.minTrackIntervalMs ?? 0;
  }

  serverNow(): number {
    return this.deps.now() + this.offsetMs;
  }

  setOffset(offsetMs: number): void {
    this.offsetMs = offsetMs;
    for (const groupId of this.groups.keys()) this.trackIfChanged(groupId);
    this.emit();
  }

  /** I gruppi in cui stare (quelli con il modulo attivo). */
  setGroups(groupIds: string[]): void {
    if (this.stopped) return;
    const wanted = new Set(groupIds);
    for (const groupId of [...this.groups.keys()]) if (!wanted.has(groupId)) this.leave(groupId);
    for (const groupId of wanted) if (!this.groups.has(groupId)) this.join(groupId);
    this.emit();
  }

  getLocal(): L {
    return this.local;
  }

  setLocal(local: L): void {
    this.local = local;
    for (const groupId of this.groups.keys()) this.trackIfChanged(groupId);
  }

  stop(): void {
    this.stopped = true;
    for (const groupId of [...this.groups.keys()]) this.leave(groupId);
  }

  /** Il payload per un gruppo, come verrebbe mandato adesso. */
  payloadFor(groupId: string): P {
    return this.codec.build(this.local, groupId, this.offsetMs);
  }

  private join(groupId: string): void {
    const entry: GroupChannel = {
      channel: null,
      state: "joining",
      raw: {},
      sent: null,
      sentAt: -Infinity,
      pending: null,
      failures: this.groups.get(groupId)?.failures ?? 0,
      retry: null,
    };
    this.groups.set(groupId, entry);
    entry.channel = this.deps.join(groupId, {
      sync: (raw) => {
        if (this.groups.get(groupId) !== entry) return;
        entry.raw = raw;
        this.emit();
      },
      status: (status) => this.onStatus(groupId, entry, status),
    });
  }

  private onStatus(groupId: string, entry: GroupChannel, status: PresenceChannelStatus): void {
    if (this.stopped || this.groups.get(groupId) !== entry) return;
    if (status === "joined") {
      entry.state = "joined";
      entry.failures = 0;
      entry.sent = null; // appena entrati si manda sempre
      this.trackIfChanged(groupId);
    } else if (entry.state !== "error") {
      // canale caduto (rete, token scaduto, accesso negato): si esce e si riprova più tardi
      entry.state = "error";
      entry.raw = {};
      this.cancelPending(entry);
      void entry.channel?.leave().catch(() => {});
      const delay = retryDelayMs(entry.failures);
      entry.failures += 1;
      entry.retry = this.deps.setTimer(() => {
        if (this.stopped || this.groups.get(groupId) !== entry) return;
        this.join(groupId);
        this.emit();
      }, delay);
    }
    this.emit();
  }

  private leave(groupId: string): void {
    const entry = this.groups.get(groupId);
    if (!entry) return;
    this.groups.delete(groupId);
    if (entry.retry !== null) this.deps.clearTimer(entry.retry);
    this.cancelPending(entry);
    void entry.channel?.leave().catch(() => {});
  }

  private cancelPending(entry: GroupChannel): void {
    if (entry.pending === null) return;
    this.deps.clearTimer(entry.pending);
    entry.pending = null;
  }

  private trackIfChanged(groupId: string): void {
    const entry = this.groups.get(groupId);
    if (!entry || entry.state !== "joined" || !entry.channel || entry.pending !== null) return;
    const payload = this.payloadFor(groupId);
    const json = JSON.stringify(payload);
    if (json === entry.sent) return;
    const wait = entry.sentAt + this.minIntervalMs - this.deps.now();
    if (wait > 0) {
      // troppo presto: parte l'ultimo stato quando si può
      entry.pending = this.deps.setTimer(() => {
        if (this.groups.get(groupId) !== entry) return;
        entry.pending = null;
        this.trackIfChanged(groupId);
      }, wait);
      return;
    }
    entry.sent = json;
    entry.sentAt = this.deps.now();
    void entry.channel.track(payload as unknown as Record<string, unknown>).catch(() => {
      // non mandato: si riprova al prossimo cambio o al rientro nel canale
      if (this.groups.get(groupId) === entry) entry.sent = null;
    });
  }

  private emit(): void {
    if (this.stopped) return;
    const serverNow = this.serverNow();
    const members: PresenceSnapshot<P>["members"] = {};
    const channels: PresenceSnapshot<P>["channels"] = {};
    for (const [groupId, entry] of this.groups) {
      channels[groupId] = entry.state;
      members[groupId] = this.codec.parse(entry.raw, serverNow);
    }
    this.deps.onChange({ members, channels });
  }
}
